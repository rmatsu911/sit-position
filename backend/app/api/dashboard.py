from datetime import date, datetime

from fastapi import APIRouter, Depends
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import accessible_project_ids, get_current_user
from app.models import DailyReport, Photo, Project, QualityCheck, Task, User, Worker
from app.schemas import DashboardSummaryOut

router = APIRouter()


@router.get("/summary", response_model=DashboardSummaryOut)
def summary(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DashboardSummaryOut:
    allowed = accessible_project_ids(db, user)  # None=全案件

    def scope_projects(stmt):
        return stmt if allowed is None else stmt.where(Project.id.in_(allowed))

    def scope(stmt, col):
        return stmt if allowed is None else stmt.where(col.in_(allowed))

    today = date.today()
    proj_ids = db.execute(scope_projects(select(Project.id)).where(Project.deleted_at.is_(None))).scalars().all()
    proj_set = set(proj_ids)

    total = len(proj_ids)
    active = db.execute(
        scope_projects(select(func.count(Project.id))).where(Project.deleted_at.is_(None), Project.status == "施工中")
    ).scalar() or 0
    delayed = db.execute(
        scope_projects(select(func.count(Project.id))).where(Project.deleted_at.is_(None), Project.status == "遅延")
    ).scalar() or 0

    # 本日作業中：本日が予定期間内の工程を持つ案件数
    working_today = 0
    finish_today = 0
    if proj_set:
        tstmt = select(Task).where(Task.project_id.in_(proj_set), Task.deleted_at.is_(None))
        working_pids, finish_pids = set(), set()
        for t in db.execute(tstmt).scalars().all():
            ps = t.planned_start_at.date() if isinstance(t.planned_start_at, datetime) else t.planned_start_at
            pe = t.planned_finish_at.date() if isinstance(t.planned_finish_at, datetime) else t.planned_finish_at
            if ps and pe and ps <= today <= pe:
                working_pids.add(t.project_id)
            if pe == today:
                finish_pids.add(t.project_id)
        working_today = len(working_pids)
        finish_today = len(finish_pids)

    photo_pending = 0
    quality_waiting = 0
    report_pending = 0
    if proj_set:
        photo_pending = db.execute(
            select(func.count(Photo.id)).where(Photo.project_id.in_(proj_set), Photo.deleted_at.is_(None), Photo.confirmation_status == "未確認")
        ).scalar() or 0
        quality_waiting = db.execute(
            select(func.count(QualityCheck.id)).where(QualityCheck.project_id.in_(proj_set), QualityCheck.deleted_at.is_(None), QualityCheck.status == "確認待ち")
        ).scalar() or 0
        report_pending = db.execute(
            select(func.count(DailyReport.id)).where(DailyReport.project_id.in_(proj_set), DailyReport.deleted_at.is_(None), DailyReport.status == "DRAFT")
        ).scalar() or 0

    # 本日の要員：稼働中の要員数
    people_today = db.execute(
        select(func.count(Worker.id)).where(Worker.deleted_at.is_(None), Worker.status == "稼働")
    ).scalar() or 0

    return DashboardSummaryOut(
        total=total, active=active, delayed=delayed, workingToday=working_today, finishToday=finish_today,
        photoPending=photo_pending, qualityWaiting=quality_waiting, reportPending=report_pending, peopleToday=people_today,
    )
