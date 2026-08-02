"""カレンダーの共通イベントAPI。

工程・マイルストーン・品質確認期限・現場日報・試験記録という**実在する元データ**を
読み取り、カレンダー表示用の共通形式へ変換する。カレンダー専用テーブルは作らず、
元データを二重保存しない。存在しない日付・状態・担当者は生成しない。

図面の提出期限は `documents` に期限日の列が無いため、この API では扱わない
（推測して表示すると架空の期限になるため）。

権限・案件スコープは既存の accessible_project_ids / ensure_project_access を
そのまま使う。SQLは種別ごとに1本ずつで、件数に比例して発行数が増えない。
"""
from __future__ import annotations

from datetime import date, datetime, timedelta

from fastapi import APIRouter, Depends, Query, params
from sqlalchemy import Select, or_, select
from sqlalchemy.orm import Session, aliased

from app.core.db import get_db
from app.core.deps import accessible_project_ids, ensure_project_access, get_current_user
from app.models import (
    Company,
    DailyReport,
    Milestone,
    MilestoneType,
    Project,
    QualityCheck,
    Task,
    TestRecord,
    User,
)
from app.schemas import (
    CalendarEventOut,
    CalendarEventsOut,
    CalendarOptions,
    CalendarSourceKind,
    IdNameOut,
)
from app.services.milestones import JST, as_jst, normalize_precision

router = APIRouter()

DEFAULT_LIMIT = 2000
MAX_LIMIT = 5000

# 扱うイベント種別。表示名はマスタではなく、元テーブルの意味をそのまま表す。
SOURCE_KINDS: dict[str, str] = {
    "task": "工程",
    "milestone": "マイルストーン",
    "quality_check": "品質確認期限",
    "daily_report": "現場日報",
    "test_record": "試験記録",
}

# 予定 / 実績 / 期限 を取り違えないための区分
RECORD_KINDS: dict[str, str] = {"plan": "予定", "actual": "実績", "due": "期限"}


def _ids(value: str | None) -> list[int]:
    if not value:
        return []
    return [int(p) for p in (v.strip() for v in value.split(",")) if p.isdigit()]


def _strings(value: str | None) -> list[str]:
    if not value:
        return []
    return [v.strip() for v in value.split(",") if v.strip()]


def _plain(value):
    """Query の既定値（params.Query）が渡ってきたときに素の値へ戻す。"""
    return value.default if isinstance(value, params.Query) else value


def _day_start(value: date | datetime) -> datetime:
    """JSTのその日の 00:00（Phase 1 と同じ意味論）。"""
    if isinstance(value, datetime):
        value = as_jst(value).date()
    return datetime(value.year, value.month, value.day, tzinfo=JST)


class CalendarFilters:
    """絞り込み条件。URLクエリと1対1で対応する。"""

    def __init__(
        self,
        date_from: str = Query(..., alias="date_from", description="表示範囲の開始日（この日を含む）"),
        date_to: str = Query(..., alias="date_to", description="表示範囲の終了日（この日を含む）"),
        q: str = Query("", description="キーワード（件名・案件名）"),
        project_ids: str = Query("", description="案件ID（カンマ区切り）"),
        source_kinds: str = Query("", description="イベント種別（カンマ区切り）"),
        statuses: str = Query("", description="状態（カンマ区切り）"),
        responsible_ids: str = Query("", description="担当者ID（カンマ区切り）"),
        company_ids: str = Query("", description="担当会社ID（カンマ区切り）"),
        limit: int = Query(DEFAULT_LIMIT, ge=1, le=MAX_LIMIT),
    ) -> None:
        self.date_from = _plain(date_from)
        self.date_to = _plain(date_to)
        self.q = (_plain(q) or "").strip()
        self.project_ids = _ids(_plain(project_ids))
        self.source_kinds = [k for k in _strings(_plain(source_kinds)) if k in SOURCE_KINDS]
        self.statuses = _strings(_plain(statuses))
        self.responsible_ids = _ids(_plain(responsible_ids))
        self.company_ids = _ids(_plain(company_ids))
        self.limit = _plain(limit)

    @property
    def range_from(self) -> datetime:
        return _day_start(date.fromisoformat(self.date_from))

    @property
    def range_to(self) -> datetime:
        """終了日は「その日を含む」指定なので、翌日0:00までの半開区間にする。"""
        return _day_start(date.fromisoformat(self.date_to)) + timedelta(days=1)

    def wants(self, kind: str) -> bool:
        return not self.source_kinds or kind in self.source_kinds


