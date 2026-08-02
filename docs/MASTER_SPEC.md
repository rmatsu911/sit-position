# MASTER_SPEC（仕様の正）

> このファイルが**仕様の正**。現在の実装状態は `docs/PROGRESS.md` を参照。
> 詳細設計は各docsに分割：architecture / database / api / permissions / ai-design / deployment。

## 目的

株式会社SYSKENの通信工事における施工管理システム。案件・現場・設備・工程・施工写真・
図面・品質・日報・要員・資材・試験記録・完成図書を**工事単位で一元管理**し、蓄積データを
将来 YOLO / ViT / OCR / RAG / LLM / 工期予測へ接続する。**施工管理本体はAIに依存しない**
（AI停止時も業務継続可）。

## 不変の原則

- 中核3階層 **Project → Site → Asset**。全業務情報を `project_id/site_id/asset_id/task_id` へ関連付け
- マスタは **ID/表示名を分離**（AIも同じマスタIDを返す）
- **原本写真は不変**、サムネ/解析画像は派生
- **AI結果と人間確定結果を分離**（AIの誤りも保存し再学習に利用）
- AI信頼度閾値は**DB管理**（`ai_threshold_settings`）、コード固定しない
- 品質基準は**DBの`quality_rules`**を正とする
- 工程変更は**上書きせず履歴**（`task_change_history`）。AM/PMはUI表現、DBはdatetime
- 重要データは**論理削除**（deleted_at/by/reason）、**監査ログ**（audit_logs）必須
- 認可は**API側で強制**（画面非表示だけにしない）。協力会社は割当案件のみ

## アーキテクチャ

Frontend: React/TS/Vite/Tailwind/React Router/TanStack Query ／
Backend: Python/FastAPI/SQLAlchemy2/Alembic ／ DB: PostgreSQL ／
Storage: S3互換(MinIO)・開発はローカルFS ／ AIはジョブ方式で分離（AI Worker）。

## ロール

ADMIN / PROJECT_MANAGER / FIELD_WORKER / QUALITY_MANAGER / VIEWER
（詳細は `docs/permissions.md`）

## データモデル（全体像）

- 実装済み: `docs/database.md`「Ver.0.1 実装済みテーブル」
- 未実装（設計）: `docs/database.md`「Ver.0.2 以降で追加予定」
  = 要員 / 資材 / 試験記録 / 図面・書類(版管理) / 通知 / weather_records

## AI設計

`docs/ai-design.md`（対象タスク・ジョブフロー・信頼度・RAG権限適用）。
Ver.0.1は構造のみ、実推論は未実装。

## UI/デザイン方針

- 白基調・SYSKEN青(#005BAC前後)・薄グレー。正常=緑 / 注意=黄橙 / 異常=赤
- Windows PC・1920×1080固定、ダークモード不使用、過度な装飾を避ける
- 既存の全画面・メニュー・ガント・写真/品質/日報/要員/帳票/AI UI・ルーティングを維持
- AI表示は「AI認識結果/物体検出結果/判定結果」。未実装注記は設定＞システム情報に一度だけ

## 移行方針

固定ダミー → Seed(PostgreSQL) → API の順で、UIを壊さず1画面ずつ移行。
移行パターンは `src/api/projects.ts`（`useProjects` 等）に準拠。
