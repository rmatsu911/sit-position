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

Ver.0.2（AI施工写真認識 PoC基盤）完了。ブランチ `claude/session-rkd93u`。
AI Worker(分離)＋YOLO推論IF(交換可)＋正規化bbox＋既存UIへの実接続＋人間フィードバック(ai_feedback)を実装。
**実学習済みweightsは未配置＝MODEL_NOT_AVAILABLE**（Seedのデモ予測はDEMO明示・本物のAI完成には見せない）。

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

## Ver.0.1.2 で追加（業務基盤完成・2026-07-23）

- **migration** `062aef7de195`（新テーブル10、既存データ非破壊）→ 40テーブル
- **Task↔Asset**：中間テーブル `task_assets`（1工程=複数設備）。`GET /projects/{id}/tasks?asset_id=` で設備に紐づく工程に限定。写真アップロードの Project→Site→Asset→Task 連動が設備選択で工程を絞り込み（Seedで task_assets 投入）
- **要員・資格**（`workers/teams/qualifications/worker_qualifications/worker_assignments`）：`GET /workers`（一覧：所属/班/役割/資格/配置先/稼働状況/連続勤務）・`GET /workers/{id}`（詳細：所属会社/資格有効期限/案件・工程配置）。Seed 12名
- **工事台帳**（`project_ledgers`：projectsを基本データとし台帳固有項目のみ保持）：`GET /ledger`（契約番号/原価/利益率/請求状況/書類状況、案件スコープ）・`PUT /ledger/{project_id}`（PM、監査記録）
- **図面・書類**（`documents/document_versions`）：`GET /documents`・詳細（版履歴）・`POST /documents`（新規 or 新版アップロード＝古い版を残す）・`PATCH`（種別/ステータス）・論理削除。Seed 6図面（版付き）
- **通知**（`notifications`）：`GET /notifications`（自分宛＋全体、協力会社は割当案件外を除外）・既読/全既読。Seed 10件
- **ダッシュボード集計**：`GET /dashboard/summary`（全案件/進行中/遅延/本日作業/写真未確認/品質確認待ち/未提出日報/本日要員、案件スコープ集計）
- **権限**：ledger/documents/notifications/dashboard に案件スコープ（協力会社は割当案件のみ）。台帳更新=PM、図面アップロード=PM/FIELD_WORKER、削除/メタ更新=PM。重要操作は audit_logs 記録
- **フロント接続**（UI維持）：`src/api/personnel.ts` `ledger.ts` `documents.ts` `notifications.ts` `dashboard.ts` 追加、`Personnel/Ledger/Drawings/Notifications/Dashboard.tsx` を接続。ローディング/エラー/空データ状態を追加
- **テスト**：`test_features.py` に Task/Asset・要員・台帳・図面版管理・通知・ダッシュボード・権限スコープを追加 → pytest 29件通過。`npm run build` 成功。ブラウザE2E：5画面が実データ描画・通知全既読・要員配置・写真アップロードのAsset→Task絞り込みを確認

## Ver.0.1.3 で追加（実用基盤仕上げ・2026-07-23）

