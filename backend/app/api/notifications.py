from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import or_, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import accessible_project_ids, get_current_user
from app.models import Notification, Project, User
from app.schemas import NotificationOut

router = APIRouter()


def to_out(db: Session, n: Notification) -> NotificationOut:
    proj = db.get(Project, n.project_id) if n.project_id else None
    return NotificationOut(
        id=n.id, kind=n.kind, title=n.title, body=n.body,
        project=proj.name if proj else "—", at=n.created_at,
        read=n.is_read, important=n.important, link=n.target_url,
    )


@router.get("", response_model=list[NotificationOut])
def list_notifications(
    unread: bool | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[NotificationOut]:
    # 自分宛て または 全体通知（user_id is None）。協力会社は割当案件外の通知を除外。
    stmt = select(Notification).where(or_(Notification.user_id == user.id, Notification.user_id.is_(None)))
    allowed = accessible_project_ids(db, user)
    rows = db.execute(stmt.order_by(Notification.created_at.desc(), Notification.id.desc())).scalars().all()
    out = []
    for n in rows:
        if allowed is not None and n.project_id is not None and n.project_id not in allowed:
            continue
        if unread is not None and n.is_read == unread:
            continue
        out.append(to_out(db, n))
    return out


@router.patch("/{notification_id}/read", response_model=NotificationOut)
def mark_read(
    notification_id: int, read: bool = True, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> NotificationOut:
    n = db.get(Notification, notification_id)
    if not n or (n.user_id is not None and n.user_id != user.id):
        raise HTTPException(status.HTTP_404_NOT_FOUND, "通知が見つかりません")
    n.is_read = read
    db.commit()
    db.refresh(n)
    return to_out(db, n)


@router.post("/read-all")
def mark_all_read(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> dict:
    rows = db.execute(
        select(Notification).where(or_(Notification.user_id == user.id, Notification.user_id.is_(None)), Notification.is_read.is_(False))
    ).scalars().all()
    for n in rows:
        n.is_read = True
    db.commit()
    return {"updated": len(rows)}
