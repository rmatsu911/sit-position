# PROGRESS（現在状態の正）

> このファイルが**現在状態の正**。仕様の正は `docs/MASTER_SPEC.md`。
> 次回セッションは過去チャットではなく **docs を参照**して続きから作業する。

## 開発ルール（トークン消費を最小化）

- 毎回リポジトリ全体を再調査しない
- `docs/MASTER_SPEC.md` を仕様の正とする
- `docs/PROGRESS.md` を現在状態の正とする
- 作業対象に必要なファイルだけ確認する
- 関係ない機能へ変更を広げない
- 既存UIを再解析し直さない
- 大規模リファクタリングを避ける
- 既に完了した内容を再説明しない
- 作業後は PROGRESS.md へ**差分だけ**追記する
- 次回作業を 1〜3 項目で記録する
- 完了報告は「実装内容 / テスト / 残課題 / 次の作業」のみ・各項目簡潔に

## 現在のバージョン

Ver.0.1.1（現場業務実データ化）完了。ブランチ `claude/session-rkd93u`。
施工写真・品質管理・現場日報を固定JS→PostgreSQL Seed→FastAPI→React へ移行（UI維持）。

## 完了済み（要点のみ）

- フロント（React/TS/Vite/Tailwind/Router/Recharts/date-fns）：全15画面＋ログイン。デザイン=SYSKEN青/白/グレー、1920×1080固定
- 認証：JWT/bcrypt、5ロール、案件スコープ（API側認可）、監査ログ
- Backend（`/backend` FastAPI+SQLAlchemy2+Alembic+PostgreSQL）：案件/現場/設備/マスタ6/工程(履歴)/写真メタ/品質/日報/AI骨格
- AI：DB・APIの骨格のみ（推論未実装、`analyze`はジョブQUEUED登録のみ）
- ファイルアップロード（ローカル/S3抽象・Pillowサムネ）、Seed（ユーザー11/案件8/工程25/写真27）
- フロントAPI接続：ログイン・案件一覧・案件詳細・工程管理(読)。他画面はダミー維持
- インフラ/docs：docker-compose、Dockerfile、docs一式、README、.env.example
- テスト：pytest 10件通過、フロント build 成功、ブラウザE2E確認済み

## Ver.0.1.1 で追加（施工写真・品質・日報の実データ化）

- **モデル拡張**（`backend/app/models.py`）：Photo に `photo_no/place/tags(JSON)/favorite`、QualityCheck に `inspect_item/process/judge/due_date/worker_id`、DailyReport に `place/crew/plan_workers/actual_workers/process/materials/tools/vehicles/hazard/safety_check/quality_check/note/checker_id/approver_id`、新テーブル `daily_report_photos`
- **migration**：`93d342db7f58_ver0_1_1_photos_quality_daily_fields.py`（既存データ有りのため NOT NULL 列は server_default 付与）→ 30テーブル
- **写真API**（`/photos`）：一覧（project_id必須＋site/asset/task/photo_type/confirm/favorite/tag フィルタ）・詳細・アップロード(multipart, Pillowサムネ, sha256, photo_no自動採番)・編集(tags/comment/favorite/photo_type/confirmed_*)・確認状態変更・論理削除・**`GET /photos/{id}/ai`（ai_predictions→検出枠+認識/工種/工程/設備判定。将来YOLOが書けば同UIに反映）**
- **品質API**（`/quality-checks`）：一覧（task/asset/photo/status フィルタ）・詳細・状態変更/判定/コメント（`PATCH`、QUALITY_MANAGER/PROJECT_MANAGER のみ）
- **日報API**（`/daily-reports`）：一覧・詳細・作成(DRAFT)・編集・前日コピー・写真/工程紐付け(`PUT /links`)・ステータス遷移(`PATCH /status` DRAFT/SUBMITTED/REVIEWING/RETURNED/APPROVED)・**`POST /reflect-progress`（工程実績へ明示反映、task_change_history/audit_logs記録）**
- **監査ログ**：写真登録/編集/削除・品質状態変更/承認/差戻し・日報作成/提出/差戻し/承認・工程実績反映を who/when/what/before/after で記録
- **Seed**（`backend/app/seed/seed.py`）：写真27（equipment/place/gps/tags/favorite/confirmed_*、各写真に AiAnalysisJob(COMPLETED)＋検出3件＋分類1件の ai_predictions）、品質7、日報3
- **フロントAPI接続**（UI維持）：`src/api/photos.ts` `quality.ts` `dailyReports.ts`（adapter+TanStack Query hooks）、`Photos.tsx` `Quality.tsx` `DailyReport.tsx` を接続。AI表示はAPI(ai_predictions)優先・無ければローカル導出でフォールバック。ローディング/保存中/アップロード中/エラー/空データ状態を追加
- **テスト**：`backend/tests/test_features.py`（写真CRUD＋AI/品質/日報/権限403/監査ログ、8件）追加 → pytest 18件通過。フロント `npm run build` 成功。ブラウザE2E（写真/品質/日報描画＋日報 提出→承認→DB反映＋監査ログ）確認済み

