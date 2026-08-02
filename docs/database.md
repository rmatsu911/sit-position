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
| 要員（Ver.0.1.2） | `workers` `teams` `qualifications` `worker_qualifications` `worker_assignments` |
| 工程⇔設備（Ver.0.1.2） | `task_assets`（1工程=複数設備の中間テーブル） |
| 台帳（Ver.0.1.2） | `project_ledgers`（projectsを基本データとし、契約番号/原価/請求・書類状況のみ保持） |
| 図面・書類（Ver.0.1.2） | `documents` `document_versions`（版は上書きせず追加） |
| 通知（Ver.0.1.2） | `notifications`（user_id=None は全体通知、target_url でクリック遷移） |

| 横断表示（Ver.0.3 Phase 2） | `tasks.company_id`（担当会社を工程に保持）、`saved_searches`（`screen` で画面ごとの保存検索条件を使い分け） |
| マイルストーン（Ver.0.3 Phase 3） | `milestone_types`（標準区分マスタ・`sort_order`/`active`）、`milestones`（案件の重要日の正データ） |

`milestones` は工程名の文字列一致に頼らず、案件の重要日を独立した正データとして持つ。
`project_id` / `milestone_type_id` / `name` / `planned_at` / `actual_at` / `status` /
`responsible_id` / `company_id` / `related_task_id` / `schedule_precision` / `notes` を持ち、
論理削除（`deleted_at`）に対応する。

- **担当者と担当会社は独立**：`company_id` を `responsible_id` の所属から導出しない。
- **関連工程は任意**：`related_task_id` は nullable ＋ index。未設定なら工程との関係を推測しない。
- **入力粒度は1列**：`schedule_precision`（`day` / `half_day`）と `DateTime` の組で表す。AM/PM 専用列は作らない。
- **同一案件・同一区分の複数件を許容**：DB制約で1件に縛らない（是正前後の検査など複数回あり得るため）。

Ver.0.1.1 migration: `93d342db7f58_ver0_1_1_photos_quality_daily_fields`（既存データ有りのため NOT NULL 列は server_default を付与して追加）。
Ver.0.1.2 migration: `062aef7de195_ver0_1_2_task_assets_workers_docs_...`（新テーブル10・既存データ非破壊）→ 計40テーブル。
Ver.0.1.3 migration: `6b1c1111572b_ver0_1_3_materials_test_records_report_...`（`materials`/`project_materials`/`test_records`/`report_exports`・既存非破壊）→ 計44テーブル。帳票生成に `openpyxl`/`reportlab`（日本語CIDフォント）を使用。
Ver.0.3 migration: `a1c7d3f90b21`（`tasks.schedule_precision`）→ `b3e5a71c2d40`（`tasks.company_id` / `saved_searches`）→ `c4f2a86b1e73`（`milestone_types` / `milestones`）→ `d5a91c3e07b2`（`milestones` に `company_id` / `related_task_id` / `schedule_precision`）→ 計47テーブル。既存 migration は書き換えず、補足 migration を追加する方針。

## 重要な設計判断

- **原本写真は不変**：`photos.original_file_path` は保存後に変更しない。サムネイル（`thumbnail_path`）は原本から派生。
- **AIと人間確定の分離**：AI結果は `ai_predictions`、人間確定は `photos.confirmed_*` / `quality_checks.human_result`。AIの誤りも `ai_feedback` に保存し再学習データとして利用。
- **信頼度閾値はDB管理**：`ai_threshold_settings`（自動採用 / 確認推奨）。コードに固定しない。
- **品質基準はDB**：`quality_rules` を基準とし、AIモデル内部に閉じ込めない。
- **工程変更は履歴保存**：`task_change_history`（変更前/後/変更者/理由）。AM/PMはUI表現、DBは `datetime`。
- **監査**：`audit_logs` に誰が・いつ・何を・どの案件で・変更前/後を保存。

## Ver.0.2 以降で追加予定（設計はここに定義）

- 工期予測：`weather_records` ほか
- （実装済み Ver.0.1.2：要員 `workers`/`teams`/`qualifications`/`worker_qualifications`/`worker_assignments`、`task_assets`、`project_ledgers`、`documents`/`document_versions`、`notifications`）
- （実装済み Ver.0.1.3：`materials`/`project_materials`、`test_records`、`report_exports`）

## マイグレーション

```bash
cd backend
alembic revision --autogenerate -m "message"   # モデル変更からマイグレーション生成
alembic upgrade head                            # 適用
alembic downgrade -1                            # 1つ戻す
```
