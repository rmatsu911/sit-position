"""横断工程表（複数案件の工程を1画面で確認する）。

この画面は独自の工程データを持たない。既存の projects / tasks / users / companies を
横断して読み出すビューであり、更新は既存の工程更新API（PUT /api/tasks/{id}）を使う。
権限と案件スコープは app.core.deps の accessible_project_ids / ensure_project_access を
そのまま再利用し、別実装を作らない。
"""
from __future__ import annotations

import json
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy import Select, and_, func, or_, select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import accessible_project_ids, get_current_user
from app.models import (
    Company,
    ConstructionType,
    Department,
    ProcessType,
    Project,
    SavedSearch,
    Task,
    TaskDependency,
    User,
    WorkType,
)
from app.schemas import (
    CrossProjectOption,
    CrossScheduleOptions,
    CrossScheduleOut,
    CrossTaskOut,
    IdNameOut,
    SavedSearchCreate,
    SavedSearchOut,
    SavedSearchUpdate,
    SystemDetectionOut,
)
from app.services.reports import ReportSpec, render

router = APIRouter()

JST = timezone(timedelta(hours=9))
DEFAULT_LIMIT = 2000
MAX_LIMIT = 5000
DONE_STATUS = "完了"


def _ids(value: str | None) -> list[int]:
    """"1,2,3" 形式のクエリを整数リストへ。空要素と非数値は無視する。"""
    if not value:
        return []
    out: list[int] = []
    for part in value.split(","):
        part = part.strip()
        if part.isdigit():
            out.append(int(part))
    return out


def _strings(value: str | None) -> list[str]:
    if not value:
        return []
    return [p.strip() for p in value.split(",") if p.strip()]


def _jst_day_start(value: str) -> datetime:
    return datetime.fromisoformat(f"{value}T00:00:00+09:00")


def _delayed_clause(now: datetime):
    """遅延の確定計算（推論ではない）。

    - 実績終了が予定終了を超えた
    - まだ終わっていないのに予定終了を過ぎた
    """
    return or_(
        and_(
            Task.actual_finish_at.isnot(None),
            Task.planned_finish_at.isnot(None),
            Task.actual_finish_at > Task.planned_finish_at,
        ),
        and_(
            Task.actual_finish_at.is_(None),
            Task.planned_finish_at.isnot(None),
            Task.planned_finish_at < now,
            Task.status != DONE_STATUS,
        ),
    )


class CrossFilters:
    """横断工程表の絞り込み条件（URLクエリと1対1）。"""

    def __init__(
        self,
        q: str | None = Query(None, description="工程名・案件名・WBS・備考のキーワード"),
        date_from: str | None = Query(None, description="表示期間の開始 (YYYY-MM-DD, JST)"),
        date_to: str | None = Query(None, description="表示期間の終了 (YYYY-MM-DD, JST・その日を含む)"),
        project_ids: str | None = Query(None, description="案件ID（カンマ区切り）"),
        construction_type_ids: str | None = Query(None),
        department_ids: str | None = Query(None),
        statuses: str | None = Query(None, description="工程の状態（カンマ区切り）"),
        manager_ids: str | None = Query(None),
        company_ids: str | None = Query(None),
        delayed_only: bool = Query(False),
        unassigned_only: bool = Query(False, description="担当者または担当会社が未割当の工程のみ"),
        limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    ) -> None:
        self.q = (q or "").strip()
        self.date_from = date_from
        self.date_to = date_to
        self.project_ids = _ids(project_ids)
        self.construction_type_ids = _ids(construction_type_ids)
        self.department_ids = _ids(department_ids)
        self.statuses = _strings(statuses)
        self.manager_ids = _ids(manager_ids)
        self.company_ids = _ids(company_ids)
        self.delayed_only = delayed_only
        self.unassigned_only = unassigned_only
        self.limit = limit

    def describe(self) -> list[tuple[str, str]]:
        """出力（Excel/PDF）に載せる「適用した検索条件」。"""
        rows: list[tuple[str, str]] = []
        if self.q:
            rows.append(("キーワード", self.q))
        if self.date_from or self.date_to:
            rows.append(("表示期間", f"{self.date_from or '—'} 〜 {self.date_to or '—'}"))
        for label, values in (
            ("案件ID", self.project_ids),
            ("工事区分ID", self.construction_type_ids),
            ("部署ID", self.department_ids),
            ("担当者ID", self.manager_ids),
            ("担当会社ID", self.company_ids),
        ):
            if values:
                rows.append((label, ", ".join(str(v) for v in values)))
        if self.statuses:
            rows.append(("状態", ", ".join(self.statuses)))
        if self.delayed_only:
            rows.append(("遅延のみ", "はい"))
        if self.unassigned_only:
            rows.append(("未割当のみ", "はい"))
        return rows or [("検索条件", "指定なし（全件）")]