def _scope(db: Session, user: User, project_id: int | None) -> set[int] | None:
    """案件スコープ。None は全案件、set は限定。"""
    allowed = accessible_project_ids(db, user)
    if project_id is not None:
        ensure_project_access(db, user, project_id)
        return {project_id} if allowed is None else ({project_id} & allowed)
    return allowed


def _limit_to_scope(stmt: Select, column, scope: set[int] | None, f: CalendarFilters) -> Select:
    if scope is not None:
        stmt = stmt.where(column.in_(scope or {-1}))
    if f.project_ids:
        stmt = stmt.where(column.in_(f.project_ids))
    return stmt


def _editable(user: User, kind: str) -> bool:
    """その利用者が元レコードを編集できるか（カレンダーからは編集しない）。"""
    role = user.role
    if kind in ("task", "milestone"):
        return role in ("ADMIN", "PROJECT_MANAGER")
    if kind == "quality_check":
        return role in ("ADMIN", "PROJECT_MANAGER", "QUALITY_MANAGER")
    if kind == "daily_report":
        return role in ("ADMIN", "PROJECT_MANAGER", "FIELD_WORKER")
    if kind == "test_record":
        return role in ("ADMIN", "PROJECT_MANAGER", "FIELD_WORKER", "QUALITY_MANAGER")
    return False


def _event(
    *, kind: str, record_kind: str, source_id: int, project: tuple[int, str, str],
    title: str, start_at: datetime, end_at: datetime | None, precision: str, status: str,
    responsible: tuple[int | None, str | None], company: tuple[int | None, str | None],
    url: str, user: User,
) -> CalendarEventOut:
    pid, pcode, pname = project
    return CalendarEventOut(
        # 別テーブルの同じ数値IDを取り違えないよう、種別と区分を必ず含める
        event_id=f"{kind}:{record_kind}:{source_id}",
        source_kind=kind,
        source_id=source_id,
        project_id=pid,
        project_code=pcode,
        project_name=pname,
        title=title,
        start_at=start_at,
        end_at=end_at,
        schedule_precision=precision,
        status=status,
        responsible_id=responsible[0],
        responsible_name=responsible[1],
        company_id=company[0],
        company_name=company[1],
        source_url=url,
        editable=_editable(user, kind),
        record_kind=record_kind,
    )


def _keyword_ok(f: CalendarFilters, *values: str | None) -> bool:
    if not f.q:
        return True
    needle = f.q.lower()
    return any(needle in (v or "").lower() for v in values)


def _filters_ok(f: CalendarFilters, status: str, responsible_id: int | None,
                company_id: int | None) -> bool:
    """状態・担当者・担当会社の絞り込み（すべてANDで効く）。"""
    if f.statuses and status not in f.statuses:
        return False
    if f.responsible_ids and responsible_id not in f.responsible_ids:
        return False
    if f.company_ids and company_id not in f.company_ids:
        return False
    return True


