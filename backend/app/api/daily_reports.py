from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import (
    REPORT_STATUSES,
    DailyReport,
    DailyReportPhoto,
    DailyReportTask,
    Task,
    TaskChangeHistory,
    User,
)
from app.schemas import (
    DailyReportLinks,
    DailyReportOut,
    DailyReportStatusUpdate,
    DailyReportUpsert,
)

router = APIRouter()


def _links(db: Session, report_id: int) -> tuple[list[int], list[int]]:
    tasks = db.execute(select(DailyReportTask.task_id).where(DailyReportTask.report_id == report_id)).scalars().all()
    photos = db.execute(select(DailyReportPhoto.photo_id).where(DailyReportPhoto.report_id == report_id)).scalars().all()
    return list(tasks), list(photos)


def to_out(db: Session, r: DailyReport) -> DailyReportOut:
    name = lambda uid: (db.get(User, uid).name if uid else None)  # noqa: E731
    task_ids, photo_ids = _links(db, r.id)
    return DailyReportOut(
        id=r.id, project_id=r.project_id, site_id=r.site_id, report_date=r.report_date,
        weather=r.weather, temperature=r.temperature, place=r.place, crew=r.crew, manager=name(r.manager_id),
        start_time=r.start_time, finish_time=r.finish_time, plan_workers=r.plan_workers, actual_workers=r.actual_workers,
        work_description=r.work_description, process=r.process, materials=r.materials, tools=r.tools, vehicles=r.vehicles,
        ky_description=r.ky_description, hazard=r.hazard, safety_check=r.safety_check, quality_check=r.quality_check,
        problem=r.problem, next_day_plan=r.next_day_plan, note=r.note,
        author=name(r.manager_id), checker=name(r.checker_id), approver=name(r.approver_id),
        status=r.status, task_ids=task_ids, photo_ids=photo_ids,
    )


