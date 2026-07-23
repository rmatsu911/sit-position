from fastapi import APIRouter, Depends, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import Site, User
from app.schemas import SiteCreate, SiteOut

router = APIRouter()


@router.get("", response_model=list[SiteOut])
def list_sites(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[Site]:
    ensure_project_access(db, user, project_id)
    stmt = select(Site).where(Site.project_id == project_id, Site.deleted_at.is_(None)).order_by(Site.id)
    return list(db.execute(stmt).scalars().all())


@router.post("", response_model=SiteOut, status_code=status.HTTP_201_CREATED)
def create_site(
    body: SiteCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> Site:
    ensure_project_access(db, user, body.project_id)
    s = Site(**body.model_dump())
    db.add(s)
    db.flush()
    write_audit(db, user, "CREATE", "site", s.id, project_id=body.project_id, after=body.model_dump())
    db.commit()
    db.refresh(s)
    return s
