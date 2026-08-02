from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import Asset, Task, TestRecord, User
from app.schemas import TestRecordCreate, TestRecordOut
from app.services.storage import get_storage

router = APIRouter()


def to_out(db: Session, r: TestRecord) -> TestRecordOut:
    tester = db.get(User, r.tester_id) if r.tester_id else None
    asset = db.get(Asset, r.asset_id) if r.asset_id else None
    task = db.get(Task, r.task_id) if r.task_id else None
    return TestRecordOut(
        id=r.id, project_id=r.project_id, site_id=r.site_id, asset_id=r.asset_id,
        asset=asset.name if asset else None, task_id=r.task_id, task=task.name if task else None,
        test_type=r.test_type, measured_at=r.measured_at, tester=tester.name if tester else None,
        measured_value=r.measured_value, unit=r.unit, standard_value=r.standard_value, judge=r.judge,
        instrument=r.instrument, attachment_url=get_storage().url(r.attachment_path) if r.attachment_path else None,
        comment=r.comment,
    )


@router.get("", response_model=list[TestRecordOut])
def list_test_records(
    project_id: int,
    asset_id: int | None = None,
    task_id: int | None = None,
    test_type: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[TestRecordOut]:
    ensure_project_access(db, user, project_id)
    stmt = select(TestRecord).where(TestRecord.project_id == project_id, TestRecord.deleted_at.is_(None))
    if asset_id is not None:
        stmt = stmt.where(TestRecord.asset_id == asset_id)
    if task_id is not None:
        stmt = stmt.where(TestRecord.task_id == task_id)
    if test_type:
        stmt = stmt.where(TestRecord.test_type == test_type)
    return [to_out(db, r) for r in db.execute(stmt.order_by(TestRecord.id.desc())).scalars().all()]


@router.get("/{record_id}", response_model=TestRecordOut)
def get_test_record(record_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> TestRecordOut:
    r = db.get(TestRecord, record_id)
    if not r or r.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "試験記録が見つかりません")
    ensure_project_access(db, user, r.project_id)
    return to_out(db, r)


@router.post("", response_model=TestRecordOut, status_code=status.HTTP_201_CREATED)
def create_test_record(
    body: TestRecordCreate,
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER", "QUALITY_MANAGER")),
) -> TestRecordOut:
    ensure_project_access(db, user, body.project_id)
    r = TestRecord(
        project_id=body.project_id, site_id=body.site_id, asset_id=body.asset_id, task_id=body.task_id,
        test_type=body.test_type, measured_at=body.measured_at or datetime.now(timezone.utc), tester_id=user.id,
        measured_value=body.measured_value, unit=body.unit, standard_value=body.standard_value,
        judge=body.judge, instrument=body.instrument, comment=body.comment,
    )
    db.add(r)
    db.flush()
    write_audit(db, user, "CREATE", "test_record", r.id, project_id=body.project_id,
                after={"test_type": body.test_type, "judge": body.judge})
    db.commit()
    db.refresh(r)
    return to_out(db, r)
