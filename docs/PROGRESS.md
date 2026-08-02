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

## Ver.0.3 Phase 0 で追加（改修の基盤整備・2026-07-31）

参考システムの業務フロー（横断工程表・横断マイルストーン・カレンダー・報告・現場連絡）を
取り込む大規模改修の**前段**として、既存機能を壊さずに土台だけを整える工程。
**画面のレイアウト・配色・列構成・操作は変更していない。**

- **監査**：43テーブル／19ルーターを調査。新規に必要な `milestones`・`chat_*`・`saved_searches`・
  `user_settings`・`calendar_tokens`・`project_labels` は**すべて不在**を確認。ブロッカーを3件特定
  （①ガントの表示期間と「今日」がハードコード ②AM/PMがフロントの日付丸めで失われる
  ③マイルストーンが `name === '引き渡し'` の文字列一致ハック）
- **時間軸エンジン新設**（`src/lib/timeline.ts`）：日付→座標の計算を1箇所へ集約。
  3時間/日/週/月/年、Asia/Tokyo統一（固定オフセット＋DST非依存）、列境界はカレンダー演算、
  座標は「列インデックス＋列内按分」で可変長の月/年でも正確。`MIN_BAR_WIDTH` で0.5日工程も視認可。
  **ヘッダーとバーが同じ `slots` を参照する構造**にし、ずれを設計で防止
- **固定値の撤廃**：`data/schedule.ts` の `ganttRange`（2026-06-01〜08-12）と固定の
  「今日」（2026-07-21）を削除。表示期間は工程の実期間＋前後7日（今日を含む）から動的算出。
  今日線は実時刻位置に描画し、範囲外なら非表示。進行中工程の実績バーは実際の今日まで
- **ESLintをゲートとして機能化**：`backend/**`（Python venv同梱JS）を除外し、宣言だけで
  動いていなかった `react-hooks` / `react-refresh` のルールを有効化 → **12 error → 0 error**
- **検証資産**：`npm run test:timeline`（時間軸21ケース）と `scripts/e2e-regression.mjs`
  （全13ルートのスクショ・コンソールエラー・失敗リクエスト収集）、`docs/regression-baseline.md`
- **バグ検出と修正**：ユニットテストにより `xOf`/`spanOf` の**JST二重変換**（9時間ずれ）を発見し修正。
  実ブラウザ実測でバー幅＝`(終了日−開始日+1)×列幅`、今日線＝06-01から60.47日
  （60日＋実行時刻11:33 JSTの端数）で、バーと今日線が同一基準で正しいことを確認
- **テスト**：pytest **43件通過**、`tsc` エラー0、ESLint **エラー0**、`npm run build` 成功、
  `test:timeline` **21件通過**、全13ルートのブラウザ回帰で**コンソールエラー0・失敗リクエスト0**

## Ver.0.3 Phase 1 で追加（0.5日単位の工程＋工程管理のタブ構造・2026-07-31）

- **DB**：`tasks.schedule_precision`（`day` / `half_day` / `time`）を追加。migration `a1c7d3f90b21`。
  **日時が正**で、precision は入力・表示の粒度判定にだけ使う（日時と二重管理しない）
- **日時の意味を統一**：工程の期間を `[開始, 終了)` の半開区間（Asia/Tokyo）へ。
  午前=00:00〜12:00 / 午後=12:00〜翌00:00、終了は exclusive。
  同じ migration で既存工程の `09:00` プレースホルダを **日単位（00:00〜翌00:00）へ正規化**し、
  半日として誤解釈されないようにした（表示上の期間は不変）。Seed も同じ形へ修正
- **時間軸エンジン拡張**（`src/lib/timeline.ts`）：`startAtOf`/`endAtOf`/`splitStartAt`/`splitEndAt`/
  `durationInDays`/`isHalfDayPeriod`/`formatPeriod`/`shiftDays` を追加。
  **値を返す関数は Date ではなく ISO 文字列を返す**設計にし、`toJst()` の二重適用（9時間ずれ）を構造的に防止
- **フロント**：`WbsTask` を `planStartAt`/`planEndAt`/`actualStartAt`/`actualEndAt`＋`precision` へ変更し、
  アダプタの日付丸め（`ymd()`）を撤廃。ガントのバー・基準線・実績・依存線・ドラッグを日時基準に統一
- **入力UI**：工程編集モーダルに「1日単位／0.5日単位」の切替（**既定は1日単位**）。
  0.5日を選んだときだけ午前/午後を表示。期間（0.5刻み）をその場に表示し、終了≦開始はエラー表示
