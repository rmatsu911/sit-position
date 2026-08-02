from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import Material, ProjectMaterial, Task, User
from app.schemas import ProjectMaterialCreate, ProjectMaterialOut

router = APIRouter()


def to_out(db: Session, pm: ProjectMaterial) -> ProjectMaterialOut:
    m = db.get(Material, pm.material_id)
    task = db.get(Task, pm.task_id) if pm.task_id else None
    return ProjectMaterialOut(
        id=pm.id, project_id=pm.project_id, material_id=pm.material_id,
        name=m.name if m else "—", code=m.code if m else None, model_number=m.model_number if m else None,
        manufacturer=m.manufacturer if m else None, unit=m.unit if m else None,
        task_id=pm.task_id, task=task.name if task else None,
        qty_planned=float(pm.qty_planned) if pm.qty_planned is not None else None,
        qty_used=float(pm.qty_used) if pm.qty_used is not None else None,
        arrival_planned=pm.arrival_planned, arrival_actual=pm.arrival_actual, status=pm.status,
    )


@router.get("", response_model=list[ProjectMaterialOut])
def list_materials(
    project_id: int, task_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[ProjectMaterialOut]:
    ensure_project_access(db, user, project_id)
    stmt = select(ProjectMaterial).where(ProjectMaterial.project_id == project_id, ProjectMaterial.deleted_at.is_(None))
    if task_id is not None:
        stmt = stmt.where(ProjectMaterial.task_id == task_id)
    return [to_out(db, pm) for pm in db.execute(stmt.order_by(ProjectMaterial.id)).scalars().all()]


@router.post("", response_model=ProjectMaterialOut, status_code=status.HTTP_201_CREATED)
def create_material(
    body: ProjectMaterialCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> ProjectMaterialOut:
    ensure_project_access(db, user, body.project_id)
    # 既存資材マスタを code か name で探し、無ければ作成
    m = None
    if body.code:
        m = db.execute(select(Material).where(Material.code == body.code)).scalars().first()
    if not m:
        m = db.execute(select(Material).where(Material.name == body.name)).scalars().first()
    if not m:
        m = Material(code=body.code, name=body.name, model_number=body.model_number, manufacturer=body.manufacturer, unit=body.unit)
        db.add(m)
        db.flush()
    pm = ProjectMaterial(
        project_id=body.project_id, material_id=m.id, task_id=body.task_id,
        qty_planned=body.qty_planned, qty_used=body.qty_used,
        arrival_planned=body.arrival_planned, arrival_actual=body.arrival_actual, status=body.status,
    )
    db.add(pm)
    db.flush()
    write_audit(db, user, "CREATE", "project_material", pm.id, project_id=body.project_id, after={"name": body.name})
    db.commit()
    db.refresh(pm)
    return to_out(db, pm)


@router.put("/{pm_id}", response_model=ProjectMaterialOut)
def update_material(
    pm_id: int, body: ProjectMaterialCreate, db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> ProjectMaterialOut:
    pm = db.get(ProjectMaterial, pm_id)
    if not pm or pm.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "資材が見つかりません")
    ensure_project_access(db, user, pm.project_id)
    for k in ("task_id", "qty_planned", "qty_used", "arrival_planned", "arrival_actual", "status"):
        setattr(pm, k, getattr(body, k))
    write_audit(db, user, "UPDATE", "project_material", pm.id, project_id=pm.project_id)
    db.commit()
    db.refresh(pm)
    return to_out(db, pm)
