import json

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
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
def list_workers(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[WorkerOut]:
    stmt = select(Worker).where(Worker.deleted_at.is_(None)).order_by(Worker.id)
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
