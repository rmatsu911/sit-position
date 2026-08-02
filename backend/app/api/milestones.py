"""横断マイルストーン（複数案件の重要日を1画面で比較する）。

案件詳細用の絞り込みも同じ集約処理（`collect`）を使い、画面ごとに別の取得
ロジックを作らない。権限と案件スコープは既存の accessible_project_ids /
ensure_project_access をそのまま再利用する。

「登録済みのマイルストーン」と「まだ登録されていない標準種別（未設定候補）」は
必ず別の配列で返し、候補に実在するIDや架空の日付・状態・担当者を付けない。
"""
from __future__ import annotations

from datetime import datetime, timedelta

from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy import Select, and_, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.db import get_db
from app.core.deps import accessible_project_ids, get_current_user
from app.models import (
    Company,
    ConstructionType,
    Department,
    Milestone,
    MilestoneType,
    Project,
    Task,
    User,
)
from app.schemas import (
    IdNameOut,
    MilestoneCandidateOut,
    MilestoneListOut,
    MilestoneOptions,
    MilestoneOut,
    MilestoneProjectOption,
    MilestoneTaskOption,
)
from app.services.milestones import MilestoneFacts, as_jst, jst_today, normalize_precision

router = APIRouter()

DEFAULT_LIMIT = 1000
MAX_LIMIT = 5000
DEFAULT_DUE_SOON_DAYS = 7


def _ids(value: str | None) -> list[int]:
    if not value:
        return []
    return [int(p) for p in (v.strip() for v in value.split(",")) if p.isdigit()]


def _strings(value: str | None) -> list[str]:
    if not value:
        return []
    return [p.strip() for p in value.split(",") if p.strip()]


def _day_start(value: str) -> datetime:
    return datetime.fromisoformat(f"{value}T00:00:00+09:00")


class MilestoneFilters:
    """絞り込み条件。URLクエリと1対1で対応し、複数条件はANDで適用する。"""

    def __init__(
        self,
        q: str | None = Query(None, description="マイルストーン名・案件名・備考のキーワード"),
        project_ids: str | None = Query(None, description="案件ID（カンマ区切り）"),
        milestone_type_ids: str | None = Query(None),
        statuses: str | None = Query(None, description="DBに保存された状態（確定計算とは別）"),
        responsible_ids: str | None = Query(None),
        company_ids: str | None = Query(None),
        related_task_ids: str | None = Query(None),
        date_from: str | None = Query(None, description="予定日の範囲（YYYY-MM-DD, JST）"),
        date_to: str | None = Query(None, description="予定日の範囲（その日を含む）"),
        actual: str | None = Query(None, pattern="^(entered|missing)$", description="実績入力済み/未入力"),
        overdue_only: bool = Query(False, description="期限超過のみ"),
        due_soon_only: bool = Query(False, description="近日予定のみ"),
        conflict_only: bool = Query(False, description="関連工程との日程矛盾のみ"),
        due_soon_days: int = Query(DEFAULT_DUE_SOON_DAYS, ge=0, le=365),
        include_candidates: bool = Query(True, description="未設定候補も返す"),
        group: str = Query("project", pattern="^(project|type)$"),
        limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    ) -> None:
        self.q = (q or "").strip()
        self.project_ids = _ids(project_ids)
        self.milestone_type_ids = _ids(milestone_type_ids)
        self.statuses = _strings(statuses)
        self.responsible_ids = _ids(responsible_ids)
        self.company_ids = _ids(company_ids)
        self.related_task_ids = _ids(related_task_ids)
        self.date_from = date_from
        self.date_to = date_to
        self.actual = actual
        self.overdue_only = overdue_only
        self.due_soon_only = due_soon_only
        self.conflict_only = conflict_only
        self.due_soon_days = due_soon_days
        self.include_candidates = include_candidates
        self.group = group
        self.limit = limit


def _scope(db: Session, user: User, project_id: int | None) -> list | None:
    """権限（5ロール）と案件スコープをAPI側で適用する。

    画面側の絞り込みだけでスコープ外を隠さない。アクセスできる案件が無ければ None。
    """
    clauses = [Milestone.deleted_at.is_(None), Project.deleted_at.is_(None)]
    allowed = accessible_project_ids(db, user)
    if allowed is not None:
        if not allowed:
            return None
        clauses.append(Milestone.project_id.in_(allowed))
    if project_id is not None:
        if allowed is not None and project_id not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "この案件へのアクセス権がありません")
        clauses.append(Milestone.project_id == project_id)
    return clauses


