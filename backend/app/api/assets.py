from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import Asset, User
from app.schemas import AssetCreate, AssetOut

router = APIRouter()


@router.get("", response_model=list[AssetOut])
def list_assets(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Asset]:
    ensure_project_access(db, user, project_id)
    stmt = select(Asset).where(Asset.project_id == project_id, Asset.deleted_at.is_(None)).order_by(Asset.id)
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=AssetOut, status_code=status.HTTP_201_CREATED)
def create_asset(
    body: AssetCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> Asset:
    ensure_project_access(db, user, body.project_id)
    a = Asset(**body.model_dump())
    db.add(a)
    db.flush()
    write_audit(db, user, "CREATE", "asset", a.id, project_id=body.project_id, after=body.model_dump())
    db.commit()
    db.refresh(a)
    return a
