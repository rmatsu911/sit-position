import hashlib
import io
import uuid
from datetime import datetime

from fastapi import APIRouter, Depends, File, Form, UploadFile, status
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import Photo, User
from app.schemas import PhotoOut
from app.services.storage import get_storage

router = APIRouter()


def _to_out(p: Photo) -> PhotoOut:
    storage = get_storage()
    return PhotoOut(
        id=p.id,
        project_id=p.project_id,
        task_id=p.task_id,
        original_url=storage.url(p.original_file_path) if p.original_file_path else None,
        thumbnail_url=storage.url(p.thumbnail_path) if p.thumbnail_path else None,
        original_filename=p.original_filename,
        taken_at=p.taken_at,
        confirmation_status=p.confirmation_status,
        comment=p.comment,
    )


@router.get("", response_model=list[PhotoOut])
def list_photos(
    project_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[PhotoOut]:
    ensure_project_access(db, user, project_id)
    stmt = (
        select(Photo)
        .where(Photo.project_id == project_id, Photo.deleted_at.is_(None))
        .order_by(Photo.id.desc())
    )
    return [_to_out(p) for p in db.execute(stmt).scalars().all()]


@router.post("", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
def upload_photo(
    project_id: int = Form(...),
    task_id: int | None = Form(None),
    comment: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> PhotoOut:
    ensure_project_access(db, user, project_id)
    raw = file.file.read()
    sha = hashlib.sha256(raw).hexdigest()

    width = height = None
    thumb_bytes = None
    try:
        img = Image.open(io.BytesIO(raw))
        width, height = img.size
        # 原本は保存後変更しない。サムネイルは原本から派生
        thumb = img.copy()
        thumb.thumbnail((400, 400))
        buf = io.BytesIO()
        thumb.convert("RGB").save(buf, format="JPEG", quality=80)
        thumb_bytes = buf.getvalue()
    except Exception:
        pass  # 画像として開けない場合もメタは登録する

    storage = get_storage()
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    key = f"photos/{project_id}/{uuid.uuid4().hex}.{ext}"
    storage.save(key, raw, file.content_type or "application/octet-stream")
    thumb_key = None
    if thumb_bytes:
        thumb_key = f"thumbnails/{project_id}/{uuid.uuid4().hex}.jpg"
        storage.save(thumb_key, thumb_bytes, "image/jpeg")

    p = Photo(
        project_id=project_id,
        task_id=task_id,
        original_file_path=key,
        thumbnail_path=thumb_key,
        original_filename=file.filename,
        mime_type=file.content_type,
        file_size=len(raw),
        width=width,
        height=height,
        sha256=sha,
        taken_at=datetime.now(),
        photographer_id=user.id,
        comment=comment,
        confirmation_status="未確認",
    )
    db.add(p)
    db.flush()
    write_audit(db, user, "CREATE", "photo", p.id, project_id=project_id)
    db.commit()
    db.refresh(p)
    return _to_out(p)
