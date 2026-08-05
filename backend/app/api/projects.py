from datetime import date, datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, exists, func, or_, select
from sqlalchemy.exc import IntegrityError
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import accessible_project_ids, ensure_project_access, get_current_user, require_roles
from app.models import (
    Company,
    ConstructionType,
    Department,
    Photo,
    Project,
    QualityCheck,
    Task,
    User,
)
from app.schemas import (
    IdNameOut,
    ProjectCreate,
    ProjectFilterOptions,
    ProjectOut,
    ProjectSearchOut,
    ProjectUpdate,
)

router = APIRouter()

_OPEN_QUALITY = ("確認待ち", "情報不足", "未提出", "警告", "再撮影依頼")


def build_out(db: Session, p: Project) -> ProjectOut:
    ctype = db.get(ConstructionType, p.construction_type_id) if p.construction_type_id else None
    dept = db.get(Department, p.department_id) if p.department_id else None
    manager = db.get(User, p.manager_id) if p.manager_id else None
    unconfirmed = db.execute(
        select(func.count(Photo.id)).where(
            Photo.project_id == p.id, Photo.confirmation_status == "未確認", Photo.deleted_at.is_(None)
        )
    ).scalar_one()
    quality = db.execute(
        select(func.count(QualityCheck.id)).where(
            QualityCheck.project_id == p.id,
            QualityCheck.status.in_(_OPEN_QUALITY),
            QualityCheck.deleted_at.is_(None),
        )
    ).scalar_one()
    return ProjectOut(
        id=p.id,
        construction_number=p.construction_number,
        name=p.name,
        customer=p.customer,
        customer_type=p.customer_type,
        construction_type=ctype.name if ctype else None,
        area=p.area,
        location=p.location,
        department=dept.name if dept else None,
        manager=manager.name if manager else None,
        status=p.status,
        planned_progress=p.planned_progress,
        actual_progress=p.actual_progress,
        start_planned_at=p.start_planned_at,
        finish_planned_at=p.finish_planned_at,
        contract_amount=float(p.contract_amount) if p.contract_amount is not None else None,
        budget_planned=float(p.budget_planned) if p.budget_planned is not None else None,
        budget_used=float(p.budget_used) if p.budget_used is not None else None,
        unconfirmed_photos=unconfirmed,
        quality_checks=quality,
        updated_at=p.updated_at,
    )


DEFAULT_PER_PAGE = 20
MAX_PER_PAGE = 200

# 並び順。既定は「新しく登録したものが必ず先頭」。
# created_at が同一でも id で決まるため、ページ間で行が入れ替わらない。
SORTS = {
    "recent": (Project.created_at.desc(), Project.id.desc()),
    "code": (Project.construction_number.asc(), Project.id.asc()),
    "progress": (Project.actual_progress.desc(), Project.id.desc()),
    "due": (Project.finish_planned_at.asc(), Project.id.asc()),
}


def _ids(value: str | None) -> list[int]:
    if not value:
        return []
    return [int(p) for p in (v.strip() for v in value.split(",")) if p.isdigit()]


def _strings(value: str | None) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def _scoped(stmt: Select, db: Session, user: User) -> Select:
    """権限・案件スコープ。削除済みは常に除外する。"""
    stmt = stmt.where(Project.deleted_at.is_(None))
    allowed = accessible_project_ids(db, user)
    if allowed is not None:
        stmt = stmt.where(Project.id.in_(allowed or {-1}))
    return stmt


def _apply_filters(
    stmt: Select,
    *,
    q: str,
    statuses: list[str],
    manager_ids: list[int],
    company_ids: list[int],
    areas: list[str],
    department_ids: list[int],
    delayed_only: bool,
    date_from: date | None,
    date_to: date | None,
) -> Select:
    """画面の全条件をサーバー側で適用する（ページネーションより前）。

    担当会社は案件に列が無いため、**その案件の工程に設定された担当会社**で判定する。
    JOIN ではなく EXISTS を使い、会社が複数一致しても案件が重複しない。
    """
    if q:
        like = f"%{q}%"
        stmt = stmt.where(or_(
            Project.name.ilike(like),
            Project.construction_number.ilike(like),
            Project.customer.ilike(like),
            Project.manager_id.in_(select(User.id).where(User.name.ilike(like))),
        ))
    if statuses:
        stmt = stmt.where(Project.status.in_(statuses))
    if manager_ids:
        stmt = stmt.where(Project.manager_id.in_(manager_ids))
    if areas:
        stmt = stmt.where(Project.area.in_(areas))
    if department_ids:
        stmt = stmt.where(Project.department_id.in_(department_ids))
    if delayed_only:
        stmt = stmt.where(Project.status == "遅延")
    # 期間は「予定期間が指定範囲と重なる案件」（半開区間ではなく日付の包含判定）
    if date_from:
        stmt = stmt.where(or_(Project.finish_planned_at.is_(None),
                              Project.finish_planned_at >= date_from))
    if date_to:
        stmt = stmt.where(or_(Project.start_planned_at.is_(None),
                              Project.start_planned_at <= date_to))
    if company_ids:
        stmt = stmt.where(exists().where(
            Task.project_id == Project.id,
            Task.deleted_at.is_(None),
            Task.company_id.in_(company_ids),
        ))
    return stmt