def _scope_clause(db: Session, user: User, project_id: int | None):
    """権限（5ロール）と案件スコープをAPI側で適用する。UIの出し分けには依存しない。"""
    clauses = [Task.deleted_at.is_(None), Project.deleted_at.is_(None)]
    allowed = accessible_project_ids(db, user)
    if allowed is not None:
        if not allowed:
            return None  # アクセスできる案件が無い
        clauses.append(Task.project_id.in_(allowed))
    if project_id is not None:
        if allowed is not None and project_id not in allowed:
            raise HTTPException(status.HTTP_403_FORBIDDEN, "この案件へのアクセス権がありません")
        clauses.append(Task.project_id == project_id)
    return clauses


def _base_select() -> Select:
    """1本のクエリで案件・工事区分・部署・担当者・担当会社・工種を解決する（N+1回避）。"""
    return (
        select(
            Task,
            Project.name,
            Project.construction_number,
            Project.construction_type_id,
            Project.department_id,
            ConstructionType.name,
            Department.name,
            User.name,
            Company.name,
            WorkType.name,
            ProcessType.name,
        )
        .join(Project, Project.id == Task.project_id)
        .outerjoin(ConstructionType, ConstructionType.id == Project.construction_type_id)
        .outerjoin(Department, Department.id == Project.department_id)
        .outerjoin(User, User.id == Task.manager_id)
        .outerjoin(Company, Company.id == Task.company_id)
        .outerjoin(WorkType, WorkType.id == Task.work_type_id)
        .outerjoin(ProcessType, ProcessType.id == Task.process_type_id)
    )


def _apply_filters(stmt: Select, f: CrossFilters, now: datetime) -> Select:
    if f.project_ids:
        stmt = stmt.where(Task.project_id.in_(f.project_ids))
    if f.construction_type_ids:
        stmt = stmt.where(Project.construction_type_id.in_(f.construction_type_ids))
    if f.department_ids:
        stmt = stmt.where(Project.department_id.in_(f.department_ids))
    if f.statuses:
        stmt = stmt.where(Task.status.in_(f.statuses))
    if f.manager_ids:
        stmt = stmt.where(Task.manager_id.in_(f.manager_ids))
    if f.company_ids:
        stmt = stmt.where(Task.company_id.in_(f.company_ids))
    if f.delayed_only:
        stmt = stmt.where(_delayed_clause(now))
    if f.unassigned_only:
        stmt = stmt.where(or_(Task.manager_id.is_(None), Task.company_id.is_(None)))
    if f.q:
        like = f"%{f.q}%"
        stmt = stmt.where(
            or_(
                Task.name.ilike(like),
                Task.wbs_code.ilike(like),
                Task.notes.ilike(like),
                Project.name.ilike(like),
                Project.construction_number.ilike(like),
            )
        )
    if f.date_from or f.date_to:
        # 表示期間と重なる工程（予定または実績が重なれば対象）
        start = _jst_day_start(f.date_from) if f.date_from else None
        end = _jst_day_start(f.date_to) + timedelta(days=1) if f.date_to else None
        overlaps = []
        for s_col, e_col in ((Task.planned_start_at, Task.planned_finish_at),
                             (Task.actual_start_at, Task.actual_finish_at)):
            conds = [s_col.isnot(None)]
            if end is not None:
                conds.append(s_col < end)
            if start is not None:
                conds.append(or_(e_col.is_(None), e_col > start))
            overlaps.append(and_(*conds))
        stmt = stmt.where(or_(*overlaps))
    return stmt