@router.get("", response_model=list[DailyReportOut])
def list_reports(project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list[DailyReportOut]:
    ensure_project_access(db, user, project_id)
    stmt = select(DailyReport).where(DailyReport.project_id == project_id, DailyReport.deleted_at.is_(None)).order_by(DailyReport.report_date.desc())
    return [to_out(db, r) for r in db.execute(stmt).scalars().all()]


@router.get("/{report_id}", response_model=DailyReportOut)
def get_report(report_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DailyReportOut:
    r = db.get(DailyReport, report_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, r.project_id)
    return to_out(db, r)


def _apply(r: DailyReport, body: DailyReportUpsert) -> None:
    for k, v in body.model_dump(exclude={"project_id"}).items():
        setattr(r, k, v)


@router.post("", response_model=DailyReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    body: DailyReportUpsert,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> DailyReportOut:
    ensure_project_access(db, user, body.project_id)
    r = DailyReport(project_id=body.project_id, manager_id=user.id, status="DRAFT")
    _apply(r, body)
    db.add(r)
    db.flush()
    write_audit(db, user, "CREATE", "daily_report", r.id, project_id=body.project_id)
    db.commit()
    db.refresh(r)
    return to_out(db, r)


@router.put("/{report_id}", response_model=DailyReportOut)
def update_report(
    report_id: int, body: DailyReportUpsert, db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> DailyReportOut:
    r = db.get(DailyReport, report_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, r.project_id)
    _apply(r, body)
    write_audit(db, user, "UPDATE", "daily_report", r.id, project_id=r.project_id)
    db.commit()
    db.refresh(r)
    return to_out(db, r)


@router.post("/{report_id}/copy", response_model=DailyReportOut, status_code=status.HTTP_201_CREATED)
def copy_report(
    report_id: int, db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> DailyReportOut:
    """前日の日報を複製（DRAFTとして新規作成）。"""
    src = db.get(DailyReport, report_id)
    if not src or src.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, src.project_id)
    r = DailyReport(
        project_id=src.project_id, site_id=src.site_id, report_date=src.report_date,
        weather=src.weather, temperature=src.temperature, place=src.place, crew=src.crew,
        start_time=src.start_time, finish_time=src.finish_time, plan_workers=src.plan_workers,
        actual_workers=src.actual_workers, work_description=src.work_description, process=src.process,
        materials=src.materials, tools=src.tools, vehicles=src.vehicles, ky_description=src.ky_description,
        hazard=src.hazard, safety_check=src.safety_check, quality_check=src.quality_check,
        next_day_plan=src.next_day_plan, manager_id=user.id, status="DRAFT",
    )
    db.add(r)
    db.flush()
    write_audit(db, user, "CREATE", "daily_report", r.id, project_id=r.project_id, after={"copied_from": report_id})
    db.commit()
    db.refresh(r)
    return to_out(db, r)


@router.put("/{report_id}/links", response_model=DailyReportOut)
def set_links(
    report_id: int, body: DailyReportLinks, db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> DailyReportOut:
    r = db.get(DailyReport, report_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, r.project_id)
    if body.task_ids is not None:
        db.query(DailyReportTask).filter(DailyReportTask.report_id == report_id).delete()
        for tid in body.task_ids:
            db.add(DailyReportTask(report_id=report_id, task_id=tid))
    if body.photo_ids is not None:
        db.query(DailyReportPhoto).filter(DailyReportPhoto.report_id == report_id).delete()
        for pid in body.photo_ids:
            db.add(DailyReportPhoto(report_id=report_id, photo_id=pid))
    write_audit(db, user, "UPDATE", "daily_report", r.id, project_id=r.project_id, after={"links": body.model_dump(exclude_none=True)})
    db.commit()
    db.refresh(r)
    return to_out(db, r)


@router.patch("/{report_id}/status", response_model=DailyReportOut)
def change_status(
    report_id: int, body: DailyReportStatusUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> DailyReportOut:
    r = db.get(DailyReport, report_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, r.project_id)
    if body.status not in REPORT_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "不正なステータスです")
    if body.status in ("REVIEWING", "RETURNED", "APPROVED") and user.role not in ("ADMIN", "PROJECT_MANAGER", "QUALITY_MANAGER"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "承認・差戻しの権限がありません")
    old = r.status
    r.status = body.status
    if body.status == "SUBMITTED":
        r.submitted_at = datetime.now(timezone.utc)
    if body.status == "APPROVED":
        r.approved_at = datetime.now(timezone.utc)
        r.approver_id = user.id
    if body.status == "REVIEWING":
        r.checker_id = user.id
    write_audit(db, user, "UPDATE", "daily_report", r.id, project_id=r.project_id, before={"status": old}, after={"status": r.status})
    db.commit()
    db.refresh(r)
    return to_out(db, r)


@router.post("/{report_id}/reflect-progress")
def reflect_progress(
    report_id: int, db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> dict:
    """日報の実績を、紐付けた工程の実績へ明示的に反映（task_change_history / audit_logs へ記録）。"""
    r = db.get(DailyReport, report_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, r.project_id)
    task_ids, _ = _links(db, report_id)
    changes = []
    for tid in task_ids:
        t = db.get(Task, tid)
        if not t:
            continue
        # 実績人数・実績開始日を反映
        if r.actual_workers is not None and t.actual_workers != r.actual_workers:
            db.add(TaskChangeHistory(task_id=t.id, field="actual_workers", old_value=str(t.actual_workers), new_value=str(r.actual_workers), changed_by=user.id, change_reason=f"日報#{report_id}から反映"))
            changes.append({"task_id": t.id, "field": "actual_workers", "from": t.actual_workers, "to": r.actual_workers})
            t.actual_workers = r.actual_workers
        if t.actual_start_at is None:
            new_start = datetime.combine(r.report_date, datetime.min.time())
            db.add(TaskChangeHistory(task_id=t.id, field="actual_start_at", old_value=None, new_value=str(new_start), changed_by=user.id, change_reason=f"日報#{report_id}から反映"))
            changes.append({"task_id": t.id, "field": "actual_start_at", "from": None, "to": str(new_start.date())})
            t.actual_start_at = new_start
    write_audit(db, user, "REFLECT", "daily_report", r.id, project_id=r.project_id, after={"changes": changes})
    db.commit()
    return {"report_id": report_id, "reflected_tasks": len(task_ids), "changes": changes}
