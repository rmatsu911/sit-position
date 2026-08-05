from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import (
    Company,
    ProcessType,
    Task,
    TaskAsset,
    TaskChangeHistory,
    TaskDependency,
    Team,
    User,
    WorkType,
)
from app.schemas import IdNameOut, TaskCreate, TaskFormOptions, TaskOut, TaskUpdate

router = APIRouter()


def build_out(db: Session, t: Task) -> TaskOut:
    wt = db.get(WorkType, t.work_type_id) if t.work_type_id else None
    pt = db.get(ProcessType, t.process_type_id) if t.process_type_id else None
    team = db.get(Team, t.team_id) if t.team_id else None
    mgr = db.get(User, t.manager_id) if t.manager_id else None
    co = db.get(Company, t.company_id) if t.company_id else None
    return TaskOut(
        id=t.id,
        project_id=t.project_id,
        parent_task_id=t.parent_task_id,
        wbs_code=t.wbs_code,
        name=t.name,
        work_type=wt.name if wt else None,
        work_type_id=t.work_type_id,
        process_type=pt.name if pt else None,
        process_type_id=t.process_type_id,
        # 担当班は teams の実データ。未設定は None のまま（仮の班名を作らない）。
        crew=team.name if team else None,
        team_id=t.team_id,
        manager=mgr.name if mgr else None,
        manager_id=t.manager_id,
        company=co.name if co else None,
        company_id=t.company_id,
        site_id=t.site_id,
        planned_start_at=t.planned_start_at,
        planned_finish_at=t.planned_finish_at,
        actual_start_at=t.actual_start_at,
        actual_finish_at=t.actual_finish_at,
        planned_progress=t.planned_progress,
        actual_progress=t.actual_progress,
        planned_workers=t.planned_workers,
        actual_workers=t.actual_workers,
        status=t.status,
        delay_reason=t.delay_reason,
        notes=t.notes,
        schedule_precision=t.schedule_precision or "day",
        dependencies=list(
            db.execute(
                select(TaskDependency.depends_on_task_id).where(TaskDependency.task_id == t.id)
            ).scalars().all()
        ),
    )


@router.get("/projects/{project_id}/tasks", response_model=list[TaskOut])
def list_tasks(
    project_id: int,
    site_id: int | None = None,
    asset_id: int | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TaskOut]:
    ensure_project_access(db, user, project_id)
    stmt = select(Task).where(Task.project_id == project_id, Task.deleted_at.is_(None))
    if site_id is not None:
        stmt = stmt.where(Task.site_id == site_id)
    if asset_id is not None:
        # 選択した設備に紐づく工程（task_assets）に限定
        linked = select(TaskAsset.task_id).where(TaskAsset.asset_id == asset_id)
        stmt = stmt.where(Task.id.in_(linked))
    return [build_out(db, t) for t in db.execute(stmt.order_by(Task.wbs_code)).scalars().all()]


@router.get("/projects/{project_id}/task-form-options", response_model=TaskFormOptions)
def task_form_options(
    project_id: int,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> TaskFormOptions:
    """工程フォームの選択肢（工種・工程種別・担当班・責任者・担当会社）。

    画面が選択肢を持たないよう、すべてマスタの実データから作る。
    登録が無いマスタは空配列になり、画面は「マスタ未登録」として表示する。
    """
    ensure_project_access(db, user, project_id)

    def rows(stmt) -> list[IdNameOut]:
        return [IdNameOut(id=i, name=n) for i, n in db.execute(stmt).all() if n]

    # 使わなくなったマスタ（active=False）は新規選択させない
    def master(model):
        return select(model.id, model.name).where(model.active.is_(True)).order_by(
            model.sort_order, model.id
        )

    return TaskFormOptions(
        work_types=rows(master(WorkType)),
        process_types=rows(master(ProcessType)),
        teams=rows(select(Team.id, Team.name).order_by(Team.name, Team.id)),
        managers=rows(
            select(User.id, User.name).where(User.deleted_at.is_(None)).order_by(User.name, User.id)
        ),
        companies=rows(select(Company.id, Company.name).order_by(Company.name, Company.id)),
    )


def _descendant_ids(db: Session, task_id: int) -> set[int]:
    """その工程の子孫すべて（親子は parent_task_id が正本。WBSの文字列では判定しない）。"""
    seen: set[int] = set()
    frontier = [task_id]
    while frontier:
        rows = db.execute(
            select(Task.id).where(Task.parent_task_id.in_(frontier), Task.deleted_at.is_(None))
        ).scalars().all()
        rows = [r for r in rows if r not in seen]
        if not rows:
            break
        seen.update(rows)
        frontier = rows
    return seen


def _check_parent(db: Session, project_id: int, task_id: int | None, parent_id: int | None) -> None:
    """親工程の指定を検証する。

    - 存在しない／削除済み／別案件の親は 422
    - 自分自身を親にはできない
    - 自分の子孫を親にすると循環するため 422
    """
    if parent_id is None:
        return
    parent = db.get(Task, parent_id)
    if not parent or parent.deleted_at is not None or parent.project_id != project_id:
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "親工程が同じ案件に存在しません")
    if task_id is not None:
        if parent_id == task_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "自分自身を親工程にはできません")
        if parent_id in _descendant_ids(db, task_id):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "自分の子孫を親工程にはできません")