# ===== 種別ごとの取得（1種別＝SQL 1本。行数に比例して増やさない） =====
def _tasks(db: Session, user: User, f: CalendarFilters, scope: set[int] | None) -> list[CalendarEventOut]:
    manager = aliased(User)
    stmt = (
        select(Task, Project.id, Project.construction_number, Project.name,
               manager.id, manager.name, Company.id, Company.name)
        .join(Project, Project.id == Task.project_id)
        .outerjoin(manager, manager.id == Task.manager_id)
        .outerjoin(Company, Company.id == Task.company_id)
        .where(Task.deleted_at.is_(None), Project.deleted_at.is_(None))
    )
    stmt = _limit_to_scope(stmt, Task.project_id, scope, f)
    stmt = stmt.where(
        or_(
            (Task.planned_start_at < f.range_to) & (Task.planned_finish_at > f.range_from),
            (Task.actual_start_at < f.range_to)
            & or_(Task.actual_finish_at.is_(None), Task.actual_finish_at > f.range_from),
        )
    )
    out: list[CalendarEventOut] = []
    for t, pid, pcode, pname, mid, mname, cid, cname in db.execute(stmt).all():
        if not _filters_ok(f, t.status, mid, cid) or not _keyword_ok(f, t.name, pname, t.wbs_code):
            continue
        precision = normalize_precision(t.schedule_precision)
        common = dict(
            kind="task", source_id=t.id, project=(pid, pcode, pname),
            title=f"{t.wbs_code + ' ' if t.wbs_code else ''}{t.name}",
            precision=precision, status=t.status,
            responsible=(mid, mname), company=(cid, cname),
            url=f"/projects/{pid}/schedule", user=user,
        )
        if t.planned_start_at and t.planned_finish_at:
            start, end = as_jst(t.planned_start_at), as_jst(t.planned_finish_at)
            if start < f.range_to and end > f.range_from:
                out.append(_event(record_kind="plan", start_at=start, end_at=end, **common))
        if t.actual_start_at:
            start = as_jst(t.actual_start_at)
            end = as_jst(t.actual_finish_at)
            if start < f.range_to and (end is None or end > f.range_from):
                out.append(_event(record_kind="actual", start_at=start, end_at=end, **common))
    return out


def _milestones(db: Session, user: User, f: CalendarFilters, scope: set[int] | None) -> list[CalendarEventOut]:
    responsible = aliased(User)
    stmt = (
        select(Milestone, Project.id, Project.construction_number, Project.name,
               responsible.id, responsible.name, Company.id, Company.name, MilestoneType.name)
        .join(Project, Project.id == Milestone.project_id)
        .outerjoin(responsible, responsible.id == Milestone.responsible_id)
        .outerjoin(Company, Company.id == Milestone.company_id)
        .outerjoin(MilestoneType, MilestoneType.id == Milestone.milestone_type_id)
        .where(Milestone.deleted_at.is_(None), Project.deleted_at.is_(None))
    )
    stmt = _limit_to_scope(stmt, Milestone.project_id, scope, f)
    stmt = stmt.where(
        or_(
            (Milestone.planned_at >= f.range_from) & (Milestone.planned_at < f.range_to),
            (Milestone.actual_at >= f.range_from) & (Milestone.actual_at < f.range_to),
        )
    )
    out: list[CalendarEventOut] = []
    for m, pid, pcode, pname, rid, rname, cid, cname, type_name in db.execute(stmt).all():
        if not _filters_ok(f, m.status, rid, cid) or not _keyword_ok(f, m.name, pname, type_name):
            continue
        common = dict(
            kind="milestone", source_id=m.id, project=(pid, pcode, pname),
            title=m.name, precision=normalize_precision(m.schedule_precision), status=m.status,
            responsible=(rid, rname), company=(cid, cname),
            # 種別は名称ではなくIDで絞り込む（同名の区分を取り違えない）
            url=(f"/projects/{pid}/schedule/milestones"
                 + (f"?types={m.milestone_type_id}" if m.milestone_type_id else "")),
            user=user,
        )
        planned = as_jst(m.planned_at)
        actual = as_jst(m.actual_at)
        if planned and f.range_from <= planned < f.range_to:
            out.append(_event(record_kind="plan", start_at=planned, end_at=None, **common))
        if actual and f.range_from <= actual < f.range_to:
            out.append(_event(record_kind="actual", start_at=actual, end_at=None, **common))
    return out