# 関連工程は論理削除済みを返さないため、JOIN条件に deleted_at を含める
RelatedTask = aliased(Task)


def _base_select() -> Select:
    """1本のクエリで案件・工事区分・部署・種別・担当者・担当会社・関連工程を解決する。

    行ごとの追加取得（N+1）をしない。件数が増えてもSQL発行回数は変わらない。
    """
    return (
        select(
            Milestone,
            Project.name,
            Project.construction_number,
            Project.construction_type_id,
            Project.department_id,
            ConstructionType.name,
            Department.name,
            MilestoneType.name,
            MilestoneType.sort_order,
            User.name,
            Company.name,
            RelatedTask.wbs_code,
            RelatedTask.name,
            RelatedTask.planned_start_at,
            RelatedTask.planned_finish_at,
        )
        .join(Project, Project.id == Milestone.project_id)
        .outerjoin(ConstructionType, ConstructionType.id == Project.construction_type_id)
        .outerjoin(Department, Department.id == Project.department_id)
        .outerjoin(MilestoneType, MilestoneType.id == Milestone.milestone_type_id)
        .outerjoin(User, User.id == Milestone.responsible_id)
        .outerjoin(Company, Company.id == Milestone.company_id)
        .outerjoin(
            RelatedTask,
            and_(RelatedTask.id == Milestone.related_task_id, RelatedTask.deleted_at.is_(None)),
        )
    )


def _apply_sql_filters(stmt: Select, f: MilestoneFilters) -> Select:
    """SQLで表現できる条件。複数条件はANDで積み上げる。"""
    if f.project_ids:
        stmt = stmt.where(Milestone.project_id.in_(f.project_ids))
    if f.milestone_type_ids:
        stmt = stmt.where(Milestone.milestone_type_id.in_(f.milestone_type_ids))
    if f.statuses:
        stmt = stmt.where(Milestone.status.in_(f.statuses))
    if f.responsible_ids:
        stmt = stmt.where(Milestone.responsible_id.in_(f.responsible_ids))
    if f.company_ids:
        stmt = stmt.where(Milestone.company_id.in_(f.company_ids))
    if f.related_task_ids:
        stmt = stmt.where(Milestone.related_task_id.in_(f.related_task_ids))
    if f.actual == "entered":
        stmt = stmt.where(Milestone.actual_at.isnot(None))
    elif f.actual == "missing":
        stmt = stmt.where(Milestone.actual_at.is_(None))
    if f.date_from:
        stmt = stmt.where(Milestone.planned_at >= _day_start(f.date_from))
    if f.date_to:
        stmt = stmt.where(Milestone.planned_at < _day_start(f.date_to) + timedelta(days=1))
    if f.q:
        like = f"%{f.q}%"
        stmt = stmt.where(
            or_(
                Milestone.name.ilike(like),
                Milestone.notes.ilike(like),
                Project.name.ilike(like),
                Project.construction_number.ilike(like),
            )
        )
    return stmt


def _has_conflict(planned_at, task_start, task_finish) -> bool:
    """関連工程との日程矛盾（確定計算）。

    関連工程がある場合のみ判定する。工程の期間は [開始, 終了) の半開区間なので、
    比較用の最終日は「終了の前日」にそろえる。関連付けが無い場合は推測しない。
    """
    planned = as_jst(planned_at)
    start = as_jst(task_start)
    finish = as_jst(task_finish)
    if planned is None or start is None or finish is None:
        return False
    day = planned.replace(hour=0, minute=0, second=0, microsecond=0)
    start_day = start.replace(hour=0, minute=0, second=0, microsecond=0)
    last_day = (finish - timedelta(seconds=1)).replace(hour=0, minute=0, second=0, microsecond=0)
    return day < start_day or day > last_day


