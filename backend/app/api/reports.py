from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Response, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import Project, Task, User
from app.schemas import ReportPreviewOut
from app.services.reports import ReportSpec, render

router = APIRouter()

# 対応帳票（将来ここに追加：施工写真台帳/工程表/日報/品質チェック表/試験記録/完成報告書…）
REPORT_TYPES = {
    "construction-management": "施工管理表",
}

FORMATS = ("pdf", "xlsx", "csv")
_EXT = {"pdf": "pdf", "xlsx": "xlsx", "csv": "csv"}


def _ymd(dt) -> str:
    if not dt:
        return "—"
    if isinstance(dt, datetime):
        return dt.strftime("%m/%d")
    return str(dt)[5:10].replace("-", "/")


def _period(start, finish) -> str:
    if not start and not finish:
        return "—"
    return f"{_ymd(start)}〜{_ymd(finish)}"


def _wbs_key(code: str | None) -> list:
    """WBS を数値の並びとして比較する（"2" < "10" になるように）。"""
    parts = (code or "").split(".")
    return [(0, int(p)) if p.isdigit() else (1, p) for p in parts]


def leaf_tasks(db: Session, project_id: int) -> list[Task]:
    """帳票へ載せる工程（末端工程）を WBS 順で返す。

    「WBS にドットが無い＝親」ではない。子を持たない工程が末端であり、
    親子を作っていない案件では**すべての工程が末端**になる。
    子の有無は `parent_task_id` と、WBS の接頭辞（"1" に対する "1.1"）の両方で判定する。
    """
    tasks = db.execute(
        select(Task).where(Task.project_id == project_id, Task.deleted_at.is_(None))
    ).scalars().all()
    parent_ids = {t.parent_task_id for t in tasks if t.parent_task_id}
    codes = [t.wbs_code for t in tasks if t.wbs_code]
    leaves = []
    for t in tasks:
        if t.id in parent_ids:
            continue
        if t.wbs_code and any(c != t.wbs_code and c.startswith(f"{t.wbs_code}.") for c in codes):
            continue
        leaves.append(t)
    return sorted(leaves, key=lambda t: (_wbs_key(t.wbs_code), t.id))


def _build_construction_management(db: Session, project: Project, user: User) -> ReportSpec:
    """施工管理表。**工程（tasks）が正データ**で、画面・PDF・Excel・CSV はこの1本から作る。"""
    tasks = leaf_tasks(db, project.id)
    columns = ["WBS", "工程", "予定期間", "実績期間", "予定人数", "実績人数", "進捗", "状態", "備考"]
    rows = [
        [
            t.wbs_code or "—",
            t.name,
            _period(t.planned_start_at, t.planned_finish_at),
            _period(t.actual_start_at, t.actual_finish_at),
            str(t.planned_workers or 0),
            str(t.actual_workers or 0),
            f"{t.actual_progress}%",
            t.status,
            t.notes or "—",
        ]
        for t in tasks
    ]
    meta = [
        ("工事名", project.name),
        ("工事番号", project.construction_number),
        ("進捗", f"実績 {project.actual_progress}% / 予定 {project.planned_progress}%"),
        ("工程件数", f"{len(rows)} 件"),
        ("出力日時", datetime.now(timezone.utc).astimezone().strftime("%Y/%m/%d %H:%M")),
        ("出力者", user.name or user.email),
    ]
    return ReportSpec(title="施工管理表", meta=meta, columns=columns, rows=rows)


BUILDERS = {
    "construction-management": _build_construction_management,
}

# 工程から自動生成する帳票（画面では編集しない）。
# 手入力の帳票を作る場合は、下書きをDBへ保存する仕組みが別途必要になる。
AUTO_GENERATED = set(BUILDERS)


@router.get("/types")
def report_types(user: User = Depends(get_current_user)) -> dict:
    return {
        "types": [
            {"key": k, "label": v, "source": "tasks" if k in AUTO_GENERATED else "manual"}
            for k, v in REPORT_TYPES.items()
        ],
        "formats": list(FORMATS),
    }


def _spec_for(report_type: str, project_id: int, db: Session, user: User) -> tuple[Project, ReportSpec]:
    if report_type not in BUILDERS:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "対応していない帳票です")
    project = ensure_project_access(db, user, project_id)
    return project, BUILDERS[report_type](db, project, user)


@router.get("/{report_type}/preview", response_model=ReportPreviewOut)
def preview_report(
    report_type: str,
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> ReportPreviewOut:
    """画面・プレビュー・印刷が使う帳票の内容。

    PDF / Excel / CSV とまったく同じ `ReportSpec` を返すため、画面に出た工程が
    そのまま同じ順序・同じ値で出力される。画面側で行を作らない。
    """
    project, spec = _spec_for(report_type, project_id, db, user)
    return ReportPreviewOut(
        report_type=report_type,
        title=spec.title,
        project_id=project.id,
        construction_number=project.construction_number,
        project_name=project.name,
        meta=[{"label": k, "value": v} for k, v in spec.meta],
        columns=spec.columns,
        rows=spec.rows,
        row_count=len(spec.rows),
        source="tasks" if report_type in AUTO_GENERATED else "manual",
        formats=list(FORMATS),
    )


@router.get("/{report_type}")
def export_report(
    report_type: str,
    project_id: int,
    format: str = "pdf",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> Response:
    """帳票を生成して直接ダウンロード。PostgreSQL→FastAPI→帳票→ダウンロード。"""
    if format not in FORMATS:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "形式は pdf / xlsx / csv のみ")
    project, spec = _spec_for(report_type, project_id, db, user)
    data, content_type = render(spec, format)
    write_audit(db, user, "EXPORT", "report", report_type, project_id=project_id, after={"format": format})
    db.commit()
    filename = f"{report_type}_{project.construction_number}.{_EXT[format]}"
    return Response(
        content=data, media_type=content_type,
        headers={"Content-Disposition": f'attachment; filename="{filename}"'},
    )
