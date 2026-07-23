from datetime import datetime

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import Project, Task, User
from app.services.reports import ReportSpec, render

router = APIRouter()

# 対応帳票（将来ここに追加：施工写真台帳/工程表/日報/品質チェック表/試験記録/完成報告書…）
REPORT_TYPES = {
    "construction-management": "施工管理表",
}


def _ymd(dt) -> str:
    if not dt:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%m/%d")
    return str(dt)[5:10].replace("-", "/")


def _build_construction_management(db: Session, project: Project) -> ReportSpec:
    tasks = db.execute(
        select(Task).where(Task.project_id == project.id, Task.deleted_at.is_(None), Task.wbs_code.like("%.%"))
        .order_by(Task.wbs_code)
    ).scalars().all()
    columns = ["工程", "予定期間", "実績期間", "延べ人数", "進捗", "状態"]
    rows = []
    for t in tasks:
        plan = f"{_ymd(t.planned_start_at)}〜{_ymd(t.planned_finish_at)}"
        actual = f"{_ymd(t.actual_start_at)}〜{_ymd(t.actual_finish_at)}" if t.actual_start_at else "—"
        rows.append([t.name, plan, actual, str(t.actual_workers), f"{t.actual_progress}%", t.status])
    meta = [
        ("工事名", project.name),
        ("工事番号", project.construction_number),
        ("進捗", f"実績 {project.actual_progress}% / 予定 {project.planned_progress}%"),
        ("出力日時", datetime.now().strftime("%Y/%m/%d %H:%M")),
    ]
    return ReportSpec(title="施工管理表", meta=meta, columns=columns, rows=rows)


BUILDERS = {
    "construction-management": _build_construction_management,
}


@router.get("/types")
def report_types(user: User = Depends(get_current_user)) -> dict:
    return {"types": [{"key": k, "label": v} for k, v in REPORT_TYPES.items()], "formats": ["pdf", "xlsx"]}


@router.get("/{report_type}")
def export_report(
    report_type: str,
    project_id: int,
    format: str = "pdf",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """帳票を生成して直接ダウンロード。PostgreSQL→FastAPI→帳票→ダウンロード。"""
    if report_type not in BUILDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "対応していない帳票です")
    if format not in ("pdf", "xlsx"):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "形式は pdf / xlsx のみ")
    project = ensure_project_access(db, user, project_id)
    spec = BUILDERS[report_type](db, project)
    data, content_type = render(spec, format)
    write_audit(db, user, "EXPORT", "report", report_type, project_id=project_id, after={"format": format})
    db.commit()
    ext = "xlsx" if format == "xlsx" else "pdf"
    filename = f"{report_type}_{project.construction_number}.{ext}"
    return Response(
        content=data, media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
