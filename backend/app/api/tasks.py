from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import ProcessType, Task, TaskAsset, TaskChangeHistory, TaskDependency, User, WorkType
from app.schemas import TaskCreate, TaskOut, TaskUpdate

router = APIRouter()


def build_out(db: Session, t: Task) -> TaskOut:
    wt = db.get(WorkType, t.work_type_id) if t.work_type_id else None
    pt = db.get(ProcessType, t.process_type_id) if t.process_type_id else None
    mgr = db.get(User, t.manager_id) if t.manager_id else None
    return TaskOut(
        id=t.id,
        project_id=t.project_id,
        parent_task_id=t.parent_task_id,
        wbs_code=t.wbs_code,
        name=t.name,
        work_type=wt.name if wt else None,
        process_type=pt.name if pt else None,
        crew=None,
        manager=mgr.name if mgr else None,
        manager_id=t.manager_id,
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
    t = Task(**data)
    db.add(t)
    db.flush()
    for predecessor_id in body.dependency_ids:
        predecessor = db.get(Task, predecessor_id)
        if not predecessor or predecessor.project_id != project_id:
            raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "先行工程が同じ案件に存在しません")
        db.add(TaskDependency(task_id=t.id, depends_on_task_id=predecessor_id))
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
        for row in db.execute(
            select(TaskDependency).where(TaskDependency.task_id == t.id)
        ).scalars().all():
            db.delete(row)
        for predecessor_id in body.dependency_ids:
            predecessor = db.get(Task, predecessor_id)
            if not predecessor or predecessor.project_id != t.project_id or predecessor.id == t.id:
                raise HTTPException(status.HTTP_422_UNPROCESSABLE_ENTITY, "先行工程が同じ案件に存在しません")
            db.add(TaskDependency(task_id=t.id, depends_on_task_id=predecessor_id))
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
    t.deleted_at = datetime.now(timezone.utc)
    t.deleted_by = user.id
    t.delete_reason = reason
    write_audit(db, user, "DELETE", "task", t.id, project_id=t.project_id)
    db.commit()