def _quality_checks(db: Session, user: User, f: CalendarFilters, scope: set[int] | None) -> list[CalendarEventOut]:
    worker = aliased(User)
    stmt = (
        select(QualityCheck, Project.id, Project.construction_number, Project.name,
               worker.id, worker.name)
        .join(Project, Project.id == QualityCheck.project_id)
        .outerjoin(worker, worker.id == QualityCheck.worker_id)
        .where(QualityCheck.deleted_at.is_(None), Project.deleted_at.is_(None),
               QualityCheck.due_date.is_not(None))
    )
    stmt = _limit_to_scope(stmt, QualityCheck.project_id, scope, f)
    out: list[CalendarEventOut] = []
    for qc, pid, pcode, pname, wid, wname in db.execute(stmt).all():
        start = _day_start(qc.due_date)
        if not (f.range_from <= start < f.range_to):
            continue
        if not _filters_ok(f, qc.status, wid, None) or not _keyword_ok(f, qc.inspect_item, pname, qc.process):
            continue
        out.append(_event(
            kind="quality_check", record_kind="due", source_id=qc.id,
            project=(pid, pcode, pname), title=qc.inspect_item or "品質確認",
            start_at=start, end_at=None, precision="day", status=qc.status,
            responsible=(wid, wname), company=(None, None),
            url="/quality", user=user,
        ))
    return out


def _daily_reports(db: Session, user: User, f: CalendarFilters, scope: set[int] | None) -> list[CalendarEventOut]:
    manager = aliased(User)
    stmt = (
        select(DailyReport, Project.id, Project.construction_number, Project.name,
               manager.id, manager.name)
        .join(Project, Project.id == DailyReport.project_id)
        .outerjoin(manager, manager.id == DailyReport.manager_id)
        .where(DailyReport.deleted_at.is_(None), Project.deleted_at.is_(None))
    )
    stmt = _limit_to_scope(stmt, DailyReport.project_id, scope, f)
    out: list[CalendarEventOut] = []
    for r, pid, pcode, pname, mid, mname in db.execute(stmt).all():
        start = _day_start(r.report_date)
        if not (f.range_from <= start < f.range_to):
            continue
        if not _filters_ok(f, r.status, mid, None) or not _keyword_ok(f, r.work_description, pname, r.place):
            continue
        out.append(_event(
            kind="daily_report", record_kind="actual", source_id=r.id,
            project=(pid, pcode, pname), title=r.place or "現場日報",
            start_at=start, end_at=None, precision="day", status=r.status,
            responsible=(mid, mname), company=(None, None),
            url="/daily-report", user=user,
        ))
    return out


def _test_records(db: Session, user: User, f: CalendarFilters, scope: set[int] | None) -> list[CalendarEventOut]:
    tester = aliased(User)
    stmt = (
        select(TestRecord, Project.id, Project.construction_number, Project.name,
               tester.id, tester.name)
        .join(Project, Project.id == TestRecord.project_id)
        .outerjoin(tester, tester.id == TestRecord.tester_id)
        .where(TestRecord.deleted_at.is_(None), Project.deleted_at.is_(None),
               TestRecord.measured_at.is_not(None))
    )
    stmt = _limit_to_scope(stmt, TestRecord.project_id, scope, f)
    stmt = stmt.where(TestRecord.measured_at >= f.range_from, TestRecord.measured_at < f.range_to)
    out: list[CalendarEventOut] = []
    for tr, pid, pcode, pname, uid, uname in db.execute(stmt).all():
        if not _filters_ok(f, tr.judge, uid, None) or not _keyword_ok(f, tr.test_type, pname, tr.instrument):
            continue
        out.append(_event(
            kind="test_record", record_kind="actual", source_id=tr.id,
            project=(pid, pcode, pname), title=tr.test_type,
            # 実測時刻をそのまま持つ（表示は日単位のセルへ置く）
            start_at=as_jst(tr.measured_at), end_at=None, precision="day", status=tr.judge,
            responsible=(uid, uname), company=(None, None),
            url="/quality", user=user,
        ))
    return out


COLLECTORS = {
    "task": _tasks,
    "milestone": _milestones,
    "quality_check": _quality_checks,
    "daily_report": _daily_reports,
    "test_record": _test_records,
}