def _aware(dt: datetime | None) -> datetime | None:
    """タイムゾーンを必ず付けて返す。

    本番の PostgreSQL(timestamptz) は tz 付きで返るが、テストの SQLite は
    tz を保持できず JST の壁時計が naive で返る。以降の比較・整形を
    どちらでも同じ意味で行えるよう、境界でここに寄せる。
    """
    if dt is None:
        return None
    return dt if dt.tzinfo is not None else dt.replace(tzinfo=JST)


def _row_to_out(row, deps: dict[int, list[int]], now: datetime, matched: bool) -> CrossTaskOut:
    (t, p_name, p_number, ctype_id, dept_id, ctype, dept, manager, company, work_type, process_type) = row
    plan_start, plan_end = _aware(t.planned_start_at), _aware(t.planned_finish_at)
    actual_start, actual_end = _aware(t.actual_start_at), _aware(t.actual_finish_at)
    return CrossTaskOut(
        id=t.id,
        project_id=t.project_id,
        project_name=p_name,
        project_number=p_number,
        construction_type_id=ctype_id,
        construction_type=ctype,
        department_id=dept_id,
        department=dept,
        parent_task_id=t.parent_task_id,
        wbs_code=t.wbs_code,
        name=t.name,
        work_type=work_type,
        process_type=process_type,
        manager_id=t.manager_id,
        manager=manager,
        company_id=t.company_id,
        company=company,
        site_id=t.site_id,
        planned_start_at=plan_start,
        planned_finish_at=plan_end,
        actual_start_at=actual_start,
        actual_finish_at=actual_end,
        planned_progress=t.planned_progress,
        actual_progress=t.actual_progress,
        planned_workers=t.planned_workers,
        actual_workers=t.actual_workers,
        status=t.status,
        delay_reason=t.delay_reason,
        notes=t.notes,
        schedule_precision=t.schedule_precision or "day",
        dependencies=deps.get(t.id, []),
        is_delayed=_is_delayed(plan_end, actual_end, t.status, now),
        matched=matched,
    )


def _is_delayed(plan_end: datetime | None, actual_end: datetime | None, status: str, now: datetime) -> bool:
    """遅延の確定計算。_delayed_clause と同じ判定をPython側で行う。"""
    if plan_end is None:
        return False
    if actual_end is not None:
        return actual_end > plan_end
    return plan_end < now and status != DONE_STATUS


def _overlap(a_start, a_end, b_start, b_end) -> bool:
    """[開始, 終了) の半開区間が重なるか。境界が接するだけは重複としない。"""
    if not (a_start and a_end and b_start and b_end):
        return False
    return a_start < b_end and b_start < a_end


