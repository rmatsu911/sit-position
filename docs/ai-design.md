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
