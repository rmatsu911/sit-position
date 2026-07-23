#!/usr/bin/env python
"""YOLO 評価の入口（PoC）。

学習済みweightsを検証データで評価し、Precision / Recall / mAP50 / mAP50-95 を記録する。
実行には Ultralytics が必要:  pip install -e ".[ai]"

例:
  python scripts/evaluate_yolo.py --model runs/detect/sysken/weights/best.pt \
      --data datasets/data.yaml --device cpu

将来の業務KPI（AI結果採用率 / AI修正率 / 1写真あたり確認時間）は
ai_feedback から別途集計する（本スクリプトはモデル精度のみ）。
"""
from __future__ import annotations

import argparse
import json
import sys


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Evaluate SYSKEN YOLO detector")
    p.add_argument("--model", required=True, help="評価するweights(.pt)")
    p.add_argument("--data", default="datasets/data.yaml")
    p.add_argument("--device", default="cpu")
    p.add_argument("--out", default="runs/eval/metrics.json")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Ultralytics 未導入です。`pip install -e \".[ai]\"` を実行してください。", file=sys.stderr)
        return 2
    import os

    model = YOLO(args.model)
    m = model.val(data=args.data, device=args.device)
    metrics = {
        "precision": float(m.box.mp),
        "recall": float(m.box.mr),
        "mAP50": float(m.box.map50),
        "mAP50_95": float(m.box.map),
    }
    os.makedirs(os.path.dirname(args.out), exist_ok=True)
    with open(args.out, "w", encoding="utf-8") as f:
        json.dump(metrics, f, ensure_ascii=False, indent=2)
    print(json.dumps(metrics, ensure_ascii=False, indent=2))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