- **タブ構造**：工程管理に `案件工程` / `横断工程` / `横断マイルストーン` / `カレンダー` を追加。
  `/schedule/*` と `/projects/:id/schedule/*` の両方で直接開ける。
  **未実装タブはダミーを出さず**「未実装です」＋実装予定の一覧のみ表示
- **最小幅の是正**：`MIN_BAR_WIDTH` を 6→3px。月表示のような狭い列幅でも 0.5日 が 1日の半分の
  実寸（比率0.50）で描かれ、最小幅で長さをごまかさない
- **型検査ゲートの修正**：`npx tsc --noEmit` はソリューション構成のため**何も検査していなかった**。
  `npm run typecheck`（`tsc -b`）を追加（`npm run build` 内では検査されていたため実害なし）
- **テスト**：pytest **45件**（半日の往復・既定day・9時間ずれ検出を追加）、
  `test:timeline` **46件**、ESLint 0 error、build 成功、13ルート回帰でコンソールエラー0。
  実ブラウザで 半日の登録→保存→再読込→ドラッグ移動→再読込、日/週/月表示、折りたたみ、依存線を確認

## Ver.0.3 Phase 2 で追加（横断工程表・2026-07-31）

複数案件の工程を1画面で確認する実運用向けの画面。**独自データは持たず**、既存の
`projects` / `tasks` / `users` / `companies` を横断表示するビューとして実装した。
既存の「案件工程」タブはそのまま残している（置換していない）。

- **DB**：migration `b3e5a71c2d40`
  - `tasks.company_id`（担当会社。協力会社を含む）。担当者の所属会社とは独立して割り当てるため、
    `users.company_id` からの導出ではなく列として持つ
  - `saved_searches`（保存検索条件）。端末を変えても使えるよう **localStorage ではなく DB** に保持
  - Seed に p1 以外の7案件の工程（55件）を追加。0.5日単位・未割当・**同名で別レコードの担当会社**を含み、
    横断表示・グループ化・権限の検証が実データでできる状態にした
- **API**（`backend/app/api/schedule.py`）
  - `GET /api/schedule/cross`：キーワード / 表示期間 / 案件 / 工事区分 / 部署 / 状態 / 担当者 /
    担当会社 / 遅延のみ / 未割当のみ の複合フィルタ。**1本の JOIN で解決し N+1 を避ける**。
    一致した工程の祖先を `matched=false` で補って **WBS の親子関係を維持**。
    表示期間は対象工程の実期間から返す（固定日付を持たない）。上限件数を超えたら `truncated` を返す
  - `GET /api/schedule/cross/options`：絞り込みの選択肢（**権限と案件スコープの範囲だけ**）
  - `GET /api/schedule/cross/export`：現在の絞り込み条件のまま Excel / PDF を生成。
    出力日時・出力者・適用条件をメタに含める。既存 `services/reports.py` を再利用
  - `CRUD /api/schedule/saved-searches`：保存検索条件（ユーザー単位）
  - 権限は既存の `accessible_project_ids` / `ensure_project_access` を**そのまま再利用**し、別実装を作らない。
    スコープ外の案件はフィルタで指定されても返さず、単一案件指定は 403 を返す
- **画面**（`src/pages/schedule/CrossSchedule.tsx`）
  - 正式ルート `/schedule/cross` と `/projects/:id/schedule/cross`（後者は対象案件で絞り込んだ状態）
  - **案件別 / 担当者別 / 担当会社別**の切替。グループは折りたたみ可・工程件数つき。
    未割当も「未割当」として表示し除外しない。**同名でもIDが違えば別グループ**（画面にIDを併記）
  - 表示単位は **3時間 / 日 / 週 / 月 / 年**。すべて `src/lib/timeline.ts` の同じ `slots` を使う
  - 左一覧は WBS / 案件名 / 工程名 / 担当者 / 担当会社 / 予定・実績 / 期間 / 進捗率 / 人工 / 状態 /
    遅延 / 備考。表示項目設定で列を切替（WBS・案件名・工程名は常時表示＝横スクロールしても消えない）
  - 絞り込み条件は **URLクエリと1対1**。再読込・URL直開きでも条件が復元される。「条件をクリア」あり。
    0件は Empty State（**ダミー工程を出さない**）。検索中／取得失敗／0件を区別して表示
  - 編集：工程クリックで詳細、案件工程へ移動、進捗更新、担当者変更、担当会社変更、日程ドラッグ、
    右クリックメニュー。更新は**既存の `PUT /api/tasks/{id}`**（監査ログ・履歴も既存のまま）。
    **担当者・担当会社は表示名ではなくIDで更新**。保存失敗時は楽観更新を戻してエラーを表示
  - ドラッグは粒度でスナップ（`day`=1日刻み / `half_day`=**0.5日刻み**）。`time` は Phase 2 では編集対象外