@router.get("/search", response_model=ProjectSearchOut)
def search_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    q: str = Query("", description="キーワード（工事名・工事番号・顧客・責任者）"),
    statuses: str = Query("", description="状態（カンマ区切り）"),
    manager_ids: str = Query("", description="責任者ID（カンマ区切り）"),
    company_ids: str = Query("", description="担当会社ID（カンマ区切り・工程の担当会社で判定）"),
    areas: str = Query("", description="エリア（カンマ区切り）"),
    department_ids: str = Query("", description="担当部署ID（カンマ区切り）"),
    delayed_only: bool = Query(False, description="遅延のみ"),
    date_from: date | None = Query(None, description="予定期間の開始（この日以降に終わる案件）"),
    date_to: date | None = Query(None, description="予定期間の終了（この日以前に始まる案件）"),
    sort: str = Query("recent", description="並び順（recent/code/progress/due）"),
    page: int = Query(1, ge=1),
    per_page: int = Query(DEFAULT_PER_PAGE, ge=1, le=MAX_PER_PAGE),
) -> ProjectSearchOut:
    """案件一覧（サーバー側で絞り込み → 件数 → ページネーション）。

    画面がページ内で数え直したり絞り込んだりしないよう、`total` は権限と全条件を
    適用したあとの件数を返す。既定の並び順は登録が新しい順で、同時刻でも id で安定する。
    """
    order = SORTS.get(sort) or SORTS["recent"]
    sort_key = sort if sort in SORTS else "recent"
    kwargs = dict(
        q=q.strip(),
        statuses=_strings(statuses),
        manager_ids=_ids(manager_ids),
        company_ids=_ids(company_ids),
        areas=_strings(areas),
        department_ids=_ids(department_ids),
        delayed_only=delayed_only,
        date_from=date_from,
        date_to=date_to,
    )

    count_stmt = _apply_filters(_scoped(select(func.count(Project.id)), db, user), **kwargs)
    total = db.execute(count_stmt).scalar_one()

    stmt = _apply_filters(_scoped(select(Project), db, user), **kwargs)
    rows = db.execute(
        stmt.order_by(*order).offset((page - 1) * per_page).limit(per_page)
    ).scalars().all()

    return ProjectSearchOut(
        items=[build_out(db, p) for p in rows],
        total=total,
        page=page,
        per_page=per_page,
        pages=max(1, (total + per_page - 1) // per_page),
        sort=sort_key,
    )


@router.get("/filter-options", response_model=ProjectFilterOptions)
def project_filter_options(
    db: Session = Depends(get_db), user: User = Depends(get_current_user),
) -> ProjectFilterOptions:
    """絞り込みの選択肢。表示中のページではなく、権限範囲の全案件から作る。"""
    ids = db.execute(_scoped(select(Project.id), db, user)).scalars().all() or [-1]

    statuses = sorted({v for (v,) in db.execute(
        select(Project.status).where(Project.id.in_(ids)).distinct()).all() if v})
    areas = sorted({v for (v,) in db.execute(
        select(Project.area).where(Project.id.in_(ids)).distinct()).all() if v})
    dept_ids = {v for (v,) in db.execute(
        select(Project.department_id).where(Project.id.in_(ids)).distinct()).all() if v}
    manager_ids = {v for (v,) in db.execute(
        select(Project.manager_id).where(Project.id.in_(ids)).distinct()).all() if v}
    company_ids = {v for (v,) in db.execute(
        select(Task.company_id).where(
            Task.project_id.in_(ids), Task.deleted_at.is_(None)).distinct()).all() if v}

    depts = db.execute(select(Department).where(
        Department.id.in_(dept_ids or {-1})).order_by(Department.name)).scalars().all()
    managers = db.execute(select(User).where(
        User.id.in_(manager_ids or {-1})).order_by(User.name)).scalars().all()
    companies = db.execute(select(Company).where(
        Company.id.in_(company_ids or {-1})).order_by(Company.name)).scalars().all()

    return ProjectFilterOptions(
        statuses=statuses,
        areas=areas,
        departments=[IdNameOut(id=d.id, name=d.name) for d in depts],
        managers=[IdNameOut(id=u.id, name=u.name) for u in managers],
        companies=[IdNameOut(id=c.id, name=c.name) for c in companies],
    )


@router.get("", response_model=list[ProjectOut])
def list_projects(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
    status_filter: str | None = Query(None, alias="status"),
    q: str | None = None,
) -> list[ProjectOut]:
    stmt = select(Project).where(Project.deleted_at.is_(None))
    allowed = accessible_project_ids(db, user)
    if allowed is not None:
        stmt = stmt.where(Project.id.in_(allowed or {-1}))
    if status_filter:
        stmt = stmt.where(Project.status == status_filter)
    if q:
        like = f"%{q}%"
        stmt = stmt.where(Project.name.ilike(like) | Project.construction_number.ilike(like))
    stmt = stmt.order_by(Project.construction_number)
    return [build_out(db, p) for p in db.execute(stmt).scalars().all()]


@router.get("/{project_id}", response_model=ProjectOut)
def get_project(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> ProjectOut:
    p = ensure_project_access(db, user, project_id)
    return build_out(db, p)


def _check_period(start: date | None, finish: date | None) -> None:
    """開始日が終了日より後の指定を拒否する（保存してから気づかせない）。"""
    if start and finish and start > finish:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY,
            "着工予定日が完了予定日より後になっています",
        )


def _check_number_unique(db: Session, number: str, *, exclude_id: int | None = None) -> None:
    """工事番号の重複を 409 で拒否する（論理削除済みも含めて一意）。"""
    stmt = select(Project.id).where(Project.construction_number == number)
    if exclude_id is not None:
        stmt = stmt.where(Project.id != exclude_id)
    if db.execute(stmt).first():
        raise HTTPException(status.HTTP_409_CONFLICT, "同じ工事番号の案件が既に存在します")


@router.post("", response_model=ProjectOut, status_code=status.HTTP_201_CREATED)
def create_project(
    body: ProjectCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> ProjectOut:
    _check_number_unique(db, body.construction_number)
    _check_period(body.start_planned_at, body.finish_planned_at)
    p = Project(**body.model_dump())
    db.add(p)
    try:
        db.flush()
    except IntegrityError:
        # 同時登録などで一意制約に当たった場合も 409 として返す（500 にしない）
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "同じ工事番号の案件が既に存在します") from None
    write_audit(db, user, "CREATE", "project", p.id, project_id=p.id, after=body.model_dump())
    db.commit()
    db.refresh(p)
    return build_out(db, p)


@router.put("/{project_id}", response_model=ProjectOut)
def update_project(
    project_id: int,
    body: ProjectUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> ProjectOut:
    # PROJECT_MANAGER でも、担当外の案件は案件スコープで拒否される
    p = ensure_project_access(db, user, project_id)
    changes = body.model_dump(exclude_unset=True)
    if changes.get("construction_number"):
        _check_number_unique(db, changes["construction_number"], exclude_id=p.id)
    # 片側だけ更新しても、保存後の値の組で判定する
    _check_period(
        changes.get("start_planned_at", p.start_planned_at),
        changes.get("finish_planned_at", p.finish_planned_at),
    )
    before = {k: getattr(p, k) for k in changes}
    for k, v in changes.items():
        setattr(p, k, v)
    write_audit(db, user, "UPDATE", "project", p.id, project_id=p.id, before=before, after=changes)
    try:
        db.commit()
    except IntegrityError:
        db.rollback()
        raise HTTPException(status.HTTP_409_CONFLICT, "同じ工事番号の案件が既に存在します") from None
    db.refresh(p)
    return build_out(db, p)


@router.delete("/{project_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_project(
    project_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> None:
    p = ensure_project_access(db, user, project_id)
    p.deleted_at = datetime.now(timezone.utc)
    p.deleted_by = user.id
    p.delete_reason = reason
    write_audit(db, user, "DELETE", "project", p.id, project_id=p.id)
    db.commit()