def _row_to_out(row, today: datetime, due_soon_days: int) -> MilestoneOut:
    (m, p_name, p_number, ctype_id, dept_id, ctype, dept, mtype, mtype_order,
     responsible, company, task_wbs, task_name, task_start, task_finish) = row
    facts = MilestoneFacts(m.planned_at, m.actual_at, today, due_soon_days)
    return MilestoneOut(
        record_kind="milestone",
        id=m.id,
        project_id=m.project_id,
        project_name=p_name,
        project_number=p_number,
        construction_type_id=ctype_id,
        construction_type=ctype,
        department_id=dept_id,
        department=dept,
        milestone_type_id=m.milestone_type_id,
        milestone_type=mtype,
        milestone_type_order=mtype_order or 0,
        name=m.name,
        planned_at=as_jst(m.planned_at),
        actual_at=as_jst(m.actual_at),
        status=m.status,
        responsible_id=m.responsible_id,
        responsible=responsible,
        company_id=m.company_id,
        company=company,
        related_task_id=m.related_task_id if task_wbs is not None or task_name is not None else None,
        related_task_wbs=task_wbs,
        related_task_name=task_name,
        schedule_precision=normalize_precision(m.schedule_precision),
        notes=m.notes,
        related_task_conflict=_has_conflict(m.planned_at, task_start, task_finish),
        **facts.as_dict(),
    )


def _sort_key(item: MilestoneOut) -> tuple:
    """並び順を安定させる（同じ条件なら常に同じ順序）。"""
    planned = item.planned_at.isoformat() if item.planned_at else "9999"
    return (item.project_number, item.milestone_type_order, planned, item.id)


def collect(
    db: Session,
    user: User,
    f: MilestoneFilters,
    project_id: int | None = None,
) -> MilestoneListOut:
    """横断・案件詳細の両方が使う集約処理。"""
    today = jst_today()
    clauses = _scope(db, user, project_id)
    if clauses is None:
        return MilestoneListOut(
            milestones=[], candidates=[], registered_count=0, candidate_count=0,
            total=0, returned_count=0, truncated=False, limit=f.limit,
            calculated_at=today.date(), due_soon_days=f.due_soon_days,
        )

    stmt = _apply_sql_filters(_base_select().where(*clauses), f)
    rows = db.execute(stmt).all()  # ① 一覧（JOINで解決済み）

    items = [_row_to_out(r, today, f.due_soon_days) for r in rows]

    # 確定計算に基づく条件は、計算後にPython側で適用する（判定を1箇所に保つ）
    if f.overdue_only:
        items = [i for i in items if i.is_overdue]
    if f.due_soon_only:
        items = [i for i in items if i.is_due_soon]
    if f.conflict_only:
        items = [i for i in items if i.related_task_conflict]

    items.sort(key=_sort_key)
    total = len(items)                 # 絞り込み後の登録済み件数（上限適用前）
    shown = items[: f.limit]

    candidates: list[MilestoneCandidateOut] = []
    if f.include_candidates:
        candidates = _candidates(db, clauses, f, {(i.project_id, i.milestone_type_id) for i in items})

    return MilestoneListOut(
        milestones=shown,
        candidates=candidates,
        registered_count=total,
        candidate_count=len(candidates),
        total=total,
        returned_count=len(shown),
        truncated=total > len(shown),
        limit=f.limit,
        calculated_at=today.date(),
        due_soon_days=f.due_soon_days,
    )


def _candidates(
    db: Session,
    clauses: list,
    f: MilestoneFilters,
    registered: set[tuple[int, int | None]],
) -> list[MilestoneCandidateOut]:
    """まだ登録されていない標準種別（未設定候補）。

    active=true の標準種別と、案件に登録済みのマイルストーンを**IDで**比較する。
    種別名の文字列比較はしない。候補には実在するID・予定日・実績日・状態・
    担当者・担当会社を設定しない（登録済みレコードと混同させない）。
    """
    # ② 対象案件（スコープ内・絞り込み後）
    proj_stmt = (
        select(Project.id, Project.name, Project.construction_number)
        .select_from(Milestone)
        .join(Project, Project.id == Milestone.project_id)
        .where(*clauses)
        .distinct()
    )
    if f.project_ids:
        proj_stmt = proj_stmt.where(Milestone.project_id.in_(f.project_ids))
    projects = db.execute(proj_stmt).all()

    # ③ 標準種別（active のみ）
    type_stmt = select(MilestoneType).where(MilestoneType.active.is_(True))
    if f.milestone_type_ids:
        type_stmt = type_stmt.where(MilestoneType.id.in_(f.milestone_type_ids))
    types = db.execute(type_stmt.order_by(MilestoneType.sort_order, MilestoneType.id)).scalars().all()

    out: list[MilestoneCandidateOut] = []
    for pid, pname, pnumber in projects:
        for t in types:
            if (pid, t.id) in registered:
                continue
            out.append(MilestoneCandidateOut(
                project_id=pid, project_name=pname, project_number=pnumber,
                milestone_type_id=t.id, milestone_type=t.name, milestone_type_order=t.sort_order,
            ))
    out.sort(key=lambda c: (c.project_number, c.milestone_type_order, c.milestone_type_id))
    return out


