from fastapi import Depends, HTTPException, status
from fastapi.security import OAuth2PasswordBearer
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.security import decode_access_token
from app.models import Project, ProjectMember, User

oauth2_scheme = OAuth2PasswordBearer(tokenUrl="/api/auth/login", auto_error=False)


def get_current_user(
    token: str | None = Depends(oauth2_scheme), db: Session = Depends(get_db)
) -> User:
    if not token:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "認証が必要です")
    payload = decode_access_token(token)
    if not payload or "sub" not in payload:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "トークンが無効です")
    user = db.get(User, int(payload["sub"]))
    if not user or not user.is_active or user.deleted_at is not None:
        raise HTTPException(status.HTTP_401_UNAUTHORIZED, "ユーザーが無効です")
    return user


def require_roles(*roles: str):
    def checker(user: User = Depends(get_current_user)) -> User:
        if user.role == "ADMIN":
            return user
        if roles and user.role not in roles:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "権限がありません")
        return user

    return checker


def accessible_project_ids(db: Session, user: User) -> set[int] | None:
    """None = 全案件アクセス可（内部ロール）。set = その案件のみ（協力会社等）。"""
    if user.role in ("ADMIN", "PROJECT_MANAGER", "QUALITY_MANAGER", "VIEWER"):
        return None
    rows = db.execute(
        select(ProjectMember.project_id).where(ProjectMember.user_id == user.id)
    ).scalars().all()
    return set(rows)


def ensure_project_access(db: Session, user: User, project_id: int) -> Project:
    project = db.get(Project, project_id)
    if not project or project.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "案件が見つかりません")
    allowed = accessible_project_ids(db, user)
    if allowed is not None and project_id not in allowed:
        raise HTTPException(status.HTTP_403_FORBIDDEN, "この案件へのアクセス権がありません")
    return project
