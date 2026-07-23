import uuid

from fastapi import APIRouter, Depends, File, Form, HTTPException, Query, UploadFile, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.audit import write_audit
from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user, require_roles
from app.models import Document, DocumentVersion, User
from app.schemas import DocumentDetailOut, DocumentOut, DocumentUpdate, DocumentVersionOut
from app.services.storage import get_storage

router = APIRouter()


def to_out(db: Session, d: Document) -> DocumentOut:
    editor = db.get(User, d.updated_by) if d.updated_by else None
    return DocumentOut(
        id=d.id, project_id=d.project_id, no=d.doc_no, name=d.name, type=d.doc_type,
        rev=d.current_rev, updatedAt=d.updated_at, updatedBy=editor.name if editor else None, approval=d.status,
    )


@router.get("", response_model=list[DocumentOut])
def list_documents(
    project_id: int | None = None, db: Session = Depends(get_db), user: User = Depends(get_current_user)
) -> list[DocumentOut]:
    stmt = select(Document).where(Document.deleted_at.is_(None))
    if project_id is not None:
        ensure_project_access(db, user, project_id)
        stmt = stmt.where(Document.project_id == project_id)
    return [to_out(db, d) for d in db.execute(stmt.order_by(Document.id)).scalars().all()]


@router.get("/{document_id}", response_model=DocumentDetailOut)
def get_document(document_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> DocumentDetailOut:
    d = db.get(Document, document_id)
    if not d or d.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "図面が見つかりません")
    if d.project_id:
        ensure_project_access(db, user, d.project_id)
    versions = db.execute(
        select(DocumentVersion).where(DocumentVersion.document_id == document_id).order_by(DocumentVersion.id.desc())
    ).scalars().all()
    storage = get_storage()
    vout = []
    for v in versions:
        editor = db.get(User, v.updated_by) if v.updated_by else None
        vout.append(DocumentVersionOut(
            id=v.id, rev=v.rev, original_filename=v.original_filename, note=v.note,
            updated_by=editor.name if editor else None, updated_at=v.updated_at,
            file_url=storage.url(v.file_path) if v.file_path else None,
            mime_type=_guess_mime(v.original_filename or v.file_path or ""),
        ))
    return DocumentDetailOut(**to_out(db, d).model_dump(), versions=vout)


def _guess_mime(name: str) -> str:
    ext = name.rsplit(".", 1)[-1].lower() if "." in name else ""
    return {
        "pdf": "application/pdf", "png": "image/png", "jpg": "image/jpeg", "jpeg": "image/jpeg",
        "gif": "image/gif", "webp": "image/webp",
    }.get(ext, "application/octet-stream")


def _next_rev(current: str | None) -> str:
    """Rev.n → Rev.(n+1)。原版は上書きしない。"""
    if not current or not current.startswith("Rev."):
        return "Rev.0"
    try:
        return f"Rev.{int(current.split('.')[1]) + 1}"
    except (ValueError, IndexError):
        return "Rev.0"


@router.post("", response_model=DocumentDetailOut, status_code=status.HTTP_201_CREATED)
def upload_document(
    document_id: int | None = Form(None),
    project_id: int | None = Form(None),
    doc_no: str | None = Form(None),
    name: str | None = Form(None),
    doc_type: str | None = Form(None),
    note: str | None = Form(None),
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER", "FIELD_WORKER")),
) -> DocumentDetailOut:
    """新規図面の登録、または既存図面への新しい版の追加（古い版は残す）。"""
    storage = get_storage()
    raw = file.file.read()
    ext = (file.filename or "bin").rsplit(".", 1)[-1].lower()
    key = f"documents/{uuid.uuid4().hex}.{ext}"
    storage.save(key, raw, file.content_type or "application/octet-stream")

    if document_id:
        d = db.get(Document, document_id)
        if not d or d.deleted_at is not None:
            raise HTTPException(status.HTTP_404_NOT_FOUND, "図面が見つかりません")
        if d.project_id:
            ensure_project_access(db, user, d.project_id)
        rev = _next_rev(d.current_rev)
        d.current_rev = rev
        d.status = "確認中"
        d.updated_by = user.id
        if name:
            d.name = name
        action = "UPDATE"
    else:
        if project_id:
            ensure_project_access(db, user, project_id)
        count = db.query(Document).count()
        d = Document(
            project_id=project_id, doc_no=doc_no or f"DWG-{count + 1:03d}", name=name or (file.filename or "図面"),
            doc_type=doc_type, status="未提出", current_rev="Rev.0", updated_by=user.id,
        )
        db.add(d)
        db.flush()
        rev = "Rev.0"
        action = "CREATE"

    db.add(DocumentVersion(document_id=d.id, rev=rev, file_path=key,
                           original_filename=file.filename, note=note, updated_by=user.id))
    db.flush()
    write_audit(db, user, action, "document", d.id, project_id=d.project_id, after={"rev": rev, "filename": file.filename})
    db.commit()
    db.refresh(d)
    return get_document(d.id, db, user)


@router.patch("/{document_id}", response_model=DocumentOut)
def update_document(
    document_id: int, body: DocumentUpdate, db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> DocumentOut:
    d = db.get(Document, document_id)
    if not d or d.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "図面が見つかりません")
    if d.project_id:
        ensure_project_access(db, user, d.project_id)
    data = body.model_dump(exclude_unset=True)
    if "status" in data:
        d.status = data["status"]
    if "name" in data:
        d.name = data["name"]
    if "doc_type" in data:
        d.doc_type = data["doc_type"]
    d.updated_by = user.id
    write_audit(db, user, "UPDATE", "document", d.id, project_id=d.project_id, after=data)
    db.commit()
    db.refresh(d)
    return to_out(db, d)


@router.delete("/{document_id}", status_code=status.HTTP_204_NO_CONTENT)
def delete_document(
    document_id: int, reason: str | None = Query(None), db: Session = Depends(get_db),
    user: User = Depends(require_roles("PROJECT_MANAGER")),
) -> None:
    from datetime import datetime, timezone
    d = db.get(Document, document_id)
    if not d or d.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "図面が見つかりません")
    if d.project_id:
        ensure_project_access(db, user, d.project_id)
    d.deleted_at = datetime.now(timezone.utc)
    d.deleted_by = user.id
    d.delete_reason = reason
    write_audit(db, user, "DELETE", "document", d.id, project_id=d.project_id)
    db.commit()