- **共通化**：ガントのヘッダー・バー・グリッド・今日線・依存線・凡例を `schedule/GanttParts.tsx` へ抽出し、
  **案件工程と横断工程が同じ実装を共有**する（見た目と座標基準を複製しない）
- **システム検知**：予定終了超過 / 同一担当者の工程重複 / 同一担当会社の割当重複 / 未割当工程 /
  実績未入力 を**確定計算**で算出。推論も確信度も使わないため「AI予測」とは表示せず、
  AI予測は「未解析」と明示する（固定値・ランダム値を返さない）
- **不具合の是正**（実測で発見）
  - `MIN_BAR_WIDTH` 3→**1px**。月表示は 1日 ≒ 3px のため、下限 3px だと 0.5日バーが 1日バーと
    同じ幅に膨らんでいた。全表示単位で「0.5日 = 1日の半分」を実寸で維持
  - 左一覧が**独立してスクロールし**右のガントとずれていた。flex の既定 `stretch` と
    `overflow-x-auto` の組み合わせで縦も独立スクロール枠になっていたため、`items-start` で解消
  - ESLint が Playwright スクリプトのブラウザグローバルを検出できていなかった設定の穴を修正
- **テスト**：pytest **56件**（45→+11：ID基準の集約 / 親子関係の維持 / 未割当 / 案件スコープ /
  0.5日の往復 / システム検知 / 表示期間の動的算出 / 出力 / 保存検索条件 / ID更新）、
  `test:timeline` **113件**（46→+67：0.5日スナップ・月跨ぎ・うるう年・3時間〜年・
  pxPerDay・rangeForScale・表示期間指定）、
  ESLint 0 error、build 成功、**18ルート**の回帰でコンソールエラー0・失敗リクエスト0、
  `scripts/cross-schedule-measure.mjs` の**ピクセル実測25件**すべて一致

### Phase 2 完了処理（2026-07-31）

- **既存「案件工程」の縦スクロールずれを是正**：横断工程で見つけた原因（flex の既定
  `stretch` と `overflow-x-auto` の組み合わせで左右が独立したスクロール枠になる）は
  既存画面にも当てはまっていたため、同じ `items-start` を適用。
  レイアウト・配色・列構成・横スクロール・固定列・折りたたみ・依存線・ドラッグは非変更。
  実測で左一覧の行と右ガントのバーがともに **320px** 動くことを確認
- **印刷を実装**：`window.print()` だけでは紙面が崩れるため、`@media print`
  （`src/index.css`）と `data-print` 属性で帳票として成立させた。
  サイドバー・アプリヘッダー・ステータスバー・ツールバー・絞り込み・システム検知・
  凡例・タブ・操作ボタン・ガントを除外し、印刷用見出し（帳票名／出力日時／出力者／
  表示の切替／対象工程数／適用した検索条件）＋工程一覧を出力する。
  スクロール枠の高さ制限と `sticky` を解除して全行を紙面に流す。
  **印刷される工程行数がAPIの返却件数と一致**することを実測で確認（画面・Excel・PDF と同条件）
- **表示単位（3時間/日/週/月/年）を3画面へ統一**：案件工程は「日/週/月」しか無く、
  しかも中身は全て `scale:'day'` の列幅ズーム（34/15/7px）で3時間・年を選べなかった。
  共通部品 `ScaleSelector`（`schedule/GanttParts.tsx`）へ置き換え、
  `/projects/:id/schedule`・`/schedule/cross`・`/projects/:id/schedule/cross` の
  すべてで5単位を直接選べるようにした。選択中の単位は `aria-pressed` で明示し、
  URLクエリ `?scale=` に反映して再読込でも復元する。
  表示範囲の算出も共通の `rangeForScale` に集約し、画面ごとの別計算を作らない。
  あわせて次の不具合を修正した:
  - `snapDelta` に列幅を渡していたためドラッグの移動日数が単位ごとにずれていた
    （週表示は1列=7日、3時間表示は1列=3時間）。`Timeline.pxPerDay` を追加して是正
  - 3時間表示の表示範囲を「今日」中心に固定していたため、工程が今日から離れていると
    1件も表示されなかった。工程期間を基準に判断するよう変更
  - 「表示期間」で絞り込んでも時間軸が工程の全期間のままで、絞り込み結果と目盛りが
    食い違っていた。指定があれば全単位でその期間を時間軸にする