@router.get("/milestones", response_model=MilestoneListOut)
def list_milestones(
    project_id: int | None = Query(None, description="1案件に絞る（案件詳細用）"),
    f: MilestoneFilters = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneListOut:
    return collect(db, user, f, project_id)


@router.get("/milestones/options", response_model=MilestoneOptions)
def milestone_options(
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> MilestoneOptions:
    """絞り込みの選択肢。一覧と同じ権限・案件スコープを適用する。"""
    today = jst_today()
    clauses = _scope(db, user, project_id)
    empty = MilestoneOptions(
        projects=[], milestone_types=[], statuses=[], responsibles=[], companies=[],
        related_tasks=[], calculated_at=today.date(),
    )
    if clauses is None:
        return empty

    scope_stmt = select(Milestone.id).join(Project, Project.id == Milestone.project_id).where(*clauses)
    scoped = select(Milestone).where(Milestone.id.in_(scope_stmt)).subquery()

    projects = db.execute(
        select(Project.id, Project.name, Project.construction_number, Project.status)
        .where(Project.id.in_(select(scoped.c.project_id)))
        .order_by(Project.construction_number)
    ).all()
    types = db.execute(
        select(MilestoneType.id, MilestoneType.name)
        .where(MilestoneType.active.is_(True))
        .order_by(MilestoneType.sort_order, MilestoneType.id)
    ).all()
    statuses = db.execute(
        select(Milestone.status).where(Milestone.id.in_(scope_stmt)).distinct()
    ).scalars().all()
    responsibles = db.execute(
        select(User.id, User.name)
        .where(User.id.in_(select(scoped.c.responsible_id)))
        .order_by(User.id)
    ).all()
    companies = db.execute(
        select(Company.id, Company.name)
        .where(Company.id.in_(select(scoped.c.company_id)))
        .order_by(Company.id)
    ).all()
    # 関連工程は「実際に紐づいていて、削除されていない工程」だけを選択肢にする
    related = db.execute(
        select(Task.id, Task.wbs_code, Task.name, Task.project_id)
        .where(Task.id.in_(select(scoped.c.related_task_id)), Task.deleted_at.is_(None))
        .order_by(Task.project_id, Task.wbs_code)
    ).all()

    return MilestoneOptions(
        projects=[MilestoneProjectOption(id=i, name=n, construction_number=c, status=s)
                  for i, n, c, s in projects],
        milestone_types=[IdNameOut(id=i, name=n) for i, n in types],
        statuses=sorted(statuses),
        responsibles=[IdNameOut(id=i, name=n) for i, n in responsibles],
        companies=[IdNameOut(id=i, name=n) for i, n in companies],
        related_tasks=[MilestoneTaskOption(id=i, wbs_code=w, name=n, project_id=p)
                       for i, w, n, p in related],
        calculated_at=today.date(),
    )


@router.get("/milestones/summary")
def milestone_summary(
    project_id: int | None = Query(None),
    f: MilestoneFilters = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> dict:
    """確定計算の件数だけを返す（画面の見出し用）。一覧と同じ集約処理を使う。"""
    data = collect(db, user, f, project_id)
    return {
        "calculated_at": data.calculated_at.isoformat(),
        "due_soon_days": data.due_soon_days,
        "registered_count": data.registered_count,
        "candidate_count": data.candidate_count,
        "completed": sum(1 for m in data.milestones if m.is_completed),
        "overdue": sum(1 for m in data.milestones if m.is_overdue),
        "due_soon": sum(1 for m in data.milestones if m.is_due_soon),
        "was_delayed": sum(1 for m in data.milestones if m.was_delayed),
        "actual_missing": sum(1 for m in data.milestones if m.actual_missing),
        "related_task_conflict": sum(1 for m in data.milestones if m.related_task_conflict),
    }
