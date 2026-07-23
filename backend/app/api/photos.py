import hashlib
import io
import json
import uuid
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, Form, HTTPException, Query, UploadFile, File, status
from PIL import Image
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import (
    AiAnalysisJob,
    AiPrediction,
    AssetType,
    Photo,
    ProcessType,
    User,
    WorkType,
)
from app.schemas import DetectionOut, PhotoAiOut, PhotoConfirmUpdate, PhotoOut, PhotoUpdate
from app.services.storage import get_storage

router = APIRouter()


def _tags(p: Photo) -> list[str]:
    if not p.tags:
        return []
    try:
        return json.loads(p.tags)
    except (json.JSONDecodeError, TypeError):
        return []


def to_out(db: Session, p: Photo) -> PhotoOut:
    storage = get_storage()
    photographer = db.get(User, p.photographer_id) if p.photographer_id else None
    wt = db.get(WorkType, p.confirmed_work_type_id) if p.confirmed_work_type_id else None
    pt = db.get(ProcessType, p.confirmed_process_type_id) if p.confirmed_process_type_id else None
    at = db.get(AssetType, p.confirmed_asset_type_id) if p.confirmed_asset_type_id else None
    gps = None
    if p.latitude is not None and p.longitude is not None:
        gps = f"{p.latitude}, {p.longitude}"
    return PhotoOut(
        id=p.id, project_id=p.project_id, site_id=p.site_id, asset_id=p.asset_id, task_id=p.task_id,
        photo_type_id=p.photo_type_id, no=p.photo_no, taken_at=p.taken_at,
        photographer=photographer.name if photographer else None, place=p.place, gps=gps,
        work_type=wt.name if wt else None, process=pt.name if pt else None,
        equipment=at.name if at else None, tags=_tags(p), comment=p.comment,
        confirm=p.confirmation_status, favorite=p.favorite, ai_candidate=at.name if at else None,
        original_url=storage.url(p.original_file_path) if p.original_file_path else None,
        thumbnail_url=storage.url(p.thumbnail_path) if p.thumbnail_path else None, uploaded=True,
    )


