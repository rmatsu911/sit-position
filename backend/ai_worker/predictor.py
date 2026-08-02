"""推論インターフェース（実YOLO と Fake を明確に分離）。

- YoloPredictor … Ultralytics YOLO を用いた実推論。weights は設定(AI_MODEL_PATH)から読む。
                   weights未配置 / ultralytics未導入 のときは MODEL_NOT_AVAILABLE を返し、
                   施工管理Backend全体は停止させない。
- FakePredictor … テスト専用の決め打ち出力。**実AI結果として保存・表示してはならない。**

Detection の座標は「正規化(0-1)・左上原点の xywh」で統一する（元画像サイズに依存しない）。
"""
from __future__ import annotations

from abc import ABC, abstractmethod
from dataclasses import dataclass

from app.core.config import settings
from ai_worker.classes import load_class_map

# Predictor 稼働状態
AVAILABLE = "AVAILABLE"
MODEL_NOT_AVAILABLE = "MODEL_NOT_AVAILABLE"
FAKE = "FAKE"


@dataclass
class Detection:
    class_id: int
    code: str          # 英語コード（クラス）
    label: str         # 日本語表示名
    confidence: float
    # 正規化(0-1) 左上原点 xywh
    x: float
    y: float
    w: float
    h: float

    def bbox_dict(self) -> dict:
        return {"format": "xywhn", "x": round(self.x, 5), "y": round(self.y, 5),
                "w": round(self.w, 5), "h": round(self.h, 5)}


class Predictor(ABC):
    kind: str = "base"

    @abstractmethod
    def status(self) -> str: ...

    @abstractmethod
    def predict(self, image_bytes: bytes) -> list[Detection]: ...


class YoloPredictor(Predictor):
    """Ultralytics YOLO 実推論。モデルは交換可能（weightsはコードに埋め込まない）。"""
    kind = "yolo"

    def __init__(self):
        self._model = None
        self._status = MODEL_NOT_AVAILABLE
        self._load()

    def _load(self) -> None:
        path = settings.ai_model_path
        if not path:
            self._status = MODEL_NOT_AVAILABLE
            return
        import os
        if not os.path.exists(path):
            self._status = MODEL_NOT_AVAILABLE
            return
        try:
            from ultralytics import YOLO  # 遅延import（未導入でも本体は動く）
        except ImportError:
            self._status = MODEL_NOT_AVAILABLE
            return
        try:
            self._model = YOLO(path)
            self._status = AVAILABLE
        except Exception:  # noqa: BLE001
            self._model = None
            self._status = MODEL_NOT_AVAILABLE

    def status(self) -> str:
        return self._status

    def predict(self, image_bytes: bytes) -> list[Detection]:
        if self._status != AVAILABLE or self._model is None:
            raise ModelNotAvailable("YOLO weights not configured or not loadable")
        import io

        from PIL import Image

        cmap = load_class_map()
        img = Image.open(io.BytesIO(image_bytes)).convert("RGB")
        W, H = img.size
        results = self._model.predict(img, conf=settings.ai_confidence_threshold, verbose=False)
        dets: list[Detection] = []
        for res in results:
            for box in res.boxes:
                cls_id = int(box.cls[0])
                conf = float(box.conf[0])
                x1, y1, x2, y2 = (float(v) for v in box.xyxy[0])
                dets.append(Detection(
                    class_id=cls_id, code=cmap.code(cls_id), label=cmap.label(cls_id), confidence=conf,
                    x=x1 / W, y=y1 / H, w=(x2 - x1) / W, h=(y2 - y1) / H,
                ))
        return dets


class FakePredictor(Predictor):
    """テスト専用。決め打ちの検出を返す。実AIとして扱わないこと。"""
    kind = "fake"

    def status(self) -> str:
        return FAKE

    def predict(self, image_bytes: bytes) -> list[Detection]:
        cmap = load_class_map()
        boxes = [
            (1, 0.90, 0.12, 0.32, 0.36, 0.35),
            (2, 0.82, 0.55, 0.27, 0.28, 0.32),
            (0, 0.61, 0.38, 0.69, 0.28, 0.24),
        ]
        return [
            Detection(class_id=cid, code=cmap.code(cid), label=cmap.label(cid), confidence=conf,
                      x=x, y=y, w=w, h=h)
            for cid, conf, x, y, w, h in boxes
        ]


class ModelNotAvailable(RuntimeError):
    pass


def get_predictor(kind: str | None = None) -> Predictor:
    k = (kind or settings.ai_predictor).lower()
    if k == "fake":
        return FakePredictor()
    return YoloPredictor()
