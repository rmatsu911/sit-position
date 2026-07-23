"""AI接続準備（構造のみ）。

この段階では本物の YOLO / ViT / OCR / LLM 推論は実装しない。
写真に対する解析ジョブの登録と、ジョブ・予測結果の参照のみを提供する。
実際の推論は将来、AI Worker が ai_analysis_jobs を処理して
ai_predictions を書き込む設計（施工管理APIとは分離可能）。
"""
from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import AiAnalysisJob, AiPrediction, Photo, User
from app.schemas import AiJobOut

router = APIRouter()


@router.post("/photos/{photo_id}/analyze", response_model=AiJobOut, status_code=status.HTTP_202_ACCEPTED)
def enqueue_analysis(
    photo_id: int,
    job_type: str = "detection",
    db: Session = Depends(get_db),
    user: User = Depends(get_current_user),
) -> AiAnalysisJob:
    photo = db.get(Photo, photo_id)
    if not photo or photo.deleted_at is not None:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, photo.project_id)
    job = AiAnalysisJob(photo_id=photo_id, job_type=job_type, status="QUEUED")
    db.add(job)
    db.commit()
    db.refresh(job)
    return job  # Worker未稼働のため QUEUED のまま（推論は未実装）


@router.get("/jobs", response_model=list[AiJobOut])
def list_jobs(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list:
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, photo.project_id)
    stmt = select(AiAnalysisJob).where(AiAnalysisJob.photo_id == photo_id).order_by(AiAnalysisJob.id.desc())
    return list(db.execute(stmt).scalars().all())


@router.get("/predictions")
def list_predictions(photo_id: int, db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list:
    photo = db.get(Photo, photo_id)
    if not photo:
        raise HTTPException(status.HTTP_404_NOT_FOUND, "写真が見つかりません")
    ensure_project_access(db, user, photo.project_id)
    stmt = select(AiPrediction).where(AiPrediction.photo_id == photo_id)
    rows = db.execute(stmt).scalars().all()
    return [
        {
            "id": r.id,
            "prediction_type": r.prediction_type,
            "predicted_label": r.predicted_label,
            "confidence": float(r.confidence) if r.confidence is not None else None,
            "bounding_box": r.bounding_box,
        }
        for r in rows
    ]
