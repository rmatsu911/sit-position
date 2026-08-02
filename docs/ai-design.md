# AI 設計

## 原則

- **施工管理システムの中にAIを組み込む**（AI単体アプリを作らない）。
- AIは **分離可能・停止可能**。停止しても施工管理業務は継続できる。
- **人間確定結果とAI結果を分離**。AIの誤りも保存し、再学習データとして活用する。

## 対象タスク（将来）

| 種別 | モデル例 | 入力 | 出力 |
| --- | --- | --- | --- |
| 物体検出 | YOLO | 施工写真 | 設備の枠＋クラス＋信頼度 |
| 工種・工程分類 | ViT | 施工写真 | 工種/工程の分類＋信頼度 |
| 文字認識 | OCR | 図面/銘板/帳票 | テキスト |
| 類似工事検索・施工判断 | RAG + LLM | 過去工事/施工基準/トラブル記録 | 参照付き回答 |
| 工期予測 | 時系列/回帰 | 予定・実績工程/進捗/人数/天候/延期履歴/資材入荷 | 完了予定・遅延リスク |

## ジョブフロー（分離アーキテクチャ）

```
写真アップロード
   └▶ POST /ai/photos/{id}/analyze   → ai_analysis_jobs (QUEUED)
                                          │
        AI Worker（別プロセス・将来）  ────┤ PROCESSING → COMPLETED / FAILED
                                          ▼
                                     ai_predictions（クラスID/ラベル/信頼度/bbox/raw）
                                          │
                    人間が確認 → ai_feedback（accepted / corrected_value）
                                          │
                    確定 → photos.confirmed_* / quality_checks.human_result
```

`ai_analysis_jobs.status`: `QUEUED / PROCESSING / COMPLETED / FAILED / CANCELLED`

## 信頼度の扱い

`ai_threshold_settings`（job_type別）で管理者が閾値を設定：
- `auto_accept_threshold` … 自動採用
- `review_threshold` … 確認推奨
- 閾値未満 … 要確認

コードに閾値を固定しない。

## 品質チェックとの関係

品質基準は `quality_rules`（DB）を正とする。AIは「候補・信頼度」を提示し、`quality_checks` の最終判定は人間（QUALITY_MANAGER）が確定する。

## RAG / LLM

- 過去工事・施工基準・トラブル/保守記録・マニュアルを検索対象にする。
- 回答には **参照資料・過去案件・施工基準** を提示する。
- RAG検索は **ユーザーの閲覧権限（案件スコープ）を必ず適用**する。

## Ver.0.1 の実装範囲

- 上記テーブルとジョブ登録API（`/ai/*`）まで。**実推論は未実装**（Workerは未稼働、`analyze` はジョブをQUEUEDにするのみ）。
- フロントの「AI施工写真分類 / AI品質チェック」表示は、実運用ではこのジョブ結果（`ai_predictions`）に接続する。

## Ver.0.2 の実装範囲（YOLO 施工写真認識 PoC 基盤）

**目的**：将来 SYSKEN の実施工写真をアノテーション・学習して作る本物のYOLOモデルを接続するための基盤。今回はダミーAIを増やすのではなく、経路を実接続する。

- **AI Worker**（`backend/ai_worker/`・施工管理Backendと分離した別プロセス）
  - `python -m ai_worker.worker`（常駐poll）/ `--once`（QUEUEDを処理して終了）。
  - `ai_analysis_jobs` の QUEUED → PROCESSING → COMPLETED（`ai_predictions`保存）／失敗時 FAILED（`error_message`/`retry_count`保存）。
  - **Worker停止中でも施工管理Backendは正常**（本体はWorkerに依存しない）。
- **Predictor 分離**（`ai_worker/predictor.py`）
  - `YoloPredictor`：Ultralytics YOLO 実推論。weights は `AI_MODEL_PATH` から読む（コードに埋め込まない・交換可能）。未導入/未配置は `MODEL_NOT_AVAILABLE` を返し本体を止めない。
  - `FakePredictor`：**テスト専用**。実AI結果として保存・表示しない（Worker既定は `yolo`）。
- **クラス体系**は `backend/datasets/data.yaml`（YOLO metadata）を正とし、コードにハードコードしない。PoCクラス：`utility_pole/optical_cable/closure/onu/optical_termination_box`（電柱/光ケーブル/クロージャ/ONU/光成端箱）。
- **Prediction**：`ai_predictions.bounding_box` は**正規化(0-1)左上原点 xywh**（`{"format":"xywhn",...}`）で保存。API `/photos/{id}/ai` が表示座標(100x75)へ変換して返す（画像サイズが変わっても正しく描画）。`model_id` で Model/Dataset Version を追跡（別Versionで再解析しても過去結果を残す）。
- **人間フィードバック**：`POST /photos/{id}/predictions/{pid}/feedback`（correct/reclassify/false_positive）・`POST /photos/{id}/missed-feedback`（未検出）。**AI予測は上書きせず** `ai_feedback` に AI結果+人間結果の両方を保存（再学習・KPI用）。
- **モデル状態の明示**：実weights未配置時は `MODEL_NOT_AVAILABLE`、Seedのデモ予測は `status=DEMO`（未学習）としてUIに明示。「本物のSYSKEN認識が完成した」ようには見せない。
- **学習基盤**：`datasets/dataset_vNNN/{images,labels}/{train,val,test}` + `data.yaml`、`scripts/train_yolo.py`・`scripts/evaluate_yolo.py`（dataset/model/epochs/imgsz/batch/device 指定可、出力は `runs/` にVersion管理）。weights・実写真は Git管理外。
- **評価/KPI**：評価は Precision/Recall/mAP50/mAP50-95（evaluate_yolo.py）。業務KPI（AI結果採用率/修正率/確認時間）は `ai_feedback` から集計できる関連を保持。

実行例（学習環境で）:
```
pip install -e ".[ai]"                 # ultralytics 導入
python scripts/train_yolo.py --data datasets/data.yaml --model yolov8n.pt --epochs 100
# → AI_MODEL_PATH=runs/detect/.../weights/best.pt, AI_MODEL_VERSION=... を設定し Worker 起動
python -m ai_worker.worker
```
