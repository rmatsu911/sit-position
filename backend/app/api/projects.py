from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import accessible_project_ids, ensure_project_access, get_current_user, require_roles
from app.models import (
    ConstructionType,
    Department,
    Photo,
    Project,
    QualityCheck,
    User,
)
from app.schemas import ProjectCreate, ProjectOut, ProjectUpdate

router = APIRouter()

_OPEN_QUALITY = ("確認待ち", "情報不足", "未提出", "警告", "再撮影依頼")


def build_out(db: Session, p: Project) -> ProjectOut:
    ctype = db.get(ConstructionType, p.construction_type_id) if p.construction_type_id else None
    dept = db.get(Department, p.department_id) if p.department_id else None
    manager = db.get(User, p.manager_id) if p.manager_id else None
    unconfirmed = db.execute(
        select(func.count(Photo.id)).where(
            Photo.project_id == p.id, Photo.confirmation_status == "未確認", Photo.deleted_at.is_(None)
        )
    ).scalar_one()
    quality = db.execute(
        select(func.count(QualityCheck.id)).where(
            QualityCheck.project_id == p.id,
            QualityCheck.status.in_(_OPEN_QUALITY),
            QualityCheck.deleted_at.is_(None),
        )
    ).scalar_one()
    return ProjectOut(
        id=p.id,
        construction_number=p.construction_number,
        name=p.name,
        customer=p.customer,
        customer_type=p.customer_type,
        construction_type=ctype.name if ctype else None,
        area=p.area,
        location=p.location,
        department=dept.name if dept else None,
        manager=manager.name if manager else None,
        status=p.status,
        planned_progress=p.planned_progress,
        actual_progress=p.actual_progress,
        start_planned_at=p.start_planned_at,
        finish_planned_at=p.finish_planned_at,
        contract_amount=float(p.contract_amount) if p.contract_amount is not None else None,
        budget_planned=float(p.budget_planned) if p.budget_planned is not None else None,
        budget_used=float(p.budget_used) if p.budget_used is not None else None,
        unconfirmed_photos=unconfirmed,
        quality_checks=quality,
        updated_at=p.updated_at,
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = None,
) -> list[ProjectOut]:
    stmt = select(Project).where(Project.deleted_at.is_(None))
    allowed = accessible_project_ids(db, user)
    if allowed is not None:
        stmt = stmt.where(Project.id.in_(allowed or {-1}))
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Project.name.ilike(like) | Project.construction_number.ilike(like))
    stmt = stmt.order_by(Project.construction_number)
    return [build_out(db, p) for p in db.execute(stmt).scalars().all()]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ProjectOut:
    p = ensure_project_access(db, user, project_id)
    return build_out(db, p)


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> ProjectOut:
    exists = db.execute(
        select(Project).where(Project.construction_number == body.construction_number)
    ).scalar_one_or_none()
    if exists:
        raise HTTPException(status.HTTP_409_CONFLICT, "同じ工事番号の案件が既に存在します")
    p = Project(**body.model_dump())
    db.add(p)
    db.flush()
    write_audit(db, user, "CREATE", "project", p.id, project_id=p.id, after=body.model_dump())
    db.commit()
    db.refresh(p)
    return build_out(db, p)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> ProjectOut:
    p = ensure_project_access(db, user, project_id)
    before = {k: getattr(p, k) for k in body.model_dump(exclude_unset=True)}
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(p, k, v)
    write_audit(db, user, "UPDATE", "project", p.id, project_id=p.id, before=before, after=body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(p)
    return build_out(db, p)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> None:
    p = ensure_project_access(db, user, project_id)
    p.deleted_at = datetime.now(timezone.utc)
    p.deleted_by = user.id
    p.delete_reason = reason
    write_audit(db, user, "DELETE", "project", p.id, project_id=p.id)
    db.commit()