JST = timezone(timedelta(hours=9))


def _naive_jst(d: datetime) -> datetime:
    """日本時間の壁時計（タイムゾーンなし）へ揃える。順序の比較だけに使う。"""
    return d.replace(tzinfo=None) if d.tzinfo is None else d.astimezone(JST).replace(tzinfo=None)


def _check_task_period(
    start: datetime | None, finish: datetime | None, label: str
) -> None:
    """期間は [開始, 終了) の半開区間。終了が開始以前になる保存を止める。

    ドラッグやリサイズは1辺だけを動かすため、画面の操作だけでも
    「終了が開始より前」の期間を作れてしまう。値が確定したあとの組で判定する。
    片側だけの入力（開始のみ・終了のみ）は日程未確定として許容する。
    """
    if start is None or finish is None:
        return
    # 片方だけタイムゾーンが付いていると比較できない（保存済みの値と、これから
    # 保存する値を突き合わせるため起こり得る）。両方を日本時間の壁時計へ揃える。
    if (start.tzinfo is None) != (finish.tzinfo is None):
        start, finish = _naive_jst(start), _naive_jst(finish)
    if finish <= start:
        raise HTTPException(
            status.HTTP_422_UNPROCESSABLE_ENTITY, f"{label}の終了は開始より後にしてください"
        )


_REF_LABELS = {
    "work_type_id": (WorkType, "工種"),
    "process_type_id": (ProcessType, "工程種別"),
    "team_id": (Team, "担当班"),
    "manager_id": (User, "責任者"),
    "company_id": (Company, "担当会社"),
}


def _check_refs(db: Session, values: dict) -> None:
    """工種・工程種別・担当班・責任者・担当会社が実在することを確かめる。

    存在しないIDは DB のFK違反（500）ではなく 422 で返す。
    値を落として黙って保存することはしない（指定が消えたことに気づけないため）。
    """
    for field, (model, label) in _REF_LABELS.items():
        ref_id = values.get(field)
        if ref_id is None:
            continue
        row = db.get(model, ref_id)
        if row is None or getattr(row, "deleted_at", None) is not None:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"{label}が見つかりません")


def _check_wbs_unique(db: Session, project_id: int, wbs_code: str | None, exclude_id: int | None = None) -> None:
    """同じ案件でWBSコードが重複しないようにする（表示順・識別に使うため）。"""
    if not wbs_code:
        return
    stmt = select(Task.id).where(
        Task.project_id == project_id, Task.wbs_code == wbs_code, Task.deleted_at.is_(None)
    )
    if exclude_id is not None:
        stmt = stmt.where(Task.id != exclude_id)
    if db.execute(stmt).first():
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, f"WBS「{wbs_code}」は既に使われています")

def _set_dependencies(db: Session, task: Task, predecessor_ids: list[int]) -> None:
    """先行工程を設定する。

    - 同じ案件の工程だけを先行にできる（他案件・存在しない工程は 422）
    - 自分自身は先行にできない（自己依存）
    - たどると自分へ戻る指定は循環になるため 422
    - 同じ先行を重複して指定しても1件にまとめる
    """
    unique: list[int] = []
    for pid in predecessor_ids:
        if pid not in unique:
            unique.append(pid)

    for predecessor_id in unique:
        predecessor = db.get(Task, predecessor_id)
        if (
            not predecessor
            or predecessor.deleted_at is not None
            or predecessor.project_id != task.project_id
        ):
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "先行工程が同じ案件に存在しません")
        if predecessor_id == task.id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "自分自身を先行工程にはできません")

    # 既存の依存を、この工程の分だけ入れ替える
    for row in db.execute(
        select(TaskDependency).where(TaskDependency.task_id == task.id)
    ).scalars().all():
        db.delete(row)
    db.flush()

    # 依存グラフ（後続 → 先行）を作り、循環しないか確かめる
    edges: dict[int, set[int]] = {}
    for tid, dep in db.execute(
        select(TaskDependency.task_id, TaskDependency.depends_on_task_id)
    ).all():
        edges.setdefault(tid, set()).add(dep)
    edges.setdefault(task.id, set()).update(unique)

    def reaches(start: int, goal: int) -> bool:
        seen: set[int] = set()
        stack = list(edges.get(start, ()))
        while stack:
            cur = stack.pop()
            if cur == goal:
                return True
            if cur in seen:
                continue
            seen.add(cur)
            stack.extend(edges.get(cur, ()))
        return False

    if reaches(task.id, task.id):
        raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "先行工程が循環しています")

    for predecessor_id in unique:
        db.add(TaskDependency(task_id=task.id, depends_on_task_id=predecessor_id))