- **migration** `6b1c1111572b`（新テーブル4：materials/project_materials/test_records/report_exports、既存非破壊）→ 44テーブル。`openpyxl`/`reportlab` を依存に追加
- **要員配置の永続化**：`POST /workers/{id}/assign`（案件/工程へ配置＝稼働化・監査）・`DELETE /workers/{id}/assign/{aid}`（解除＝配置無しなら待機化）・`GET /workers/assignment-check/{project_id}`（予定人数 vs 配置人数）。Personnel のドラッグ配置を実際にDB保存し reload保持（既存UI維持、PM のみ）
- **資材管理**（`materials`/`project_materials`）：`GET /materials?project_id=&task_id=`・`POST /materials`（マスタ自動作成＋案件/工程紐付け）・`PUT /materials/{id}`。ProjectDetail「資材」タブを実データ化＋登録フォーム。Seed 5件
- **試験記録**（`test_records`）：`GET /test-records?project_id=&asset_id=&task_id=&test_type=`・`GET /{id}`・`POST`（Asset/Task紐付け・測定者記録）。Quality 画面に試験記録パネル＋登録モーダル。光工事Seed 4件（光損失測定/OTDR/導通確認）
- **図面の実ファイル表示**：`document_versions` に `file_url`/`mime_type` を露出。Drawings で PDF=iframe・PNG/JPEG=img 表示、対応外形式はファイル情報＋ダウンロード、実ファイル無しは従来SVG。版管理維持。Seed が実PDF/PNGを生成
- **帳票の実出力基盤**（`app/services/reports.py`：タイトル＋メタ＋表 に正規化する共通ビルダー）：`GET /reports/construction-management?project_id=&format=pdf|xlsx` が tasks から施工管理表を生成しダウンロード（PDF=reportlab日本語CID / Excel=openpyxl）。Reports 画面のPDF/Excelボタンを実DL化。`GET /reports/types` で対応帳票を列挙。将来 施工写真台帳/工程表/日報/品質/試験記録/完成報告書 へ共通化可能
- **権限/監査**：配置・資材・試験・帳票出力は案件スコープ＋ロール認可（配置=PM、資材=PM/FIELD_WORKER、試験=PM/FIELD_WORKER/QUALITY_MANAGER）。登録/変更/削除/配置/出力を audit_logs 記録
- **テスト**：`test_features.py` に 要員配置/資材/試験記録/帳票PDF・Excel/権限スコープ を追加 → pytest 36件通過。`npm run build` 成功。ブラウザE2E：要員配置→reload保持、資材登録→reload保持、試験記録(Asset/Task紐付け)→reload保持、図面PDF表示、帳票PDF＋Excelダウンロード を確認

## Ver.0.2 で追加（AI施工写真認識 PoC基盤・2026-07-23）

- **AI Worker**（`backend/ai_worker/`・別プロセス）：`python -m ai_worker.worker`（常駐）/`--once`。QUEUED→PROCESSING→COMPLETED（`ai_predictions`保存）／FAILED（`error_message`/`retry_count`）。**Worker停止でも本体は正常**（依存しない）
- **Predictor分離**（`ai_worker/predictor.py`）：`YoloPredictor`（Ultralytics実推論・weightsは`AI_MODEL_PATH`から・コード埋込なし・交換可・未配置は`MODEL_NOT_AVAILABLE`）と`FakePredictor`（**テスト専用**・実結果として保存表示しない）。既定は yolo
- **クラス体系**：`backend/datasets/data.yaml`（YOLO metadata）が正。`utility_pole/optical_cable/closure/onu/optical_termination_box`（電柱/光ケーブル/クロージャ/ONU/光成端箱）。コードにハードコードしない（`ai_worker/classes.py` がローダ）
- **Prediction正規化**：`bounding_box` は正規化(0-1)左上原点 xywh(`{"format":"xywhn"}`)で保存。`GET /photos/{id}/ai` が表示座標(100x75)へ変換＋`bbox_norm`も返す（画像サイズ非依存）。`model_id` でModel/Dataset Version追跡（別Versionで再解析しても過去結果を残す）
- **人間フィードバック**：`POST /photos/{id}/predictions/{pid}/feedback`（correct/reclassify/false_positive）・`POST /photos/{id}/missed-feedback`（未検出）。**AI予測は上書きせず** `ai_feedback` にAI結果+人間結果を両方保存。migration `5aeaba61edcb`（ai_feedback.prediction_id を nullable 化）
- **既存施工写真UI**：Lightbox の物体検出枠/設備名/confidence/認識結果はそのまま利用し、`ai_predictions` API へ接続。モデル状態バッジ（ACTIVE/未学習DEMO/MODEL_NOT_AVAILABLE）＋検出ごとに 正しい/クラス修正/誤検出＋未検出報告を追加
- **モデル状態の明示**：実weights未配置＝`MODEL_NOT_AVAILABLE`。Seedのデモ予測は `AiModel.status=DEMO`（未学習）としてUIに明示（本物のSYSKEN認識が完成したようには見せない）。`GET /ai/models` でVersion一覧
- **学習基盤**：`datasets/dataset_v001/{images,labels}/{train,val,test}`+`data.yaml`、`scripts/train_yolo.py`・`scripts/evaluate_yolo.py`（dataset/model/epochs/imgsz/batch/device・出力は`runs/`）。weights/実写真は `.gitignore` で除外。ultralytics は `[ai]` optional 依存
- **テスト**：pytest 41件通過（統合経路 Job→Worker→Prediction→API→Feedback、MODEL_NOT_AVAILABLE時はFAILED/予測0、Worker停止でも本体200、未検出報告、models一覧）。`npm run build` 成功。ブラウザE2E：Lightboxで正規化bbox描画・モデル未学習明示・フィードバック保存（AI予測は保持）を確認

