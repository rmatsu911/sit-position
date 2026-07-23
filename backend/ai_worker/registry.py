"""AiModel の登録・追跡。

同じ写真を将来別Versionのモデルで再解析しても過去結果を失わないよう、
Prediction は必ず model_id を持ち、モデルは name+version で一意に管理する。
"""
from __future__ import annotations

from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.models import AiModel


def ensure_model(db: Session, status: str) -> AiModel:
    """設定の name+version のモデルを取得（無ければ作成）。status を最新に更新。"""
    name = settings.ai_model_name
    version = settings.ai_model_version
    m = db.execute(
        select(AiModel).where(AiModel.name == name, AiModel.version == version)
    ).scalars().first()
    if not m:
        m = AiModel(
            name=name, model_type="YOLO", version=version,
            dataset_version=settings.ai_dataset_version,
            trained_at=None, status=status,
        )
        db.add(m)
        db.flush()
    else:
        m.status = status
        m.dataset_version = settings.ai_dataset_version
    return m


def mark_trained(db: Session, trained_at: datetime | None = None) -> AiModel:
    m = ensure_model(db, status="ACTIVE")
    m.trained_at = trained_at or datetime.now(timezone.utc)
    db.commit()
    return m
