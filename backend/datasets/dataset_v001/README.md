# dataset_v001

SYSKEN 施工写真の物体検出データセット（YOLO形式）。

```
dataset_v001/
  images/{train,val,test}/   … .jpg / .png（実写真。Gitへはコミットしない）
  labels/{train,val,test}/   … YOLOラベル（<class> <xc> <yc> <w> <h> 正規化0-1、1行1物体）
```

クラス体系は `../data.yaml` の `names` / `display` を正とする。

- 実写真・ラベル・学習済み weights は容量とライセンスの都合で **Git管理外**（`.gitignore` 参照）。
- アノテーションは将来 SYSKEN の実施工写真に対して実施する。
- 学習は `scripts/train_yolo.py`、評価は `scripts/evaluate_yolo.py` を入口とする。
