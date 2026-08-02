from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import get_current_user
from app.models import (
    AssetType,
    ConstructionType,
    PhotoType,
    ProcessType,
    QualityRuleType,
    WorkType,
)
from app.schemas import MasterItem

router = APIRouter(dependencies=[Depends(get_current_user)])

_TABLES = {
    "work-types": WorkType,
    "process-types": ProcessType,
    "asset-types": AssetType,
    "photo-types": PhotoType,
    "quality-rule-types": QualityRuleType,
    "construction-types": ConstructionType,
}


@router.get("/{master}", response_model=list[MasterItem])
def list_master(master: str, db: Session = Depends(get_db)) -> list:
    model = _TABLES.get(master)
    if model is None:
        raise HTTPException(404, f"不明なマスタ: {master}")
    stmt = select(model).where(model.active.is_(True)).order_by(model.sort_order, model.id)
    return list(db.execute(stmt).scalars().all())