## Ver.0.1.1 残課題対応で追加（2026-07-23）

- **施工写真アップロード Project→Site→Asset→Task 連動UI**：アップロードモーダルに案件/現場/設備/工程の連動プルダウン。案件変更→下位リセット、現場選択で設備・工程が有効化。`GET /assets?project_id=&site_id=`・`GET /projects/{id}/tasks?site_id=` に site_id フィルタ追加（Task に asset_id FK が無いため Asset/Task は Site で連動）。`useUploadPhoto` を project_id 可変に。Seed に Asset 4件追加＋写真へ asset_id 付与
- **日報の写真/工程紐付けUI**：「実施工程の紐付け」（工程チェックリスト）＋「写真の紐付け」（サムネ選択）を既存フォームに追加。一時保存時に本文(PUT)＋`PUT /links` を保存。`DailyReport` 型に `taskIds/photoIds` 追加、adapter で `task_ids/photo_ids` を反映
- **工程実績へ反映（明示操作・確認画面付き）**：`POST /reflect-progress?dry_run=true` で対象工程・現在進捗・反映後進捗・変更内容(実績人数/実績開始)をプレビュー表示 → 「この内容で反映」確定時のみ本反映。確定時のみ `task_change_history`／`audit_logs(REFLECT)` へ記録（自動反映なし）
- **テスト**：assets/tasks の site_id フィルタ、reflect dry-run→確定（履歴・監査記録）、FIELD_WORKER の reflect 403 を追加 → pytest 22件通過。`npm run build` 成功。ブラウザE2E：写真アップロード(Project→Site→Asset→Task)→reload保持(28→29)、日報 工程/写真紐付け→保存→reload保持→提出→承認→工程実績へ反映(確認→確定)→task_change_history 記録 を確認

## 残課題（未実装・設計は MASTER_SPEC 参照）

- テーブル未実装：要員(workers/teams/qualifications/…)、資材、試験記録、図面版管理(documents/document_versions)、通知、weather_records
- フロント未API化：要員・工事台帳・報告書・図面・通知・ダッシュボード集計
- Task に asset_id FK が無く Asset→Task は Site 単位の連動（厳密な設備単位の工程紐付けは将来スキーマ拡張時に対応）
- AI実推論（YOLO/ViT/OCR/RAG/LLM/工期予測）と AI Worker（`ai_analysis_jobs`購読→`ai_predictions`書込）
- 帳票のPDF/Excel実出力

## 次回作業（1〜3項目）

1. AI Worker雛形（`ai_analysis_jobs`購読→ダミー`ai_predictions`書込→写真/品質画面が既存経路で表示）
2. 要員・工事台帳・図面・通知のAPI化
3. ダッシュボード集計のAPI化

## 変更ログ（差分のみ追記）

- 2026-07-23 Ver.0.1 完了（backend基盤・認証・案件/工程API・Seed・docs・テスト）
- 2026-07-23 開発ルールを追記、MASTER_SPEC.md / PROGRESS.md を新設
- 2026-07-23 Ver.0.1.1 完了（施工写真・品質・日報を DB/API 化、ai_predictions経由のAI表示、監査ログ、権限、Seed、pytest18/build/E2E）
- 2026-07-23 Ver.0.1.1 残課題対応（写真アップロード連動UI・日報の写真/工程紐付け・工程実績へ反映[確認画面付き]、assets/tasks の site_id フィルタ、reflect dry-run、pytest22/build/E2E）
