"""AI接続準備（構造のみ）。

この段階では本物の YOLO / ViT / OCR / LLM 推論は実装しない。
写真に対する解析ジョブの登録と、ジョブ・予測結果の参照のみを提供する。
実際の推論は将来、AI Worker が ai_analysis_jobs を処理して
ai_predictions を書き込む設計（施工管理APIとは分離可能）。
"""
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app.core.db import get_db
from app.core.deps import ensure_project_access, get_current_user
from app.models import AiAnalysisJob, AiModel, AiPrediction, Photo, User
from app.schemas import (
    AiFeatureStatusOut,
    AiJobOut,
    AiModelOut,
    AiModelStatusOut,
    AiStatusOut,
)

router = APIRouter()


@router.get("/models", response_model=list[AiModelOut])
def list_models(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> list:
    """登録済みAIモデル（name+version+dataset_version+trained_at+status）。
    同じ写真を別Versionで再解析しても過去結果を追跡できるよう、Prediction は model_id を持つ。"""
    return list(db.execute(select(AiModel).order_by(AiModel.id.desc())).scalars().all())


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


# ===========================================================================
# AI機能ごとの状態
#
# 「構想」と「実際に動くもの」を混ぜない。各機能について、
# 実装があるか（コード）／モデルが配置されているか（ai_models）／
# ジョブが動いているか（ai_analysis_jobs）を**実データから**判定する。
# 画面は固定の状態文言を持たず、ここが返した状態だけを表示する。
# ===========================================================================

# 機能キー → (表示名, 推論ジョブの job_type, 実装があるか)
#
# `job_type` が None の機能は、まだ推論を登録する経路そのものが無い（＝未実装）。
# 実装したらここへ job_type を足す。表示だけを先に「実装済み」にはしない。
AI_FEATURES: list[dict] = [
    {
        "key": "photo_classification",
        "title": "AI施工写真分類",
        "job_type": "detection",
        "implemented": True,
        "note": "施工写真の物体検出。ジョブ登録・結果保存・人手による訂正まで実装済み。",
    },
    {
        "key": "quality_check",
        "title": "AI品質チェック",
        "job_type": None,
        "implemented": False,
        "note": "検査基準との照合は未実装。品質確認は人手の判定結果だけを保存している。",
    },
    {
        "key": "completion_compare",
        "title": "AI完成状態比較",
        "job_type": None,
        "implemented": False,
        "note": "完成基準写真との差異検出は未実装。",
    },
    {
        "key": "duration_forecast",
        "title": "AI工期予測",
        "job_type": None,
        "implemented": False,
        "note": "未実装。工程表のクリティカルパス・遅延はAI予測ではなく確定計算で出している。",
    },
    {
        "key": "staffing_forecast",
        "title": "AI要員予測",
        "job_type": None,
        "implemented": False,
        "note": "未実装。要員の重複・資格期限は確定計算で検知している。",
    },
    {
        "key": "construction_advice",
        "title": "AI施工判断",
        "job_type": None,
        "implemented": False,
        "note": "未実装。過去事例の検索・照合は接続していない。",
    },
    {
        "key": "report_generation",
        "title": "AI施工管理表作成",
        "job_type": None,
        "implemented": False,
        "note": "未実装。施工管理表は工程データからの確定生成（PDF/Excel/CSV）で出力している。",
    },
]

# 状態の意味
#   not_implemented : 機能そのものが未実装（推論を登録する経路が無い）
#   model_missing   : 実装はあるが、学習済みモデルが配置されていない
#   service_down    : モデルはあるがジョブが処理されていない（Workerが動いていない）
#   processing      : 処理中のジョブがある
#   failed          : 直近のジョブが失敗している
#   connected       : 実装・モデル・成功したジョブがそろっている
AI_STATUS_ORDER = [
    "not_implemented", "model_missing", "service_down", "failed", "processing", "connected",
]

# ジョブが滞留していると判断するまでの時間
STALE_JOB_MINUTES = 15


def _trained_models(db: Session) -> list[AiModel]:
    """学習済みで有効なモデル。未学習のモデルは「配置済み」と数えない。"""
    models = db.execute(select(AiModel)).scalars().all()
    return [m for m in models if m.trained_at and (m.status or "").upper() in ("ACTIVE", "READY")]


def _feature_state(db: Session, feature: dict, has_model: bool) -> dict:
    if not feature["implemented"] or not feature["job_type"]:
        return {"status": "not_implemented", "detail": None}
    if not has_model:
        return {"status": "model_missing", "detail": "学習済みモデルが登録されていません"}

    job_type = feature["job_type"]
    counts = dict(db.execute(
        select(AiAnalysisJob.status, func.count(AiAnalysisJob.id))
        .where(AiAnalysisJob.job_type == job_type)
        .group_by(AiAnalysisJob.status)
    ).all())
    queued = counts.get("QUEUED", 0)
    running = counts.get("RUNNING", 0)

    last_done = db.execute(
        select(AiAnalysisJob.completed_at)
        .where(AiAnalysisJob.job_type == job_type, AiAnalysisJob.status == "DONE")
        .order_by(AiAnalysisJob.completed_at.desc()).limit(1)
    ).scalar_one_or_none()
    last_failed = db.execute(
        select(AiAnalysisJob)
        .where(AiAnalysisJob.job_type == job_type, AiAnalysisJob.status == "FAILED")
        .order_by(AiAnalysisJob.id.desc()).limit(1)
    ).scalar_one_or_none()
    oldest_pending = db.execute(
        select(AiAnalysisJob.queued_at)
        .where(AiAnalysisJob.job_type == job_type, AiAnalysisJob.status.in_(("QUEUED", "RUNNING")))
        .order_by(AiAnalysisJob.queued_at).limit(1)
    ).scalar_one_or_none()

    # 待ちが長く残っている＝Workerが処理していない。「処理中」とは言わない。
    stale = False
    if oldest_pending is not None:
        queued_at = oldest_pending
        if queued_at.tzinfo is None:
            queued_at = queued_at.replace(tzinfo=timezone.utc)
        stale = (datetime.now(timezone.utc) - queued_at) > timedelta(minutes=STALE_JOB_MINUTES)

    if stale:
        return {"status": "service_down", "detail": f"{queued + running}件のジョブが{STALE_JOB_MINUTES}分以上処理されていません"}
    if queued or running:
        return {"status": "processing", "detail": f"待機{queued}件・処理中{running}件"}
    if last_failed is not None and last_done is None:
        return {"status": "failed", "detail": last_failed.error_message or "直近のジョブが失敗しました"}
    if last_done is not None:
        return {"status": "connected", "detail": None}
    # モデルはあるがジョブが1件も無い。まだ動いた実績が無いことをそのまま示す。
    return {"status": "service_down", "detail": "推論ジョブの実行実績がありません"}


@router.get("/status", response_model=AiStatusOut)
def ai_status(db: Session = Depends(get_db), user: User = Depends(get_current_user)) -> AiStatusOut:
    """AI機能ごとの状態。すべて実データ（ai_models / ai_analysis_jobs）から判定する。"""
    trained = _trained_models(db)
    has_model = bool(trained)
    models = db.execute(select(AiModel).order_by(AiModel.id.desc())).scalars().all()

    features = []
    for f in AI_FEATURES:
        state = _feature_state(db, f, has_model)
        features.append(AiFeatureStatusOut(
            key=f["key"], title=f["title"], status=state["status"],
            detail=state["detail"], note=f["note"], job_type=f["job_type"],
        ))

    # Worker の稼働状況。モデルの有無とは分けて示す。
    pending = db.execute(
        select(func.count(AiAnalysisJob.id)).where(AiAnalysisJob.status.in_(("QUEUED", "RUNNING")))
    ).scalar_one()
    last_success = db.execute(
        select(AiAnalysisJob.completed_at).where(AiAnalysisJob.status == "DONE")
        .order_by(AiAnalysisJob.completed_at.desc()).limit(1)
    ).scalar_one_or_none()

    return AiStatusOut(
        features=features,
        models=[
            AiModelStatusOut(
                id=m.id, name=m.name, model_type=m.model_type, version=m.version,
                status=m.status, trained_at=m.trained_at,
                # 学習済みかどうかを「登録されているか」と混同しない
                trained=bool(m.trained_at),
            )
            for m in models
        ],
        trained_model_count=len(trained),
        pending_jobs=pending,
        last_successful_job_at=last_success,
    )
