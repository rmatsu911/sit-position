import json
from typing import Any

from sqlalchemy.orm import Session

from app.models import AuditLog, User


def _dump(obj: Any) -> str | None:
    if obj is None:
        return None
    try:
        return json.dumps(obj, ensure_ascii=False, default=str)
    except TypeError:
        return str(obj)


def write_audit(
    db: Session,
    user: User | None,
    action: str,
    entity_type: str,
    entity_id: str | int | None,
    project_id: int | None = None,
    before: Any = None,
    after: Any = None,
) -> None:
    db.add(
        AuditLog(
            user_id=user.id if user else None,
            action=action,
            entity_type=entity_type,
            entity_id=str(entity_id) if entity_id is not None else None,
            project_id=project_id,
            before=_dump(before),
            after=_dump(after),
        )
    )
