"""操作履歴（監査ログ）の参照。

`audit_logs` と `task_change_history` に実際に記録されたものだけを返す。
画面が固定の履歴文言を持たないよう、表示文もここで組み立てる。

書き込みはしない（履歴は各APIが操作の一部として記録する）。
"""
from datetime import datetime

from fastapi import APIRouter, Depends, Query
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import AuditLog, Task, TaskChangeHistory, User
from app.schemas import AuditEntryOut, AuditLogOut

router = APIRouter()

# 監査ログの entity_type → 日本語の対象名。
# ここに無い種別は entity_type をそのまま出す（英語のまま出るのは、
# 記録しているのに表示名を決めていないことが分かるほうがよいため）。
ENTITY_LABELS = {
    "project": "案件",
    "project_ledger": "工事台帳",
    "project_material": "資材",
    "task": "工程",
    "site": "現場",
    "asset": "設備",
    "photo": "施工写真",
    "quality_check": "品質確認",
    "daily_report": "現場日報",
    "document": "図面・書類",
    "milestone": "マイルストーン",
    "test_record": "試験記録",
    "worker_assignment": "要員配置",
    "report": "帳票",
    "cross_schedule": "横断工程表",
    "cross_milestones": "横断マイルストーン",
    "ai_prediction": "AI推論結果",
}

ACTION_LABELS = {
    "CREATE": "登録",
    "UPDATE": "更新",
    "DELETE": "削除",
    "EXPORT": "出力",
    "REFLECT": "工程へ反映",
    "FEEDBACK": "確認結果を登録",
}

# 工程の変更履歴に出る列名 → 日本語。
FIELD_LABELS = {
    "name": "工程名",
    "wbs_code": "WBS",
    "parent_task_id": "親工程",
    "planned_start_at": "予定開始",
    "planned_finish_at": "予定終了",
    "actual_start_at": "実績開始",
    "actual_finish_at": "実績終了",
    "planned_progress": "予定進捗",
    "actual_progress": "実績進捗",
    "planned_workers": "予定人数",
    "actual_workers": "実績人数",
    "status": "状態",
    "notes": "備考",
    "delay_reason": "遅延理由",
    "schedule_precision": "入力粒度",
    "work_type_id": "工種",
    "process_type_id": "工程種別",
    "team_id": "担当班",
    "manager_id": "責任者",
    "company_id": "担当会社",
    "site_id": "現場",
    "dependencies": "先行工程",
}


def _user_names(db: Session, ids: set[int]) -> dict[int, str]:
    if not ids:
        return {}
    rows = db.execute(select(User.id, User.name).where(User.id.in_(ids))).all()
    return {i: n for i, n in rows}


@router.get("/projects/{project_id}/audit-logs", response_model=AuditLogOut)
def project_audit_logs(
    project_id: int,
    limit: int = Query(50, ge=1, le=200),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AuditLogOut:
    """この案件の操作履歴。

    `audit_logs`（誰が何を操作したか）と `task_change_history`（工程のどの項目が
    どう変わったか）を1本の時系列にまとめる。記録が無ければ空で返す
    （固定の履歴を出さない）。
    """
    ensure_project_access(db, user, project_id)

    # 表示件数より多めに取り、2つの記録を混ぜてから切り詰める
    fetch = limit * 2

    audits = db.execute(
        select(AuditLog).where(AuditLog.project_id == project_id)
        .order_by(AuditLog.created_at.desc(), AuditLog.id.desc()).limit(fetch)
    ).scalars().all()

    changes = db.execute(
        select(TaskChangeHistory, Task.wbs_code, Task.name)
        .join(Task, Task.id == TaskChangeHistory.task_id)
        .where(Task.project_id == project_id)
        .order_by(TaskChangeHistory.created_at.desc(), TaskChangeHistory.id.desc())
        .limit(fetch)
    ).all()

    names = _user_names(
        db,
        {a.user_id for a in audits if a.user_id} | {c.changed_by for c, _, _ in changes if c.changed_by},
    )

    entries: list[AuditEntryOut] = []

    for a in audits:
        entity = ENTITY_LABELS.get(a.entity_type, a.entity_type)
        action = ACTION_LABELS.get(a.action, a.action)
        entries.append(AuditEntryOut(
            at=a.created_at,
            # 記録に利用者が紐づいていない操作は「利用者不明」。
            # 実際にはシステムが行っていない操作を「システム」とは書かない。
            user=names.get(a.user_id or -1) or "利用者不明",
            summary=f"{entity}を{action}",
            source="audit_log",
            entity_type=a.entity_type,
            entity_id=a.entity_id,
        ))

    for c, wbs, task_name in changes:
        label = FIELD_LABELS.get(c.field, c.field)
        target = f"{wbs} {task_name}".strip() if wbs else task_name
        detail = f"{c.old_value or '未設定'} → {c.new_value or '未設定'}"
        summary = f"工程「{target}」の{label}を変更（{detail}）"
        if c.change_reason:
            summary += f" 理由: {c.change_reason}"
        entries.append(AuditEntryOut(
            at=c.created_at,
            user=names.get(c.changed_by or -1) or "利用者不明",
            summary=summary,
            source="task_change",
            entity_type="task",
            entity_id=str(c.task_id),
        ))

    entries.sort(key=lambda e: (e.at or datetime.min), reverse=True)
    return AuditLogOut(entries=entries[:limit], returned=len(entries[:limit]), limit=limit)