@router.get("", response_model=list[PhotoOut])
def list_photos(
    project_id: int,
    site_id: int | None = None,
    asset_id: int | None = None,
    task_id: int | None = None,
    photo_type_id: int | None = None,
    confirm: str | None = None,
    favorite: bool | None = None,
    tag: str | None = None,
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> list[PhotoOut]:
    ensure_project_access(db, user, project_id)
    stmt = select(Photo).where(Photo.project_id == project_id, Photo.deleted_at.is_(None))
    if site_id is not None:
        stmt = stmt.where(Photo.site_id == site_id)
    if asset_id is not None:
        stmt = stmt.where(Photo.asset_id == asset_id)
    if task_id is not None:
        stmt = stmt.where(Photo.task_id == task_id)
    if photo_type_id is not None:
        stmt = stmt.where(Photo.photo_type_id == photo_type_id)
    if confirm:
        stmt = stmt.where(Photo.confirmation_status == confirm)
    if favorite is not None:
        stmt = stmt.where(Photo.favorite.is_(favorite))
    stmt = stmt.order_by(Photo.id)
    rows = [to_out(db, p) for p in db.execute(stmt).scalars().all()]
    if tag:
        rows = [r for r in rows if tag in r.tags]
    return rows


@router.get("/{photo_id}", response_model=PhotoOut)
def get_photo(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> PhotoOut:
    p = db.get(Photo, photo_id)
    if not p or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, p.project_id)
    return to_out(db, p)


@router.post("", response_model=PhotoOut, status_code=status.HTTP_201_CREATED)
def upload_photo(
    project_id: int = Form(...),
    site_id: int | None = Form(None),
    asset_id: int | None = Form(None),
    task_id: int | None = Form(None),
    photo_type_id: int | None = Form(None),
    place: str | None = Form(None),
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
        thumb = img.copy()
        thumb.thumbnail((400, 400))
        buf = io.BytesIO()
        thumb.convert("RGB").save(buf, format="JPEG", quality=80)
        thumb_bytes = buf.getvalue()
    except Exception:
        pass

    storage = get_storage()
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    key = f"photos/{project_id}/{uuid.uuid4().hex}.{ext}"
    storage.save(key, raw, file.content_type or "application/octet-stream")
    thumb_key = None
    if thumb_bytes:
        thumb_key = f"thumbnails/{project_id}/{uuid.uuid4().hex}.jpg"
        storage.save(thumb_key, thumb_bytes, "image/jpeg")

    count = db.query(Photo).filter(Photo.project_id == project_id).count()
    p = Photo(
        project_id=project_id, site_id=site_id, asset_id=asset_id, task_id=task_id, photo_type_id=photo_type_id,
        original_file_path=key, thumbnail_path=thumb_key, original_filename=file.filename,
        mime_type=file.content_type, file_size=len(raw), width=width, height=height, sha256=sha,
        taken_at=datetime.now(), photographer_id=user.id, place=place, comment=comment,
        confirmation_status="未確認", photo_no=f"P-{count + 1:03d}", tags="[]", favorite=False,
    )
    db.add(p)
    db.flush()
    write_audit(db, user, "CREATE", "photo", p.id, project_id=project_id, after={"filename": file.filename})
    db.commit()
    db.refresh(p)
    return to_out(db, p)


@router.patch("/{photo_id}", response_model=PhotoOut)
def edit_photo(
    photo_id: int, body: PhotoUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PhotoOut:
    p = db.get(Photo, photo_id)
    if not p or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, p.project_id)
    data = body.model_dump(exclude_unset=True)
    before = {}
    if "tags" in data:
        before["tags"] = _tags(p)
        p.tags = json.dumps(data.pop("tags"), ensure_ascii=False)
    for k, v in data.items():
        before[k] = getattr(p, k)
        setattr(p, k, v)
    write_audit(db, user, "UPDATE", "photo", p.id, project_id=p.project_id, before=before, after=data)
    db.commit()
    db.refresh(p)
    return to_out(db, p)


@router.patch("/{photo_id}/confirm", response_model=PhotoOut)
def confirm_photo(
    photo_id: int, body: PhotoConfirmUpdate, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> PhotoOut:
    p = db.get(Photo, photo_id)
    if not p or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, p.project_id)
    old = p.confirmation_status
    p.confirmation_status = body.confirmation_status
    p.confirmed_by = user.id
    p.confirmed_at = datetime.now(timezone.utc)
    write_audit(db, user, "UPDATE", "photo", p.id, project_id=p.project_id, before={"confirmation_status": old}, after={"confirmation_status": p.confirmation_status})
    db.commit()
    db.refresh(p)
    return to_out(db, p)


@router.delete("/{photo_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_photo(
    photo_id: int, reason: str | None = Query(None), db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> None:
    p = db.get(Photo, photo_id)
    if not p or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, p.project_id)
    p.deleted_at = datetime.now(timezone.utc)
    p.deleted_by = user.id
    p.delete_reason = reason
    write_audit(db, user, "DELETE", "photo", p.id, project_id=p.project_id)
    db.commit()


_KIND_BY_LABEL = {"クロージャ": "closure", "固定金具": "closure", "融着点": "closure"}


@router.get("/{photo_id}/ai", response_model=PhotoAiOut)
def photo_ai(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> PhotoAiOut:
    """AI推論結果（ai_predictions）を返す。将来YOLOが書き込めば同じ経路で表示される。"""
    p = db.get(Photo, photo_id)
    if not p or p.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, p.project_id)
    preds = db.execute(select(AiPrediction).where(AiPrediction.photo_id == photo_id)).scalars().all()
    detections: list[DetectionOut] = []
    recognition: dict = {}
    for i, r in enumerate(preds):
        if r.prediction_type == "detection":
            bbox = None
            if r.bounding_box:
                try:
                    bbox = json.loads(r.bounding_box)
                except json.JSONDecodeError:
                    bbox = None
            kind = _KIND_BY_LABEL.get(r.predicted_label or "", "check" if i >= 2 else "cable")
            detections.append(DetectionOut(label=r.predicted_label or "-", confidence=float(r.confidence or 0), kind=kind, bbox=bbox))
        elif r.prediction_type == "classification":
            if r.raw_result:
                try:
                    recognition = json.loads(r.raw_result)
                except json.JSONDecodeError:
                    recognition = {"認識結果": r.predicted_label}
            else:
                recognition = {"認識結果": r.predicted_label}
    # ジョブ状態も返せるよう source を設定
    source = "ai_predictions" if preds else "none"
    return PhotoAiOut(detections=detections, recognition=recognition, source=source)