def _detect(tasks: list[CrossTaskOut]) -> list[SystemDetectionOut]:
    """確定計算による検知（システム検知）。

    予測モデルを使わず、保存済みの日時・割当だけから機械的に判定する。
    AI予測ではないため「AI」とは表示しない。
    """
    targets = [t for t in tasks if t.matched]
    out: list[SystemDetectionOut] = []

    overrun = [t.id for t in targets if t.is_delayed]
    if overrun:
        out.append(SystemDetectionOut(
            kind="schedule_overrun", label="予定終了超過", severity="high",
            message=f"予定終了日を過ぎている工程が {len(overrun)} 件あります。",
            task_ids=overrun))

    def _dup(key: str, kind: str, label: str, severity: str, noun: str) -> None:
        groups: dict[int, list[CrossTaskOut]] = {}
        for t in targets:
            v = getattr(t, key)
            if v is not None:
                groups.setdefault(v, []).append(t)
        hit: list[int] = []
        for rows in groups.values():
            rows = sorted(rows, key=lambda r: (r.planned_start_at or datetime.max.replace(tzinfo=timezone.utc)))
            for i, a in enumerate(rows):
                for b in rows[i + 1:]:
                    if b.planned_start_at and a.planned_finish_at and b.planned_start_at >= a.planned_finish_at:
                        break
                    # 親工程は子工程の総和なので重複判定から除く
                    if a.parent_task_id is None or b.parent_task_id is None:
                        continue
                    if _overlap(a.planned_start_at, a.planned_finish_at,
                                b.planned_start_at, b.planned_finish_at):
                        hit.extend([a.id, b.id])
        hit = sorted(set(hit))
        if hit:
            out.append(SystemDetectionOut(
                kind=kind, label=label, severity=severity,
                message=f"同じ{noun}に期間が重なる工程が {len(hit)} 件あります。",
                task_ids=hit))

    _dup("manager_id", "manager_overlap", "同一担当者の工程重複", "medium", "担当者")
    _dup("company_id", "company_overlap", "同一担当会社の割当重複", "low", "担当会社")

    unassigned = [t.id for t in targets if t.manager_id is None or t.company_id is None]
    if unassigned:
        out.append(SystemDetectionOut(
            kind="unassigned", label="未割当工程", severity="medium",
            message=f"担当者または担当会社が未割当の工程が {len(unassigned)} 件あります。",
            task_ids=unassigned))

    missing = [
        t.id for t in targets
        if t.parent_task_id is not None and t.status in ("施工中", "完了", "遅延") and t.actual_start_at is None
    ]
    if missing:
        out.append(SystemDetectionOut(
            kind="actual_missing", label="実績未入力", severity="medium",
            message=f"着手済みの状態なのに実績開始が未入力の工程が {len(missing)} 件あります。",
            task_ids=missing))
    return out


def _collect(db: Session, user: User, f: CrossFilters, project_id: int | None) -> CrossScheduleOut:
    now = datetime.now(timezone.utc)
    clauses = _scope_clause(db, user, project_id)
    if clauses is None:
        return CrossScheduleOut(tasks=[], total=0, truncated=False, limit=f.limit)

    stmt = _apply_filters(_base_select().where(*clauses), f, now)
    total = db.execute(
        select(func.count()).select_from(
            _apply_filters(select(Task.id).join(Project, Project.id == Task.project_id).where(*clauses), f, now)
            .subquery()
        )
    ).scalar_one()
    rows = db.execute(
        stmt.order_by(Project.construction_number, Task.wbs_code, Task.id).limit(f.limit)
    ).all()
    truncated = total > len(rows)

    matched_ids = {r[0].id for r in rows}
    # WBS の親子関係を保つため、一致した工程の祖先を補う（matched=False で区別）
    ancestor_rows: list = []
    known = set(matched_ids)
    pending = {r[0].parent_task_id for r in rows if r[0].parent_task_id} - known
    while pending:
        extra = db.execute(_base_select().where(*clauses).where(Task.id.in_(pending))).all()
        if not extra:
            break
        ancestor_rows.extend(extra)
        known |= {r[0].id for r in extra}
        pending = {r[0].parent_task_id for r in extra if r[0].parent_task_id} - known

    all_ids = list(known)
    deps: dict[int, list[int]] = {}
    if all_ids:
        for task_id, dep_id in db.execute(
            select(TaskDependency.task_id, TaskDependency.depends_on_task_id)
            .where(TaskDependency.task_id.in_(all_ids))
        ).all():
            deps.setdefault(task_id, []).append(dep_id)

    tasks = [_row_to_out(r, deps, now, True) for r in rows]
    tasks += [_row_to_out(r, deps, now, False) for r in ancestor_rows]
    tasks.sort(key=lambda t: (t.project_number, _wbs_key(t.wbs_code), t.id))

    starts = [t.planned_start_at for t in tasks if t.planned_start_at] + \
             [t.actual_start_at for t in tasks if t.actual_start_at]
    ends = [t.planned_finish_at for t in tasks if t.planned_finish_at] + \
           [t.actual_finish_at for t in tasks if t.actual_finish_at]
    return CrossScheduleOut(
        tasks=tasks,
        total=total,
        truncated=truncated,
        limit=f.limit,
        range_from=min(starts) if starts else None,
        range_to=max(ends) if ends else None,
        detections=_detect(tasks),
    )


