"""AI Worker 本体。

ai_analysis_jobs(QUEUED) を1件取得し、
  QUEUED → PROCESSING → COMPLETED（予測をai_predictionsへ保存）
  失敗時: → FAILED（error_message / retry_count を保存）
へ状態遷移する。実行方法:

  python -m ai_worker.worker            # 常駐（poll）
  python -m ai_worker.worker --once     # QUEUEDを1件だけ処理して終了（テスト/CI向け）

施工管理Backendはこの Worker に依存しない（停止していてもAPIは正常）。
"""
from __future__ import annotations

import json
import sys
import time
from datetime import datetime, timezone

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.db import SessionLocal
from app.models import AiAnalysisJob, AiPrediction, Photo
from app.services.storage import get_storage
from ai_worker.predictor import AVAILABLE, FAKE, MODEL_NOT_AVAILABLE, Predictor, get_predictor
from ai_worker.registry import ensure_model


def _now() -> datetime:
    return datetime.now(timezone.utc)


def _load_image_bytes(photo: Photo) -> bytes | None:
    """原本ファイルを読む。ローカルストレージのみ対応（S3は将来）。"""
    import os

    if not photo.original_file_path:
        return None
    path = os.path.join(settings.local_storage_dir, photo.original_file_path)
    if not os.path.exists(path):
        return None
    with open(path, "rb") as f:
        return f.read()


def process_job(db: Session, job: AiAnalysisJob, predictor: Predictor) -> str:
    """1ジョブを処理して最終ステータスを返す。"""
    job.status = "PROCESSING"
    job.started_at = _now()
    db.commit()

    photo = db.get(Photo, job.photo_id)
    model = ensure_model(db, status=("ACTIVE" if predictor.status() == AVAILABLE else predictor.status()))
    db.flush()
    job.model_id = model.id

    try:
        if predictor.status() == MODEL_NOT_AVAILABLE:
            # 実モデル未配置：予測は保存せず、明確に失敗扱いにする（Fakeを実結果にしない）
            raise RuntimeError("MODEL_NOT_AVAILABLE")

        image = _load_image_bytes(photo) if photo else None
        if image is None:
            raise RuntimeError("IMAGE_NOT_FOUND")

        detections = predictor.predict(image)
        for d in detections:
            db.add(AiPrediction(
                job_id=job.id, photo_id=job.photo_id, model_id=model.id,
                prediction_type="detection", predicted_class_id=d.class_id,
                predicted_label=d.label, confidence=d.confidence,
                bounding_box=json.dumps(d.bbox_dict(), ensure_ascii=False),
                raw_result=json.dumps({
                    "code": d.code, "label": d.label, "confidence": d.confidence,
                    "bbox": d.bbox_dict(), "predictor": predictor.kind,
                    "model_version": settings.ai_model_version,
                }, ensure_ascii=False),
            ))
        job.status = "COMPLETED"
        job.completed_at = _now()
        job.error_message = None
        db.commit()
        return "COMPLETED"
    except Exception as e:  # noqa: BLE001
        db.rollback()
        job = db.get(AiAnalysisJob, job.id)
        job.status = "FAILED"
        job.retry_count = (job.retry_count or 0) + 1
        job.error_message = str(e)[:2000]
        job.completed_at = _now()
        db.commit()
        return "FAILED"


def process_one(db: Session, predictor: Predictor | None = None) -> AiAnalysisJob | None:
    """QUEUED を1件処理。無ければ None。"""
    predictor = predictor or get_predictor()
    job = db.execute(
        select(AiAnalysisJob).where(AiAnalysisJob.status == "QUEUED").order_by(AiAnalysisJob.id).limit(1)
    ).scalars().first()
    if not job:
        return None
    process_job(db, job, predictor)
    return job


def run_forever() -> None:
    predictor = get_predictor()
    status = predictor.status()
    print(f"[ai_worker] predictor={predictor.kind} status={status} "
          f"model={settings.ai_model_name}@{settings.ai_model_version}")
    if status == MODEL_NOT_AVAILABLE:
        print("[ai_worker] 実モデル未配置(MODEL_NOT_AVAILABLE)。ジョブはFAILEDになります。"
              " AI_MODEL_PATH に学習済みweightsを配置してください。")
    if status == FAKE:
        print("[ai_worker] 警告: FAKE predictor 稼働中。実AI結果として扱わないこと（テスト用）。")
    while True:
        db = SessionLocal()
        try:
            job = process_one(db, predictor)
            if job:
                print(f"[ai_worker] job#{job.id} photo#{job.photo_id} -> {job.status}")
            else:
                time.sleep(settings.ai_worker_poll_seconds)
        finally:
            db.close()


def main() -> None:
    once = "--once" in sys.argv
    if once:
        db = SessionLocal()
        try:
            n = 0
            while process_one(db) is not None:
                n += 1
            print(f"[ai_worker] processed {n} job(s)")
        finally:
            db.close()
    else:
        run_forever()


if __name__ == "__main__":
    main()