## Ver.0.2.1 で実施（実運用化総点検・デモ要素撤去・2026-07-23）

「プロトタイプ／デモ」を「実運用前提の業務システム」へ整理。API未接続の固定ダミー・架空実績・偽の完成表示を撤去し、データが無い箇所は Empty State に統一。開発／本番の表示分離を徹底。

- **環境分離基盤**：frontend `src/lib/env.ts`（`APP_ENV`/`IS_PRODUCTION`/`IS_DEV_VISIBLE`/`APP_VERSION`/`ENV_LABEL`）、backend `settings.app_env`/`app_version`、`GET /api/meta`。`__APP_VERSION__` を package.json から Vite で注入。開発専用表示（Seed識別・AIのDEMO状態・発表用デモ・デバッグ）は `IS_DEV_VISIBLE`（=APP_ENV≠production）でのみ表示、本番では非表示
- **Seed＝開発データの明示**：`seed.run(allow_production=False)` で **APP_ENV=production の自動投入をブロック**（`--force-production` で明示上書きのみ）。`audit_logs` に dev-fixture マーカー（`SEED_FIXTURE_VERSION`）を記録。スキーマ変更なし
- **共通UI**：StatusBar を実運用フッター化（PostgreSQL/件数/環境ラベル[dev only]/実バージョン）、固定日時「最終同期 2026/07/21 15:30」撤去、AppHeader 通知を API 化、Login のデモ資格情報は開発環境のみ表示
- **ダッシュボード**：全KPI・進捗・アラート・通知を集計API/実データ化。天候は「気象情報未連携」Empty State（将来API接続構造は維持）
- **施工写真**：AIローカル固定推論（`recognitionFor`/`detectionsFor`/`recogBoxesFor`）を撤去し **AI結果は `ai_predictions` API のみ**、無ければ「AI解析結果がありません」Empty State。実アップロード画像を `PhotoImage`（`original_url`/`thumbnail_url`）で表示、無ければプレースホルダ。モデル状態表示を正直化（ACTIVE=モデル名/版、MODEL_NOT_AVAILABLE=「AIモデル未設定」、DEMO=開発環境のみ「検証用モデル」・本番では内部名を出さない）。物体検出枠/confidence/フィードバックUIは維持
- **品質管理**：「AI品質チェック」の固定異常検知（`anomalyFindings`/`anomalyMeta`/`detectionPoints`）を撤去し「AI解析結果なし（未連携）」Empty State 化
- **工程管理**：API取得失敗時の**固定ダミーへのフォールバックを撤去**しエラー明示。「AI工期予測」の固定 forecast/グラフを「工期予測未連携」Empty State 化。ガント日別ヘッダの架空天気アイコンを撤去
- **要員管理**：架空の週間勤怠グリッド（固定日付＋Seed実績）を撤去し「勤務予定（勤怠）未連携」を明示、日別列は開発環境のみサンプル表示。案件配置ボードの固定案件名を実 projects へ変更
- **図面**：実ファイル未登録時の偽の系統図SVG＋架空ピンを撤去し「図面ファイルが登録されていません」Empty State 化（実PDF/画像は従来どおり表示）
- **案件詳細**：固定天候(`todayEnv`)を「未連携」表記へ、施工写真タブを実写真API＋Empty State 化
- **設定**：組織・部署の固定担当者/人数表を「マスタ未整備」Empty State 化。AI機能パネルの説明を「構想（実装済み＋今後実装予定を含む）」へ正直化
- **フロントの単一データ経路**：PostgreSQL→FastAPI→TanStack Query→React に統一。API失敗時の固定ダミー自動代替を全廃しエラー/Empty で表示。未使用の固定データファイル（`data/photos`・`data/quality`・`data/dailyReports`・`data/drawings`・`data/ledger`・`data/notifications`・`data/personnel` と `schedule` の固定工程/予測）を削除
- **デモ検索の最終結果**：`demo/sample/seed/mock/dummy/ダミー/サンプル` の残存は (1)説明コメント (2)**開発/検証環境のみ表示の「発表用デモモード」**（Layoutバナー/DemoGuide/Settings demoタブ=すべて `IS_DEV_VISIBLE`・`devOnly` ゲート、本番非表示） (3)AIの `seed-demo`/`DEMO` モデル状態の**正直な**ハンドリング（本番はSeed非投入のため出現せず、出ても内部名は非表示） (4)PhotoPlaceholder の「サンプル」ラベル（実写真が無い場合の代替と明示）のみ。**本番相当（APP_ENV=production）で表示される固定業務データ・架空実績・偽の完成表示は残っていない**
- **テスト**：pytest 41件通過、`npx tsc --noEmit` クリーン、`npm run build` 成功、backendスモーク（login/meta/projects/workers/documents/notifications/dashboard・photo AI=seed-demo/DEMO）確認。既存機能の非破壊を確認