def _wbs_key(wbs: str | None) -> tuple:
    """"1.10" が "1.2" より後に来るよう数値で並べる（並び順を安定させる）。"""
    if not wbs:
        return (9999,)
    parts = []
    for p in wbs.split("."):
        parts.append(int(p) if p.isdigit() else 9999)
    return tuple(parts)


@router.get("/cross", response_model=CrossScheduleOut)
def cross_schedule(
    project_id: int | None = Query(None, description="1案件に絞る（/projects/:id/schedule/cross 用）"),
    f: CrossFilters = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CrossScheduleOut:
    return _collect(db, user, f, project_id)


@router.get("/cross/options", response_model=CrossScheduleOptions)
def cross_options(
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CrossScheduleOptions:
    """絞り込みの選択肢。権限と案件スコープの範囲だけを返す。"""
    allowed = accessible_project_ids(db, user)
    p_stmt = select(Project).where(Project.deleted_at.is_(None))
    if allowed is not None:
        if not allowed:
            return CrossScheduleOptions(projects=[], construction_types=[], departments=[],
                                        managers=[], companies=[], statuses=[])
        p_stmt = p_stmt.where(Project.id.in_(allowed))
    projects = db.execute(p_stmt.order_by(Project.construction_number)).scalars().all()
    pids = [p.id for p in projects]

    ctype_ids = {p.construction_type_id for p in projects if p.construction_type_id}
    dept_ids = {p.department_id for p in projects if p.department_id}
    manager_ids = set(db.execute(
        select(Task.manager_id).where(Task.project_id.in_(pids), Task.deleted_at.is_(None),
                                      Task.manager_id.isnot(None)).distinct()
    ).scalars().all()) if pids else set()
    company_ids = set(db.execute(
        select(Task.company_id).where(Task.project_id.in_(pids), Task.deleted_at.is_(None),
                                      Task.company_id.isnot(None)).distinct()
    ).scalars().all()) if pids else set()
    statuses = sorted(db.execute(
        select(Task.status).where(Task.project_id.in_(pids), Task.deleted_at.is_(None)).distinct()
    ).scalars().all()) if pids else []

    def _named(model, ids: set[int]) -> list[IdNameOut]:
        if not ids:
            return []
        rows = db.execute(select(model.id, model.name).where(model.id.in_(ids)).order_by(model.id)).all()
        return [IdNameOut(id=i, name=n) for i, n in rows]

    return CrossScheduleOptions(
        projects=[CrossProjectOption(id=p.id, name=p.name, construction_number=p.construction_number,
                                     construction_type_id=p.construction_type_id,
                                     department_id=p.department_id, status=p.status) for p in projects],
        construction_types=_named(ConstructionType, ctype_ids),
        departments=_named(Department, dept_ids),
        managers=_named(User, manager_ids),
        companies=_named(Company, company_ids),
        statuses=statuses,
    )


# ===== 出力（Excel / PDF / 印刷）=====
def _fmt(dt: datetime | None) -> str:
    if not dt:
        return "—"
    return dt.astimezone(JST).strftime("%Y/%m/%d %H:%M")


def _fmt_period(start: datetime | None, end: datetime | None, precision: str) -> str:
    """[開始, 終了) を人が読む形へ。終了は exclusive なので表示は前の瞬間に合わせる。"""
    if not start or not end:
        return "—"
    s = start.astimezone(JST)
    e = end.astimezone(JST)
    if precision == "half_day":
        s_half = "午後" if s.hour >= 12 else "午前"
        e_half = "午前" if e.hour == 12 else "午後"
        e_day = e if e.hour == 12 else e - timedelta(days=1)
        return f"{s:%m/%d} {s_half} 〜 {e_day:%m/%d} {e_half}"
    return f"{s:%m/%d} 〜 {(e - timedelta(days=1)):%m/%d}"


CROSS_COLUMNS = [
    "案件番号", "案件名", "WBS", "工程名", "担当者", "担当会社",
    "予定期間", "実績期間", "期間(日)", "進捗率", "予定人工", "実績人工", "状態", "遅延", "備考",
]


def _cross_rows(tasks: list[CrossTaskOut]) -> list[list[str]]:
    rows: list[list[str]] = []
    for t in tasks:
        days = ""
        if t.planned_start_at and t.planned_finish_at:
            days = f"{(t.planned_finish_at - t.planned_start_at).total_seconds() / 86400:.1f}"
        rows.append([
            t.project_number, t.project_name, t.wbs_code or "—", t.name,
            t.manager or "未割当", t.company or "未割当",
            _fmt_period(t.planned_start_at, t.planned_finish_at, t.schedule_precision),
            _fmt_period(t.actual_start_at, t.actual_finish_at, t.schedule_precision),
            days, f"{t.actual_progress}%", str(t.planned_workers), str(t.actual_workers),
            t.status, "遅延" if t.is_delayed else "—", t.notes or "",
        ])
    return rows


@router.get("/cross/export")
def cross_export(
    format: str = Query("xlsx", pattern="^(xlsx|pdf)$"),
    project_id: int | None = Query(None),
    f: CrossFilters = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """現在の絞り込み条件と表示順のまま Excel / PDF を生成する。

    対象データにも権限と案件スコープを適用する（画面の見た目だけの絞り込みではない）。
    """
    data = _collect(db, user, f, project_id)
    meta = [
        ("出力日時", datetime.now(JST).strftime("%Y/%m/%d %H:%M")),
        ("出力者", f"{user.name}（{user.role}）"),
        ("対象工程数", f"{data.total} 件"),
    ] + f.describe()
    spec = ReportSpec(title="横断工程表", meta=meta, columns=CROSS_COLUMNS, rows=_cross_rows(data.tasks))
    content, content_type = render(spec, format)
    write_audit(db, user, "EXPORT", "cross_schedule", "cross",
                project_id=project_id, after={"format": format, "total": data.total})
    db.commit()
    stamp = datetime.now(JST).strftime("%Y%m%d_%H%M")
    filename = f"cross_schedule_{stamp}.{format}"
    return Response(content=content, media_type=content_type,
                    headers={"Content-Disposition": f'attachment; filename="{filename}"'})


# ===== 保存検索条件（端末を変えても使えるよう DB に保存する）=====
def _saved_out(row: SavedSearch) -> SavedSearchOut:
    try:
        conditions = json.loads(row.conditions)
    except (ValueError, TypeError):
        conditions = {}
    return SavedSearchOut(id=row.id, screen=row.screen, name=row.name, conditions=conditions,
                          created_at=row.created_at, updated_at=row.updated_at)


@router.get("/saved-searches", response_model=list[SavedSearchOut])
def list_saved_searches(
    screen: str = Query("cross_schedule"),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[SavedSearchOut]:
    rows = db.execute(
        select(SavedSearch).where(SavedSearch.user_id == user.id, SavedSearch.screen == screen)
        .order_by(SavedSearch.name)
    ).scalars().all()
    return [_saved_out(r) for r in rows]


@router.post("/saved-searches", response_model=SavedSearchOut, status_code=status.HTTP_201_CREATED)
def create_saved_search(
    body: SavedSearchCreate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedSearchOut:
    name = body.name.strip()
    if not name:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "名前を入力してください")
    row = SavedSearch(user_id=user.id, screen=body.screen, name=name,
                      conditions=json.dumps(body.conditions, ensure_ascii=False))
    db.add(row)
    db.commit()
    db.refresh(row)
    return _saved_out(row)


@router.put("/saved-searches/{search_id}", response_model=SavedSearchOut)
def update_saved_search(
    search_id: int,
    body: SavedSearchUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> SavedSearchOut:
    row = db.get(SavedSearch, search_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "保存した検索条件が見つかりません")
    if body.name is not None:
        row.name = body.name.strip()
    if body.conditions is not None:
        row.conditions = json.dumps(body.conditions, ensure_ascii=False)
    db.commit()
    db.refresh(row)
    return _saved_out(row)


@router.delete("/saved-searches/{search_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_saved_search(
    search_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> None:
    row = db.get(SavedSearch, search_id)
    if not row or row.user_id != user.id:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "保存した検索条件が見つかりません")
    db.delete(row)
    db.commit()
