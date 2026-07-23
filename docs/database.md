# データベース設計

PostgreSQL 16 / SQLAlchemy 2.0 / Alembic。全業務テーブルは論理削除（`deleted_at` / `deleted_by` / `delete_reason`）と `created_at` / `updated_at` を持つ。

## 中核3階層

- **projects**（案件）← すべての業務情報の起点
- **sites**（現場）`project_id`
- **assets**（設備）`project_id` / `site_id` / `asset_type_id`

## Ver.0.1 実装済みテーブル

| 分類 | テーブル |
| --- | --- |
| 組織・認証 | `users` `branches` `departments` `companies` `project_members` |
| マスタ（ID/名分離） | `work_types` `process_types` `asset_types` `photo_types` `quality_rule_types` `construction_types` |
| 中核 | `projects` `sites` `assets` |
| 工程 | `tasks` `task_dependencies` `task_change_history` |
| 施工写真 | `photos`（原本不変・`sha256`・派生サムネ／Ver.0.1.1 で `photo_no` `place` `tags`(JSON) `favorite` 追加） |
| AI（構造のみ） | `ai_models` `ai_analysis_jobs` `ai_predictions` `ai_feedback` `ai_threshold_settings` |
| 品質 | `quality_rules` `quality_checks`（Ver.0.1.1 で `inspect_item` `process` `judge` `due_date` `worker_id` 追加） |
| 日報 | `daily_reports`（Ver.0.1.1 で `place` `crew` `plan_workers` `actual_workers` `process` `materials` `tools` `vehicles` `hazard` `safety_check` `quality_check` `note` `checker_id` `approver_id` 追加） `daily_report_tasks` `daily_report_photos`(Ver.0.1.1新設) |
| 監査 | `audit_logs` |

Ver.0.1.1 migration: `93d342db7f58_ver0_1_1_photos_quality_daily_fields`（既存データ有りのため NOT NULL 列は server_default を付与して追加）。

## 重要な設計判断

- **原本写真は不変**：`photos.original_file_path` は保存後に変更しない。サムネイル（`thumbnail_path`）は原本から派生。
- **AIと人間確定の分離**：AI結果は `ai_predictions`、人間確定は `photos.confirmed_*` / `quality_checks.human_result`。AIの誤りも `ai_feedback` に保存し再学習データとして利用。
- **信頼度閾値はDB管理**：`ai_threshold_settings`（自動採用 / 確認推奨）。コードに固定しない。
- **品質基準はDB**：`quality_rules` を基準とし、AIモデル内部に閉じ込めない。
- **工程変更は履歴保存**：`task_change_history`（変更前/後/変更者/理由）。AM/PMはUI表現、DBは `datetime`。
- **監査**：`audit_logs` に誰が・いつ・何を・どの案件で・変更前/後を保存。

## Ver.0.2 以降で追加予定（設計はここに定義）

- 要員：`workers` `teams` `qualifications` `worker_qualifications` `worker_assignments`（資格に取得日・有効期限・証明書）
- 資材：`materials` `project_materials`
- 試験記録：`test_records`
- 図面・書類：`documents` `document_versions`（版を上書き消去しない）
- 通知：`notifications`
- 工期予測：`weather_records` ほか

## マイグレーション

```bash
cd backend
alembic revision --autogenerate -m "message"   # モデル変更からマイグレーション生成
alembic upgrade head                            # 適用
alembic downgrade -1                            # 1つ戻す
```
