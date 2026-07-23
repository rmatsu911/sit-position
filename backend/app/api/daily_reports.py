from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import REPORT_STATUSES, DailyReport, User
from app.schemas import DailyReportCreate, DailyReportOut, DailyReportStatusUpdate

router = APIRouter()


@router.get("", response_model=list[DailyReportOut])
def list_reports(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[DailyReport]:
    ensure_project_access(db, user, project_id)
    stmt = (
        select(DailyReport)
        .where(DailyReport.project_id == project_id, DailyReport.deleted_at.is_(None))
        .order_by(DailyReport.report_date.desc())
    )
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=DailyReportOut, status_code=status.HTTP_201_CREATED)
def create_report(
    body: DailyReportCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> DailyReport:
    ensure_project_access(db, user, body.project_id)
    r = DailyReport(**body.model_dump(), manager_id=user.id, status="DRAFT")
    db.add(r)
    db.flush()
    write_audit(db, user, "CREATE", "daily_report", r.id, project_id=body.project_id)
    db.commit()
    db.refresh(r)
    return r


@router.patch("/{report_id}/status", response_model=DailyReportOut)
def change_status(
    report_id: int,
    body: DailyReportStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> DailyReport:
    r = db.get(DailyReport, report_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "日報が見つかりません")
    ensure_project_access(db, user, r.project_id)
    if body.status not in REPORT_STATUSES:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "不正なステータスです")
    if body.status == "APPROVED" and user.role not in ("ADMIN", "PROJECT_MANAGER"):
        raise HTTPException(status.HTTP_403_FORBIDDEN, "承認権限がありません")
    old = r.status
    r.status = body.status
    if body.status == "SUBMITTED":
        r.submitted_at = datetime.now(timezone.utc)
    if body.status == "APPROVED":
        r.approved_at = datetime.now(timezone.utc)
    write_audit(db, user, "UPDATE", "daily_report", r.id, project_id=r.project_id, before={"status": old}, after={"status": r.status})
    db.commit()
    db.refresh(r)
    return r
