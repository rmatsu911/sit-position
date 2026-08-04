"""稼働中のコード世代と接続状態を返す（秘密情報は返さない）。

「実環境がどのコードで動いているか」を画面から確認できるようにするための情報源。
接続文字列・パスワード・トークン・鍵は**いっさい含めない**（ホスト名も出さない）。
"""
from __future__ import annotations

import os
from datetime import datetime, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.models import AiModel, User

router = APIRouter()

UNKNOWN = "unknown"


def _commit() -> str:
    """稼働中のバックエンドのコミットSHA。ビルド時に環境変数へ入れる。"""
    return os.environ.get("GIT_COMMIT") or os.environ.get("RENDER_GIT_COMMIT") or UNKNOWN


def _built_at() -> str:
    return os.environ.get("BUILD_TIME") or UNKNOWN


def alembic_revision(db: Session) -> str:
    """実環境に適用済みの migration revision。"""
    try:
        if not inspect(db.get_bind()).has_table("alembic_version"):
            return UNKNOWN
        row = db.execute(text("SELECT version_num FROM alembic_version")).first()
        return row[0] if row else UNKNOWN
    except Exception:
        return UNKNOWN


def db_status(db: Session) -> str:
    try:
        db.execute(text("SELECT 1"))
        return "ok"
    except Exception:
        return "error"


def storage_status() -> str:
    """ファイル保存先へ書き込めるか。保存先のパスやバケット名は返さない。"""
    if settings.storage_backend != "local":
        # 外部ストレージは疎通確認に認証情報が要るため、設定済みかどうかだけを返す
        return "configured"
    try:
        d = settings.local_storage_dir
        os.makedirs(d, exist_ok=True)
        return "ok" if os.access(d, os.W_OK) else "read_only"
    except Exception:
        return "error"


def ai_status(db: Session) -> str:
    """AI推論の接続状態。学習済みモデルが登録されていなければ未接続。"""
    try:
        models = db.execute(select(AiModel)).scalars().all()
    except Exception:
        return "unknown"
    if not models:
        return "disconnected"
    # 学習済み（trained_at あり）で有効なモデルがあるときだけ「接続済み」
    ready = [m for m in models if m.trained_at and (m.status or "").upper() in ("ACTIVE", "READY")]
    return "connected" if ready else "disconnected"


@router.get("/system/info")
def system_info(
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("ADMIN")),
) -> dict:
    """管理者向けのシステム情報。稼働中のコード世代と接続状態を返す。"""
    return {
        "environment": settings.app_env,
        "api_version": settings.app_version,
        "backend_commit": _commit(),
        "backend_built_at": _built_at(),
        "server_time": datetime.now(timezone.utc).isoformat(),
        "alembic_revision": alembic_revision(db),
        "database": db_status(db),
        "storage": storage_status(),
        "storage_backend": settings.storage_backend,
        "ai_service": ai_status(db),
    }


@router.get("/system/ping")
def system_ping(user: User = Depends(get_current_user)) -> dict:
    """全ロールが使える最小の稼働確認（コード世代のみ）。"""
    return {
        "environment": settings.app_env,
        "api_version": settings.app_version,
        "backend_commit": _commit(),
    }
