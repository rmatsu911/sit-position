from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import Photo, QualityCheck, QualityRule, User
from app.schemas import QualityActionUpdate, QualityCheckOut
from app.services.storage import get_storage

router = APIRouter()


def to_out(db: Session, c: QualityCheck) -> QualityCheckOut:
    worker = db.get(User, c.worker_id) if c.worker_id else None
    checker = db.get(User, c.checked_by) if c.checked_by else None
    inspect = c.inspect_item
    if not inspect and c.rule_id:
        rule = db.get(QualityRule, c.rule_id)
        inspect = rule.check_name if rule else None
    thumb = None
    if c.photo_id:
        ph = db.get(Photo, c.photo_id)
        if ph and ph.thumbnail_path:
            thumb = get_storage().url(ph.thumbnail_path)
    return QualityCheckOut(
        id=c.id, project_id=c.project_id, site_id=c.site_id, asset_id=c.asset_id, task_id=c.task_id,
        photo_id=c.photo_id, rule_id=c.rule_id, inspect_item=inspect, process=c.process, judge=c.judge,
        worker=worker.name if worker else None, checker=checker.name if checker else None,
        due_date=c.due_date, ai_result=c.ai_result, human_result=c.human_result, status=c.status,
        comment=c.comment, updated_at=c.updated_at, photo_thumbnail_url=thumb,
    )


@router.get("", response_model=list[QualityCheckOut])
def list_checks(
    project_id: int,
    task_id: int | None = None,
    asset_id: int | None = None,
    photo_id: int | None = None,
    status_filter: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[QualityCheckOut]:
    ensure_project_access(db, user, project_id)
    stmt = select(QualityCheck).where(QualityCheck.project_id == project_id, QualityCheck.deleted_at.is_(None))
    if task_id is not None:
        stmt = stmt.where(QualityCheck.task_id == task_id)
    if asset_id is not None:
        stmt = stmt.where(QualityCheck.asset_id == asset_id)
    if photo_id is not None:
        stmt = stmt.where(QualityCheck.photo_id == photo_id)
    if status_filter:
        stmt = stmt.where(QualityCheck.status == status_filter)
    return [to_out(db, c) for c in db.execute(stmt.order_by(QualityCheck.id)).scalars().all()]


@router.get("/{check_id}", response_model=QualityCheckOut)
def get_check(check_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> QualityCheckOut:
    c = db.get(QualityCheck, check_id)
    if not c or c.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "品質チェックが見つかりません")
    ensure_project_access(db, user, c.project_id)
    return to_out(db, c)


@router.patch("/{check_id}", response_model=QualityCheckOut)
def update_check(
    check_id: int,
    body: QualityActionUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("QUALITY_MANAGER", "PROJECT_MANAGER")),
) -> QualityCheckOut:
    c = db.get(QualityCheck, check_id)
    if not c or c.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "品質チェックが見つかりません")
    ensure_project_access(db, user, c.project_id)
    before = {"status": c.status, "judge": c.judge}
    if body.status is not None:
        c.status = body.status
    if body.judge is not None:
        c.judge = body.judge
    if body.comment is not None:
        c.comment = body.comment
        c.human_result = body.comment
    c.checked_by = user.id
    c.checked_at = datetime.now(timezone.utc)
    if c.status == "承認済み":
        c.approved_by = user.id
        c.approved_at = datetime.now(timezone.utc)
    write_audit(db, user, "UPDATE", "quality_check", c.id, project_id=c.project_id, before=before, after={"status": c.status, "judge": c.judge})
    db.commit()
    db.refresh(c)
    return to_out(db, c)
