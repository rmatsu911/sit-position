from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import QualityCheck, User
from app.schemas import QualityCheckOut

router = APIRouter()


class QualityStatusUpdate(BaseModel):
    status: str
    comment: str | None = None


@router.get("", response_model=list[QualityCheckOut])
def list_checks(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[QualityCheck]:
    ensure_project_access(db, user, project_id)
    stmt = (
        select(QualityCheck)
        .where(QualityCheck.project_id == project_id, QualityCheck.deleted_at.is_(None))
        .order_by(QualityCheck.id)
    )
    return list(db.execute(stmt).scalars().all())


@router.patch("/{check_id}", response_model=QualityCheckOut)
def update_check(
    check_id: int,
    body: QualityStatusUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("QUALITY_MANAGER", "PROJECT_MANAGER")),
) -> QualityCheck:
    c = db.get(QualityCheck, check_id)
    if not c or c.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "品質チェックが見つかりません")
    ensure_project_access(db, user, c.project_id)
    old = c.status
    c.status = body.status
    c.human_result = body.comment or c.human_result
    c.checked_by = user.id
    c.checked_at = datetime.now(timezone.utc)
    if body.status == "承認済み":
        c.approved_by = user.id
        c.approved_at = datetime.now(timezone.utc)
    write_audit(db, user, "UPDATE", "quality_check", c.id, project_id=c.project_id, before={"status": old}, after={"status": c.status})
    db.commit()
    db.refresh(c)
    return c