## 残課題（未実装・設計は MASTER_SPEC / ai-design 参照）

- **実weights未配置**（`MODEL_NOT_AVAILABLE`）。SYSKEN実写真のアノテーション→学習→`AI_MODEL_PATH`配置は今後（基盤は完成）
- weather_records（工期予測）未実装。帳票は施工管理表のみ
- ViT/OCR/RAG/LLM/品質AI本格実装（今回対象外）
- CADの本格ビューア（PDF/画像のみ対応）

## 次回作業（1〜3項目）

1. SYSKEN実施工写真のアノテーション＋YOLO学習→weights配置→実推論の有効化（`pip install -e ".[ai]"` → train → AI_MODEL_PATH）
2. AI結果採用率/修正率/確認時間のKPI集計API（`ai_feedback`ベース）＋ダッシュボード表示
3. 帳票の共通基盤へ他帳票追加 / weather_records基盤

## 変更ログ（差分のみ追記）

- 2026-07-23 Ver.0.1 完了（backend基盤・認証・案件/工程API・Seed・docs・テスト）
- 2026-07-23 開発ルールを追記、MASTER_SPEC.md / PROGRESS.md を新設
- 2026-07-23 Ver.0.1.1 完了（施工写真・品質・日報を DB/API 化、ai_predictions経由のAI表示、監査ログ、権限、Seed、pytest18/build/E2E）
- 2026-07-23 Ver.0.1.1 残課題対応（写真アップロード連動UI・日報の写真/工程紐付け・工程実績へ反映[確認画面付き]、assets/tasks の site_id フィルタ、reflect dry-run、pytest22/build/E2E）
- 2026-07-23 Ver.0.1.2 完了（Task↔Asset・要員/資格・工事台帳・図面/書類・通知・ダッシュボード集計を DB/API 化、migration 062aef7de195[40テーブル]、権限スコープ、Seed、pytest29/build/E2E）
- 2026-07-23 Ver.0.1.3 完了（要員配置永続化・資材・試験記録・図面実ファイル表示・帳票実出力[施工管理表 PDF/Excel]、migration 6b1c1111572b[44テーブル]、openpyxl/reportlab追加、pytest36/build/E2E）
- 2026-07-23 Ver.0.2 完了（AI Worker分離・YOLO推論IF[交換可/MODEL_NOT_AVAILABLE]・正規化bbox・既存UI実接続・人間フィードバック[ai_feedback]・data.yamlクラス体系・学習/評価スクリプト、migration 5aeaba61edcb、pytest41/build/E2E。実weightsは未配置）
- 2026-07-23 Ver.0.2.1 完了（実運用化総点検・デモ要素撤去：APP_ENV環境分離＋Seed production ガード、AI/品質/工程/要員/図面/案件詳細/設定 の固定ダミー撤去→Empty State 化、API失敗時の固定フォールバック全廃、未使用固定データ7ファイル削除、DEMO/Seed表示は開発環境のみ、pytest41/tsc/build/スモーク。本番相当で表示される架空業務データは残存なし）
