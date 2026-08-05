from fastapi import APIRouter, Depends, HTTPException, status, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import accessible_project_ids, ensure_project_access, get_current_user, require_roles
from app.models import ConstructionType, Project, ProjectLedger, User
from app.schemas import LedgerRowOut, LedgerUpdate

router = APIRouter()


def to_row(db: Session, p: Project, ledger: ProjectLedger | None) -> LedgerRowOut:
    ct = db.get(ConstructionType, p.construction_type_id) if p.construction_type_id else None
    mgr = db.get(User, p.manager_id) if p.manager_id else None
    contract = float(p.contract_amount) if p.contract_amount is not None else None
    # 台帳固有：無ければ projects の予算から補完
    cost_plan = float(ledger.cost_planned) if ledger and ledger.cost_planned is not None else (float(p.budget_planned) if p.budget_planned is not None else None)
    cost_actual = float(ledger.cost_actual) if ledger and ledger.cost_actual is not None else (float(p.budget_used) if p.budget_used is not None else None)
    profit = None
    if contract and cost_plan is not None and contract != 0:
        profit = round((contract - cost_plan) / contract * 1000) / 10
    return LedgerRowOut(
        id=p.id, workNo=p.construction_number, contractNo=(ledger.contract_no if ledger else None),
        name=p.name, client=p.customer, category=ct.name if ct else None, area=p.area,
        contractAmount=contract, costPlan=cost_plan, costActual=cost_actual, profitRate=profit,
        startDate=p.start_planned_at, dueDate=p.finish_planned_at, finishDate=p.finish_actual_at,
        manager=mgr.name if mgr else None, progress=p.actual_progress,
        billing=(ledger.billing_status if ledger else None), documents=(ledger.document_status if ledger else None),
        status=p.status,
    )


@router.get("", response_model=list[LedgerRowOut])
def list_ledger(
    project_id: int | None = Query(None, description="1案件だけの台帳を取得する"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[LedgerRowOut]:
    allowed = accessible_project_ids(db, user)
    stmt = select(Project).where(Project.deleted_at.is_(None)).order_by(Project.id)
    if project_id is not None:
        # 案件スコープと権限はここで強制する
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(Project.id == project_id)
    projects = db.execute(stmt).scalars().all()
    ledgers = {l.project_id: l for l in db.execute(select(ProjectLedger)).scalars().all()}
    rows = []
    for p in projects:
        if allowed is not None and p.id not in allowed:
            continue
        rows.append(to_row(db, p, ledgers.get(p.id)))
    return rows


@router.put("/{project_id}", response_model=LedgerRowOut)
def update_ledger(
    project_id: int,
    body: LedgerUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> LedgerRowOut:
    p = db.get(Project, project_id)
    if not p or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "案件が見つかりません")
    ensure_project_access(db, user, project_id)
    ledger = db.execute(select(ProjectLedger).where(ProjectLedger.project_id == project_id)).scalars().first()
    if not ledger:
        ledger = ProjectLedger(project_id=project_id)
        db.add(ledger)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(ledger, k, v)
    db.flush()
    write_audit(db, user, "UPDATE", "project_ledger", project_id, project_id=project_id, after=body.model_dump(exclude_unset=True))
    db.commit()
    db.refresh(p)
    return to_row(db, p, ledger)