def collect(db: Session, user: User, f: CalendarFilters, project_id: int | None) -> CalendarEventsOut:
    """すべての種別を集めて1つのカレンダー用リストにする。"""
    scope = _scope(db, user, project_id)
    events: list[CalendarEventOut] = []
    for kind, fn in COLLECTORS.items():
        if f.wants(kind):
            events.extend(fn(db, user, f, scope))

    # 並び順は開始日時→種別→元ID。同日・同名でもIDが違えば別イベントとして残る。
    events.sort(key=lambda e: (e.start_at, e.source_kind, e.record_kind, e.source_id))
    total = len(events)
    shown = events[: f.limit]
    return CalendarEventsOut(
        events=shown,
        total=total,
        displayed=len(shown),
        truncated=total > len(shown),
        limit=f.limit,
        range_from=f.range_from,
        range_to=f.range_to,
    )


@router.get("/calendar/events", response_model=CalendarEventsOut)
def calendar_events(
    project_id: int | None = Query(None, description="案件詳細ルート用。指定案件だけに絞る"),
    f: CalendarFilters = Depends(),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarEventsOut:
    return collect(db, user, f, project_id)


@router.get("/calendar/options", response_model=CalendarOptions)
def calendar_options(
    project_id: int | None = Query(None),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> CalendarOptions:
    """絞り込みの選択肢。同名でも区別できるよう id と name の組で返す。"""
    scope = _scope(db, user, project_id)

    proj_stmt = select(Project).where(Project.deleted_at.is_(None))
    if scope is not None:
        proj_stmt = proj_stmt.where(Project.id.in_(scope or {-1}))
    projects = db.execute(proj_stmt.order_by(Project.construction_number)).scalars().all()
    project_ids = [p.id for p in projects]
    empty = project_ids or [-1]

    def _distinct(stmt):
        return [v for (v,) in db.execute(stmt).all() if v]

    statuses = sorted(set(
        _distinct(select(Task.status).where(Task.deleted_at.is_(None), Task.project_id.in_(empty)).distinct())
        + _distinct(select(Milestone.status).where(Milestone.deleted_at.is_(None), Milestone.project_id.in_(empty)).distinct())
        + _distinct(select(QualityCheck.status).where(QualityCheck.deleted_at.is_(None), QualityCheck.project_id.in_(empty)).distinct())
        + _distinct(select(DailyReport.status).where(DailyReport.deleted_at.is_(None), DailyReport.project_id.in_(empty)).distinct())
        + _distinct(select(TestRecord.judge).where(TestRecord.deleted_at.is_(None), TestRecord.project_id.in_(empty)).distinct())
    ))

    responsible_ids = set(
        _distinct(select(Task.manager_id).where(Task.deleted_at.is_(None), Task.project_id.in_(empty)).distinct())
        + _distinct(select(Milestone.responsible_id).where(Milestone.deleted_at.is_(None), Milestone.project_id.in_(empty)).distinct())
        + _distinct(select(QualityCheck.worker_id).where(QualityCheck.deleted_at.is_(None), QualityCheck.project_id.in_(empty)).distinct())
        + _distinct(select(DailyReport.manager_id).where(DailyReport.deleted_at.is_(None), DailyReport.project_id.in_(empty)).distinct())
        + _distinct(select(TestRecord.tester_id).where(TestRecord.deleted_at.is_(None), TestRecord.project_id.in_(empty)).distinct())
    )
    users = db.execute(
        select(User).where(User.id.in_(responsible_ids or {-1})).order_by(User.name)
    ).scalars().all()

    company_ids = set(
        _distinct(select(Task.company_id).where(Task.deleted_at.is_(None), Task.project_id.in_(empty)).distinct())
        + _distinct(select(Milestone.company_id).where(Milestone.deleted_at.is_(None), Milestone.project_id.in_(empty)).distinct())
    )
    companies = db.execute(
        select(Company).where(Company.id.in_(company_ids or {-1})).order_by(Company.name)
    ).scalars().all()

    return CalendarOptions(
        projects=[IdNameOut(id=p.id, name=f"{p.construction_number} {p.name}") for p in projects],
        source_kinds=[CalendarSourceKind(key=key, label=label)
                      for key, label in SOURCE_KINDS.items()],
        statuses=statuses,
        responsibles=[IdNameOut(id=u.id, name=u.name) for u in users],
        companies=[IdNameOut(id=c.id, name=c.name) for c in companies],
    )
