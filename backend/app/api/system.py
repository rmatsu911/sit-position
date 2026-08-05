"""稼働中のコード世代と接続状態を返す（秘密情報は返さない）。

「実環境がどのコードで動いているか」を画面から確認できるようにするための情報源。
接続文字列・パスワード・トークン・鍵は**いっさい含めない**（ホスト名も出さない）。
"""
from __future__ import annotations

import os
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends
from sqlalchemy import func, inspect, select, text
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import get_db
from app.core.deps import get_current_user, require_roles
from app.models import AiAnalysisJob, AiModel, User

router = APIRouter()

UNKNOWN = "unknown"

# 推論ジョブがこれ以上待たされていたら、Worker が動いていないとみなす
STALE_JOB_MINUTES = 15


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


def ai_state(db: Session) -> dict:
    """AI関連の状態。ひとつの「AIサービス」にまとめず、意味ごとに分けて返す。

    「学習済みモデルが置かれているか」「Worker が動いているか」「最後に成功したのは
    いつか」は別のことで、1つの状態にまとめると障害の切り分けができない。
    """
    unknown = {
        "registered_models": None, "trained_models": None,
        "pending_jobs": None, "last_successful_job_at": None,
        "worker": UNKNOWN,
    }
    try:
        models = db.execute(select(AiModel)).scalars().all()
        trained = [m for m in models if m.trained_at and (m.status or "").upper() in ("ACTIVE", "READY")]
        pending = db.execute(
            select(func.count(AiAnalysisJob.id))
            .where(AiAnalysisJob.status.in_(("QUEUED", "RUNNING")))
        ).scalar_one()
        last_done = db.execute(
            select(AiAnalysisJob.completed_at).where(AiAnalysisJob.status == "DONE")
            .order_by(AiAnalysisJob.completed_at.desc()).limit(1)
        ).scalar_one_or_none()
        oldest_pending = db.execute(
            select(AiAnalysisJob.queued_at)
            .where(AiAnalysisJob.status.in_(("QUEUED", "RUNNING")))
            .order_by(AiAnalysisJob.queued_at).limit(1)
        ).scalar_one_or_none()
    except Exception:
        return unknown

    # Worker の稼働は「待ちが滞留していないか」で判断する。
    # 待ちが1件も無い状態は動いているとも止まっているとも言えないため idle とする
    # （「稼働中」と書いて、実際には起動していない状態を隠さない）。
    worker = "idle"
    if oldest_pending is not None:
        queued_at = oldest_pending
        if queued_at.tzinfo is None:
            queued_at = queued_at.replace(tzinfo=timezone.utc)
        stale = (datetime.now(timezone.utc) - queued_at) > timedelta(minutes=STALE_JOB_MINUTES)
        worker = "not_running" if stale else "processing"

    return {
        "registered_models": len(models),
        # 登録されているだけのモデルと、学習済みのモデルを混同しない
        "trained_models": len(trained),
        "pending_jobs": pending,
        "last_successful_job_at": last_done.isoformat() if last_done else None,
        "worker": worker,
    }


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
        # 「AIサービス」という1語にまとめず、意味ごとに分けて返す
        "ai": ai_state(db),
        # サブパス配信（例: /sysken/api）でAPIが自分の公開パスをどう認識しているか。
        # 画面側のベースパスと突き合わせて、URL解決の食い違いに気づけるようにする。
        "api_root_path": settings.api_root_path or "/",
    }


@router.get("/system/ping")
def system_ping(user: User = Depends(get_current_user)) -> dict:
    """全ロールが使える最小の稼働確認（コード世代のみ）。"""
    return {
        "environment": settings.app_env,
        "api_version": settings.app_version,
        "backend_commit": _commit(),
    }