- **最終回帰**：`scripts/cross-schedule-final.mjs` を追加（**39件すべて一致**）。
  複数案件 / 未割当 / 同名でIDが異なる担当会社 / 3種のグループ切替 / truncated /
  半日ドラッグと再読込 / 既存案件工程と横断工程の縦位置 / コンソールエラー0・失敗リクエスト0

## 残課題（未実装・設計は MASTER_SPEC / ai-design 参照）

- **実weights未配置**（`MODEL_NOT_AVAILABLE`）。SYSKEN実写真のアノテーション→学習→`AI_MODEL_PATH`配置は今後（基盤は完成）
- weather_records（工期予測）未実装。帳票は施工管理表のみ
- ViT/OCR/RAG/LLM/品質AI本格実装（今回対象外）
- CADの本格ビューア（PDF/画像のみ対応）

## 次回作業（1〜3項目）

1. **Phase 3 の完了判定**：P3-1〜P3-5 の内容で完了条件を確認する
2. **図面提出期限**：`documents` に期限日の列が無く、カレンダーへ統合できていない。
   列の新設（migration）と運用の決定が必要
3. **Phase 4以降**：個人設定（表示設定・職種と権限の分離・カレンダー購読）、報告強化、現場連絡、AI高度化
3. **Phase 4以降**：個人設定（表示設定・職種と権限の分離・カレンダー購読）、報告強化、現場連絡、AI高度化

## 変更ログ（差分のみ追記）