@router.post("/projects/{project_id}/tasks", response_model=TaskOut, status_code=status.HTTP_201_CREATED)
def create_task(
    project_id: int,
    body: TaskCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> TaskOut:
    ensure_project_access(db, user, project_id)
    data = body.model_dump(exclude={"dependency_ids"})
    data["project_id"] = project_id
    _check_parent(db, project_id, None, data.get("parent_task_id"))
    _check_wbs_unique(db, project_id, data.get("wbs_code"))
    _check_refs(db, data)
    _check_task_period(data.get("planned_start_at"), data.get("planned_finish_at"), "予定期間")
    _check_task_period(data.get("actual_start_at"), data.get("actual_finish_at"), "実績期間")
    t = Task(**data)
    db.add(t)
    db.flush()
    _set_dependencies(db, t, body.dependency_ids)
    write_audit(db, user, "CREATE", "task", t.id, project_id=project_id, after=data)
    db.commit()
    db.refresh(t)
    return build_out(db, t)


@router.put("/tasks/{task_id}", response_model=TaskOut)
def update_task(
    task_id: int,
    body: TaskUpdate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> TaskOut:
    t = db.get(Task, task_id)
    if not t or t.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "工程が見つかりません")
    ensure_project_access(db, user, t.project_id)
    changes = body.model_dump(exclude_unset=True, exclude={"change_reason", "dependency_ids"})
    if "parent_task_id" in changes:
        _check_parent(db, t.project_id, t.id, changes["parent_task_id"])
    if "wbs_code" in changes:
        _check_wbs_unique(db, t.project_id, changes["wbs_code"], exclude_id=t.id)
    _check_refs(db, changes)
    # 片側だけ動かす操作（ドラッグ・リサイズ）でも成立するよう、保存後の値の組で判定する
    merged = lambda f: changes[f] if f in changes else getattr(t, f)  # noqa: E731
    _check_task_period(merged("planned_start_at"), merged("planned_finish_at"), "予定期間")
    _check_task_period(merged("actual_start_at"), merged("actual_finish_at"), "実績期間")
    for field, new_value in changes.items():
        old_value = getattr(t, field)
        if old_value != new_value:
            # 工程変更は上書きせず履歴を残す
            db.add(
                TaskChangeHistory(
                    task_id=t.id,
                    field=field,
                    old_value=str(old_value) if old_value is not None else None,
                    new_value=str(new_value) if new_value is not None else None,
                    changed_by=user.id,
                    change_reason=body.change_reason,
                )
            )
            setattr(t, field, new_value)
    if body.dependency_ids is not None:
        before_deps = sorted(
            db.execute(
                select(TaskDependency.depends_on_task_id).where(TaskDependency.task_id == t.id)
            ).scalars().all()
        )
        _set_dependencies(db, t, body.dependency_ids)
        after_deps = sorted(set(body.dependency_ids))
        if before_deps != after_deps:
            # 先行工程も他の項目と同じように履歴へ残す（誰がいつ付け替えたかを追える）
            db.add(
                TaskChangeHistory(
                    task_id=t.id,
                    field="dependencies",
                    old_value=",".join(str(i) for i in before_deps) or None,
                    new_value=",".join(str(i) for i in after_deps) or None,
                    changed_by=user.id,
                    change_reason=body.change_reason,
                )
            )
            changes["dependency_ids"] = after_deps
    write_audit(db, user, "UPDATE", "task", t.id, project_id=t.project_id, after=changes)
    db.commit()
    db.refresh(t)
    return build_out(db, t)


@router.delete("/tasks/{task_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_task(
    task_id: int,
    reason: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> None:
    t = db.get(Task, task_id)
    if not t or t.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "工程が見つかりません")
    ensure_project_access(db, user, t.project_id)
    active_child = db.execute(
        select(Task.id).where(Task.parent_task_id == t.id, Task.deleted_at.is_(None)).limit(1)
    ).scalar_one_or_none()
    if active_child:
        raise HTTPException(status.HTTP_409_CONFLICT, "子工程がある親工程は削除できません")
    # 削除する工程を指す依存・削除する工程が持つ依存は、どちらも残さない
    for row in db.execute(
        select(TaskDependency).where(
            (TaskDependency.task_id == t.id) | (TaskDependency.depends_on_task_id == t.id)
        )
    ).scalars().all():
        db.delete(row)
    t.deleted_at = datetime.now(timezone.utc)
    t.deleted_by = user.id
    t.delete_reason = reason
    write_audit(db, user, "DELETE", "task", t.id, project_id=t.project_id)
    db.commit()
