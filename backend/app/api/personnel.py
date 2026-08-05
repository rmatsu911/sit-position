import json

from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import (
    Company,
    Project,
    Qualification,
    Task,
    Team,
    User,
    Worker,
    WorkerAssignment,
    WorkerQualification,
)
from app.schemas import (
    AssignmentCheckRow,
    WorkerAssignmentCreate,
    WorkerAssignmentOut,
    WorkerDetailOut,
    WorkerOut,
    WorkerQualificationOut,
)

router = APIRouter()


def _schedule(w: Worker) -> list[str]:
    if not w.schedule:
        return []
    try:
        return json.loads(w.schedule)
    except (json.JSONDecodeError, TypeError):
        return []


def _licenses(db: Session, worker_id: int) -> list[str]:
    stmt = (
        select(Qualification.name)
        .join(WorkerQualification, WorkerQualification.qualification_id == Qualification.id)
        .where(WorkerQualification.worker_id == worker_id)
    )
    return list(db.execute(stmt).scalars().all())


def _assigned_to(db: Session, w: Worker) -> str | None:
    if w.status in ("待機", "休暇"):
        return w.status
    a = db.execute(
        select(WorkerAssignment).where(WorkerAssignment.worker_id == w.id).order_by(WorkerAssignment.id.desc())
    ).scalars().first()
    if a:
        proj = db.get(Project, a.project_id)
        return proj.name if proj else w.status
    return w.status


def _team_name(db: Session, w: Worker) -> str | None:
    if not w.team_id:
        return None
    t = db.get(Team, w.team_id)
    return t.name if t else None


def to_out(db: Session, w: Worker) -> WorkerOut:
    return WorkerOut(
        id=w.id, name=w.name, org=w.org, crew=_team_name(db, w), role=w.role,
        licenses=_licenses(db, w.id), assignedTo=_assigned_to(db, w), schedule=_schedule(w),
        status=w.status, continuousDays=w.continuous_days, vacation=w.vacation, note=w.note,
    )


@router.get("", response_model=list[WorkerOut])
def list_workers(
    project_id: int | None = Query(None, description="案件に配置された要員だけに絞り込む"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[WorkerOut]:
    """要員一覧。案件配下の画面からは project_id を渡し、その案件の配置だけを返す。"""
    stmt = select(Worker).where(Worker.deleted_at.is_(None)).order_by(Worker.id)
    if project_id is not None:
        # 案件スコープと権限はここで強制する（画面の絞り込みに任せない）
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(Worker.id.in_(
            select(WorkerAssignment.worker_id).where(WorkerAssignment.project_id == project_id)
        ))
    return [to_out(db, w) for w in db.execute(stmt).scalars().all()]


@router.get("/{worker_id}", response_model=WorkerDetailOut)
def get_worker(worker_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> WorkerDetailOut:
    w = db.get(Worker, worker_id)
    if not w or w.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "要員が見つかりません")
    base = to_out(db, w)
    company = db.get(Company, w.company_id) if w.company_id else None
    quals = db.execute(
        select(WorkerQualification, Qualification)
        .join(Qualification, Qualification.id == WorkerQualification.qualification_id)
        .where(WorkerQualification.worker_id == worker_id)
    ).all()
    qual_out = [
        WorkerQualificationOut(name=q.name, acquired_at=wq.acquired_at, expires_at=wq.expires_at, certificate_no=wq.certificate_no)
        for wq, q in quals
    ]
    assigns = db.execute(
        select(WorkerAssignment).where(WorkerAssignment.worker_id == worker_id).order_by(WorkerAssignment.id)
    ).scalars().all()
    assign_out = []
    for a in assigns:
        proj = db.get(Project, a.project_id)
        task = db.get(Task, a.task_id) if a.task_id else None
        assign_out.append(WorkerAssignmentOut(
            project_id=a.project_id, project=proj.name if proj else None,
            task_id=a.task_id, task=task.name if task else None,
            assigned_from=a.assigned_from, assigned_to=a.assigned_to, role=a.role, status=a.status,
        ))
    return WorkerDetailOut(
        **base.model_dump(), company=company.name if company else None,
        team=_team_name(db, w), qualifications=qual_out, assignments=assign_out,
    )


@router.post("/{worker_id}/assign", response_model=WorkerDetailOut)
def assign_worker(
    worker_id: int,
    body: WorkerAssignmentCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> WorkerDetailOut:
    """要員を案件（および工程）へ配置。配置すると稼働扱いにする。"""
    w = db.get(Worker, worker_id)
    if not w or w.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "要員が見つかりません")
    ensure_project_access(db, user, body.project_id)
    a = WorkerAssignment(
        worker_id=worker_id, project_id=body.project_id, task_id=body.task_id,
        assigned_from=body.assigned_from, assigned_to=body.assigned_to, role=body.role or w.role, status="稼働",
    )
    db.add(a)
    w.status = "稼働"
    db.flush()
    write_audit(db, user, "CREATE", "worker_assignment", a.id, project_id=body.project_id,
                after={"worker_id": worker_id, "task_id": body.task_id})
    db.commit()
    return get_worker(worker_id, db, user)


@router.delete("/{worker_id}/assign/{assignment_id}", response_model=WorkerDetailOut)
def unassign_worker(
    worker_id: int,
    assignment_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> WorkerDetailOut:
    """配置解除。他の配置が無ければ待機に戻す。"""
    a = db.get(WorkerAssignment, assignment_id)
    if not a or a.worker_id != worker_id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "配置が見つかりません")
    ensure_project_access(db, user, a.project_id)
    pid = a.project_id
    db.delete(a)
    db.flush()
    remaining = db.execute(select(WorkerAssignment).where(WorkerAssignment.worker_id == worker_id)).scalars().first()
    if not remaining:
        w = db.get(Worker, worker_id)
        if w:
            w.status = "待機"
    write_audit(db, user, "DELETE", "worker_assignment", assignment_id, project_id=pid, before={"worker_id": worker_id})
    db.commit()
    return get_worker(worker_id, db, user)


@router.get("/assignment-check/{project_id}", response_model=list[AssignmentCheckRow])
def assignment_check(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[AssignmentCheckRow]:
    """工程ごとに 予定人数 と 配置人数 の整合を確認。"""
    ensure_project_access(db, user, project_id)
    tasks = db.execute(
        select(Task).where(Task.project_id == project_id, Task.deleted_at.is_(None), Task.wbs_code.like("%.%"))
    ).scalars().all()
    rows = []
    for t in tasks:
        cnt = db.execute(
            select(func.count(WorkerAssignment.id)).where(WorkerAssignment.project_id == project_id, WorkerAssignment.task_id == t.id)
        ).scalar() or 0
        rows.append(AssignmentCheckRow(task_id=t.id, task_name=t.name, planned_workers=t.planned_workers,
                                       assigned_count=cnt, ok=cnt <= t.planned_workers))
    return rows