- 2026-07-23 Ver.0.1 完了（backend基盤・認証・案件/工程API・Seed・docs・テスト）
- 2026-07-23 開発ルールを追記、MASTER_SPEC.md / PROGRESS.md を新設
- 2026-07-23 Ver.0.1.1 完了（施工写真・品質・日報を DB/API 化、ai_predictions経由のAI表示、監査ログ、権限、Seed、pytest18/build/E2E）
- 2026-07-23 Ver.0.1.1 残課題対応（写真アップロード連動UI・日報の写真/工程紐付け・工程実績へ反映[確認画面付き]、assets/tasks の site_id フィルタ、reflect dry-run、pytest22/build/E2E）
- 2026-07-23 Ver.0.1.2 完了（Task↔Asset・要員/資格・工事台帳・図面/書類・通知・ダッシュボード集計を DB/API 化、migration 062aef7de195[40テーブル]、権限スコープ、Seed、pytest29/build/E2E）
- 2026-07-23 Ver.0.1.3 完了（要員配置永続化・資材・試験記録・図面実ファイル表示・帳票実出力[施工管理表 PDF/Excel]、migration 6b1c1111572b[44テーブル]、openpyxl/reportlab追加、pytest36/build/E2E）
- 2026-07-23 Ver.0.2 完了（AI Worker分離・YOLO推論IF[交換可/MODEL_NOT_AVAILABLE]・正規化bbox・既存UI実接続・人間フィードバック[ai_feedback]・data.yamlクラス体系・学習/評価スクリプト、migration 5aeaba61edcb、pytest41/build/E2E。実weightsは未配置）
- 2026-07-23 Ver.0.2.1 完了（実運用化総点検・デモ要素撤去：APP_ENV環境分離＋Seed production ガード、AI/品質/工程/要員/図面/案件詳細/設定 の固定ダミー撤去→Empty State 化、API失敗時の固定フォールバック全廃、未使用固定データ7ファイル削除、DEMO/Seed表示は開発環境のみ、pytest41/tsc/build/スモーク。本番相当で表示される架空業務データは残存なし）
- 2026-07-24 Ver.0.2.3 業務フロー・UI回帰総点検（第1段階）：案件CREATE→LIST→DETAIL→UPDATE→再取得の統合テストを追加。案件詳細に編集UIを追加しQuery prefix invalidation＋active refetchを明示。工程画面の固定`project_id=1`を廃止して案件IDルーティングへ統一。本格WBS＋ガントUIを維持したまま工程追加/親子/編集/コピー/削除/進捗更新/完了/依存関係/ドラッグ日程変更をTask APIへ接続し、工程変更履歴・監査ログ・reload保持を維持。Task APIに依存関係入出力と論理削除を追加。pytest43件、TypeScript、production build、lint（警告のみ）成功。Cloud Browser接続タイムアウトのため実ブラウザ確認は未完了。AI関連は未変更。
- 2026-07-31 Ver.0.3 Phase 0 完了（改修基盤：時間軸エンジン `src/lib/timeline.ts` 新設で日付→座標を集約、ガントの固定表示期間・固定「今日」を撤廃し実データから動的算出、ESLintをゲート化[12 error→0]、時間軸21ケース＋全ルート回帰スクリプトを追加。JST二重変換バグを検出・修正。画面の見た目・操作は非変更。pytest43/tsc/lint/build/timeline21/E2Eエラー0）
- 2026-07-31 Ver.0.3 Phase 1 完了（0.5日単位の工程：tasks.schedule_precision 追加[migration a1c7d3f90b21]、期間を[開始,終了)の半開区間へ統一し既存の09:00を日単位へ正規化、timeline に半日ユーティリティ追加[値はISO文字列を返し二重変換を防止]、WbsTaskを日時基準へ変更、編集UIに1日/0.5日切替[既定1日]、工程管理に4タブ追加[未実装タブはダミーなし]、MIN_BAR_WIDTH 6→3で最小幅による見た目のごまかしを排除、npm run typecheck 追加。pytest45/timeline46/lint0/build/13ルート回帰エラー0）
- 2026-07-31 Ver.0.3 Phase 2 完了（横断工程表：tasks.company_id と saved_searches を追加[migration b3e5a71c2d40]、GET /schedule/cross 集約API[複合フィルタ・N+1回避・権限と案件スコープをAPI側で適用・WBS親子を維持]、cross/options と cross/export[Excel/PDF]、保存検索条件CRUD、横断工程画面[案件別/担当者別/担当会社別・3時間〜年・列表示設定・URLクエリ連動・縦スクロール同期]、編集操作[進捗/担当者/担当会社/0.5日スナップドラッグ/右クリック・楽観更新のロールバック]、確定計算のシステム検知[AI予測とは表示しない]、ガント共通部品を GanttParts.tsx へ抽出して案件工程と共有、MIN_BAR_WIDTH 3→1 と左一覧の独立スクロールを是正。pytest56/timeline75/lint0/build/18ルート回帰エラー0/実ブラウザ実測25件一致）
- 2026-07-31 Ver.0.3 Phase 2 完了処理（既存「案件工程」の縦スクロールずれを items-start で是正[レイアウト非変更・左右とも320px一致を実測]、横断工程表の印刷を実装[@media print と data-print でサイドバー/ツールバー/ガント等を除外し、出力日時・出力者・表示の切替・対象工程数・適用条件つきの帳票に。印刷行数=API返却件数を実測で一致確認]、最終回帰スクリプト cross-schedule-final.mjs を追加。pytest56/timeline75/lint0/build/18ルート回帰エラー0/座標実測25件/完了確認39件すべて一致）
- 2026-08-01 Ver.0.3 Phase 2 補足（表示単位の統一：案件工程に3時間・年が無く「日/週/月」も実体は列幅ズームだったため、共通の ScaleSelector と rangeForScale へ統一し3画面すべてで3時間〜年を直接選択可能に[aria-pressed で現在単位を明示・URLクエリで復元]、Timeline.pxPerDay を追加してドラッグの移動日数が単位ごとにずれる不具合を是正、3時間表示の表示範囲が工程から離れると空になる不具合と表示期間指定が時間軸に反映されない不具合を修正。timeline113/pytest56/lint0/build/18ルート回帰0/座標実測25/完了確認39/表示単位検証50 すべて一致）
- 2026-08-02 Ver.0.3 Phase 3 P3-1（マイルストーンのDB化：`milestone_types` / `milestones` を工程とは別の正データとして新設[migration c4f2a86b1e73]、日付は案件工期から導出、工程名の文字列一致に依存しないテストを追加）
- 2026-08-02 Ver.0.3 Phase 3 P3-1 補足（`milestones` に `company_id`（担当者の所属から導出しない）／`related_task_id`（nullable+index・案件一致とスコープを検証）／`schedule_precision`（day=JST 00:00、half_day午前=00:00・午後=12:00、AM/PM専用列は作らない）を追加[migration d5a91c3e07b2]。既存 migration は書き換えず補足で追加）
- 2026-08-02 Ver.0.3 Phase 3 P3-2（横断マイルストーンの集約API：`GET /schedule/milestones` と `/options` `/summary`、複合フィルタのAND適用、案件スコープと5権限、1本のJOINでN+1回避、確定計算[完了/期限超過/近日予定/遅延完了/関連工程との日程矛盾]を `MilestoneFacts` に集約、未設定候補を**IDで**突き合わせて別配列で返却、件数上限と `truncated`）
- 2026-08-02 Ver.0.3 Phase 3 P3-2 補足（CRUD と出力：1件取得/登録/更新/論理削除、`resolve_related_task()` を登録・更新の両方で使用[存在しない・削除済み・別案件=422、スコープ外=403]、計算項目はリクエストから保存しない、監査記録、Excel/PDF を一覧と同じ `collect()` で生成し登録済みと未設定候補を区別）
- 2026-08-02 Ver.0.3 Phase 3 P3-3 完了（横断マイルストーン画面：`/schedule/milestones` と `/projects/:id/schedule/milestones` の ComingSoon を実画面へ置換。比較表[案件×区分・セル内に複数件を積み重ね・未設定は「未設定」＋登録ボタン]と時間軸[Phase 1・2の共通部品を再利用・3時間〜年・予定/実績を別形状・half_day午後は日の中央]を `view=`/`scale=`/絞り込み条件つきでURLへ1対1保存、件数はすべて `/summary` の確定計算を表示、保存検索は `screen='cross_milestones'` で既存機構を再利用、登録・編集・論理削除UI[保存失敗でモーダルを閉じない]、印刷/Excel/PDF の件数・条件一致。実測で half_day 午前の誤判定・表示範囲外マーカーの左端集中・時間軸印刷の行ずれ・モーダルの印刷混入を検出して是正。timeline113/pytest81/lint0/build/18ルート回帰0/座標実測25/完了確認39/表示単位50/マイルストーン画面127/出力一致130 すべて一致）
- 2026-08-02 Ver.0.3 Phase 3 P3-4 完了（表示名依存の判定を撤廃：`name === '引き渡し'` による暫定判定と `WbsTask.isMilestone` を削除し、マイルストーンは `milestones` / `milestone_types`（record_kind・milestone_type_id）だけで判定するよう統一。案件工程・横断工程に共通の `MilestoneMarkers`（GanttParts）でマイルストーン帯を追加し、工程＝期間バー／予定＝塗りマーカー／実績＝白抜きマーカーに描き分け。取得は `GET /schedule/milestones` を1画面1回（案件工程は project_id、横断工程は既存の案件スコープを維持）。名前が「引き渡し」の通常工程はバーのままドラッグ可能、名称を変えてもマイルストーンの種別・描画は変わらない。表示範囲の根拠に予定日・実績日を追加し、印刷の工程件数にマイルストーン帯が混ざらないよう帯は紙面から除外。API・DBの変更なし。timeline113/pytest91/lint0/build/18ルート回帰0/座標実測25/完了確認39/表示単位50/マイルストーン画面127/出力一致130/統合検証71/表示名監査0件 すべて一致）
- 2026-08-03 Ver.0.3 Phase 3 P3-5 完了（カレンダーと共通イベントAPI：`GET /schedule/calendar/events` と `/options` を新設し、工程・マイルストーン・品質確認期限・現場日報・試験記録という**実在する元データ**だけを共通形式へ変換。カレンダー専用テーブルは作らず二重保存しない。`event_id` は「種別:区分:元ID」で別テーブルの同じ数値IDを取り違えない。期間は Phase 1 と同じ半開区間、Asia/Tokyo 基準、day／half_day を維持。論理削除・権限外・案件スコープ外を除外し、SQLは種別ごとに1本で件数に比例しない。`total`/`displayed`/`truncated` を別々に返す。画面は ComingSoon を実装へ置換し、月表示／週表示・前／次／今日・URL保存と復元・種別別の識別・同日の積み重ね・元データへの遷移・保存検索（screen='schedule_calendar'）・Loading/Error/403/0件/truncated の区別に対応。日付計算は timeline.ts へ `calendarGrid`/`shiftCalendarAnchor`/`eventOnDay` を追加して集約し、画面専用の変換を作らない。図面提出期限は `documents` に期限日の列が無いため統合せず、監査結果として報告（ダミーは作らない）。DB変更・migration なし。timeline113/pytest102/lint0/build/18ルート回帰0/座標実測25/完了確認39/表示単位50/マイルストーン画面127/出力一致130/統合検証71/表示名監査0件/カレンダー61 すべて一致）
