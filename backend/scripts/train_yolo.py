#!/usr/bin/env python
"""YOLO 学習の入口（PoC）。

本番学習は将来 SYSKEN の実施工写真をアノテーションしてから実施する。
実行には Ultralytics が必要:  pip install -e ".[ai]"

例:
  python scripts/train_yolo.py --data datasets/data.yaml --model yolov8n.pt \
      --epochs 100 --imgsz 640 --batch 16 --device 0 --name sysken_v001

出力（weights/metrics）は runs/detect/<name>/ に version 管理されて保存される。
学習後は AI_MODEL_PATH を runs/detect/<name>/weights/best.pt に向け、
AI_MODEL_VERSION を更新して Worker を再起動する。
"""
from __future__ import annotations

import argparse
import sys


def parse_args(argv: list[str] | None = None) -> argparse.Namespace:
    p = argparse.ArgumentParser(description="Train SYSKEN YOLO detector")
    p.add_argument("--data", default="datasets/data.yaml")
    p.add_argument("--model", default="yolov8n.pt", help="ベースweights（事前学習）")
    p.add_argument("--epochs", type=int, default=100)
    p.add_argument("--imgsz", type=int, default=640)
    p.add_argument("--batch", type=int, default=16)
    p.add_argument("--device", default="cpu", help="cpu / 0 / 0,1 ...")
    p.add_argument("--project", default="runs/detect")
    p.add_argument("--name", default="sysken")
    return p.parse_args(argv)


def main(argv: list[str] | None = None) -> int:
    args = parse_args(argv)
    try:
        from ultralytics import YOLO
    except ImportError:
        print("Ultralytics 未導入です。`pip install -e \".[ai]\"` を実行してください。", file=sys.stderr)
        return 2
    model = YOLO(args.model)
    model.train(data=args.data, epochs=args.epochs, imgsz=args.imgsz, batch=args.batch,
                device=args.device, project=args.project, name=args.name)
    print(f"完了: 学習結果は {args.project}/{args.name}/ に保存されました。")
    print("AI_MODEL_PATH を weights/best.pt に、AI_MODEL_VERSION を更新してください。")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
