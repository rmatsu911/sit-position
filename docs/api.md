# API 仕様（Ver.0.1）

- ベースURL: `/api`
- 認証: `Authorization: Bearer <JWT>`（`/auth/login` 以外は必須）
- OpenAPI: バックエンド起動後 `http://localhost:8000/docs`（Swagger UI）

## 認証

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/auth/login` | `{email, password}` → `{access_token}` |
| GET | `/auth/me` | 現在のユーザー |

## マスタ

| GET | `/masters/{master}` | `work-types` `process-types` `asset-types` `photo-types` `quality-rule-types` `construction-types` |

## 案件

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/projects?status=&q=` | 認証（協力会社は割当案件のみ） |
| GET | `/projects/{id}` | 認証＋案件スコープ |
| POST | `/projects` | PROJECT_MANAGER / ADMIN |
| PUT | `/projects/{id}` | PROJECT_MANAGER / ADMIN |
| DELETE | `/projects/{id}?reason=` | PROJECT_MANAGER / ADMIN（論理削除） |

`ProjectOut` は表示名解決済み（construction_type / department / manager）と集計（unconfirmed_photos / quality_checks）を含む。

## 現場・設備

| GET/POST | `/sites?project_id=` , `/assets?project_id=&site_id=` |（`site_id` で現場配下の設備に絞り込み＝Site→Asset 連動）

## 工程

| GET | `/projects/{id}/tasks?site_id=` | 一覧（read。`site_id` で現場配下の工程に絞り込み＝Site→Task 連動） |
| POST | `/projects/{id}/tasks` | 追加 |
| PUT | `/tasks/{id}` | 更新（差分を `task_change_history` に記録） |

## 施工写真（Ver.0.1.1）

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/photos?project_id=&site_id=&asset_id=&task_id=&photo_type_id=&confirm=&favorite=&tag=` | 認証＋案件スコープ・一覧 |
| GET | `/photos/{id}` | 詳細 |
| POST | `/photos`（multipart: `file`, `project_id`, `site_id?`, `asset_id?`, `task_id?`, `photo_type_id?`, `place?`, `comment?`） | 原本不変保存＋Pillowサムネ派生＋sha256＋`photo_no`自動採番 |
| PATCH | `/photos/{id}`（`tags?`, `comment?`, `favorite?`, `photo_type_id?`, `confirmed_*_type_id?`） | 情報/タグ/コメント編集 |
| PATCH | `/photos/{id}/confirm`（`confirmation_status`） | 確認状態変更（未確認/確認済み/再撮影依頼） |
| DELETE | `/photos/{id}?reason=` | 論理削除 |
| GET | `/photos/{id}/ai` | **ai_predictions 由来の検出枠（bbox）＋認識/工種/工程/設備判定。`source`=`ai_predictions`\|`none`。将来 YOLO が ai_predictions に書けば同じ経路で表示** |

## AI 施工写真認識（Ver.0.2 YOLO PoC）

| メソッド | パス | 説明 |
| --- | --- | --- |
| POST | `/ai/photos/{photo_id}/analyze?job_type=detection` | 解析ジョブを QUEUED 登録（AI Worker が処理） |
| GET | `/ai/jobs?photo_id=` , `/ai/predictions?photo_id=` | ジョブ・予測の参照 |
| GET | `/ai/models` | 登録AIモデル一覧（name/version/dataset_version/trained_at/status） |
| GET | `/photos/{id}/ai` | 予測結果（正規化bbox→表示座標変換・model情報・model_status・prediction_id付） |
| POST | `/photos/{id}/predictions/{pid}/feedback` | 人間フィードバック（correct/reclassify/false_positive）。AI予測は上書きせず `ai_feedback` へ |
| POST | `/photos/{id}/missed-feedback` | 未検出報告（prediction_id なしの ai_feedback） |

AI Worker（別プロセス）: `python -m ai_worker.worker [--once]`。実weights未配置時は `MODEL_NOT_AVAILABLE` でジョブFAILED・予測は保存しない（Fakeは実結果にしない）。クラス体系は `backend/datasets/data.yaml`。学習/評価は `scripts/train_yolo.py`・`scripts/evaluate_yolo.py`。

## 品質管理（Ver.0.1.1）

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/quality-checks?project_id=&task_id=&asset_id=&photo_id=&status_filter=` | 認証＋案件スコープ・一覧（Project/Site/Asset/Task/Photo/Rule 関連保持、写真サムネURL付） |
| GET | `/quality-checks/{id}` | 詳細 |
| PATCH | `/quality-checks/{id}`（`status?`, `judge?`, `comment?`） | 状態変更/判定/コメント/承認/差戻し/再撮影/保留。**QUALITY_MANAGER / PROJECT_MANAGER のみ** |

## 現場日報（Ver.0.1.1）

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/daily-reports?project_id=` | 一覧（`task_ids`/`photo_ids` 紐付け含む） |
| GET | `/daily-reports/{id}` | 詳細 |
| POST | `/daily-reports` | 新規作成（DRAFT）。PROJECT_MANAGER / FIELD_WORKER |
| PUT | `/daily-reports/{id}` | 編集。PROJECT_MANAGER / FIELD_WORKER |
| POST | `/daily-reports/{id}/copy` | 前日コピー（DRAFTで複製） |
| PUT | `/daily-reports/{id}/links`（`task_ids?`, `photo_ids?`） | 工程/写真紐付け |
| PATCH | `/daily-reports/{id}/status`（DRAFT/SUBMITTED/REVIEWING/RETURNED/APPROVED） | 提出/確認/差戻し/再提出/承認。REVIEWING/RETURNED/APPROVED は ADMIN/PM/QUALITY_MANAGER |
| POST | `/daily-reports/{id}/reflect-progress?dry_run=` | **工程実績へ明示反映（自動反映しない）。`dry_run=true` は確認用プレビュー（対象工程・現在/反映後進捗・変更内容を返し、変更・履歴・監査は行わない）。確定時のみ紐付け工程の実績を更新し `task_change_history` / `audit_logs(REFLECT)` へ記録。PROJECT_MANAGER** |

## 業務基盤（Ver.0.1.2）

| メソッド | パス | 権限 |
| --- | --- | --- |
| GET | `/projects/{id}/tasks?asset_id=` | 設備に紐づく工程に限定（`task_assets`。写真アップロード連動用） |
| GET | `/workers` , `/workers/{id}` | 要員一覧／詳細（所属会社・班・資格[有効期限]・案件/工程配置・稼働状況） |
| GET | `/ledger` | 工事台帳一覧（projects基本＋`project_ledgers`。契約番号/原価/利益率/請求・書類状況、案件スコープ） |
| PUT | `/ledger/{project_id}` | 台帳固有項目の更新。PROJECT_MANAGER（監査記録） |
| GET | `/documents?project_id=` , `/documents/{id}` | 図面一覧／詳細（版履歴 `document_versions`） |
| POST | `/documents`（multipart: `file`, `document_id?`, `project_id?`, `doc_no?`, `name?`, `doc_type?`） | 新規図面 or 新しい版の追加（**古い版は残す**）。PM/FIELD_WORKER |
| PATCH | `/documents/{id}` | 種別/ステータス更新。PM |
| DELETE | `/documents/{id}?reason=` | 論理削除。PM |
| GET | `/notifications` | 通知一覧（自分宛＋全体、協力会社は割当案件外を除外） |
| PATCH | `/notifications/{id}/read?read=` , `POST /notifications/read-all` | 既読／全既読 |
| GET | `/dashboard/summary` | 集計（全案件/進行中/遅延/本日作業/今日完了/写真未確認/品質確認待ち/未提出日報/本日要員、案件スコープ） |

## 実用基盤（Ver.0.1.3）

| メソッド | パス | 権限 |
| --- | --- | --- |
| POST | `/workers/{id}/assign`（project_id, task_id?, assigned_from?, assigned_to?, role?） | 要員を案件/工程へ配置（稼働化・監査）。PM |
| DELETE | `/workers/{id}/assign/{assignment_id}` | 配置解除（他配置無しなら待機化）。PM |
| GET | `/workers/assignment-check/{project_id}` | 工程ごとの予定人数 vs 配置人数 |
| GET | `/materials?project_id=&task_id=` , `POST /materials` , `PUT /materials/{id}` | 資材一覧/登録/更新（マスタ自動作成＋案件/工程紐付け）。登録はPM/FIELD_WORKER |
| GET | `/test-records?project_id=&asset_id=&task_id=&test_type=` , `GET /{id}` | 試験記録一覧/詳細（Asset/Task紐付け・添付URL） |
| POST | `/test-records` | 試験記録登録（測定者=ログインユーザ）。PM/FIELD_WORKER/QUALITY_MANAGER |
| GET | `/documents/{id}` の各版に `file_url`/`mime_type` | 実ファイル閲覧（PDF/PNG/JPEG）。版管理維持 |
| GET | `/reports/types` | 対応帳票・形式の列挙 |
| GET | `/reports/{report_type}?project_id=&format=pdf\|xlsx` | 帳票を生成しダウンロード（施工管理表＝tasksから生成、PDF/Excel、監査） |

## 工程管理の横断表示（Ver.0.3 Phase 2・3）

すべて既存の案件スコープ・権限を通す。集約は1本のJOINで行い、行数に比例した
追加クエリ（N+1）を発行しない。

| メソッド | パス | 説明 |
| --- | --- | --- |
| GET | `/schedule/cross?project_id=&project_ids=&q=&date_from=&date_to=&construction_type_ids=&department_ids=&statuses=&manager_ids=&company_ids=&delayed_only=&unassigned_only=&limit=` | 横断工程表。WBS親子を維持したまま複数案件の工程を返す（`truncated` で打ち切りを明示） |
| GET | `/schedule/cross/options` | 絞り込みの選択肢（同名でもIDで区別できるよう id+name で返す） |
| GET | `/schedule/cross/export?format=xlsx\|pdf` | 画面と同じ条件・並び順で Excel / PDF を生成 |
| GET/POST/PUT/DELETE | `/schedule/saved-searches?screen=` | 保存検索条件（`screen` で画面ごとに使い分け。横断工程=`cross_schedule`、横断マイルストーン=`cross_milestones`） |
| GET | `/schedule/milestones?project_id=&project_ids=&milestone_type_ids=&q=&statuses=&responsible_ids=&company_ids=&related_task_ids=&date_from=&date_to=&actual=&overdue_only=&due_soon_only=&conflict_only=&due_soon_days=&group=&include_candidates=&limit=` | 横断マイルストーン。登録済み（`record_kind='milestone'`）と未設定候補（`record_kind='candidate'`）を別配列で返す |
| GET | `/schedule/milestones/summary` | 一覧と同じ条件での確定計算（登録済み/未設定候補/完了/期限超過/近日予定/遅延完了/関連工程との日程矛盾）。画面はこの値をそのまま表示する |
| GET | `/schedule/milestones/options` | 案件・区分・状態・担当者・担当会社・関連工程の選択肢 |
| GET | `/schedule/milestones/export?format=xlsx\|pdf` | 一覧と同じ `collect()` を使うため、画面と件数・条件・並び順が必ず一致 |
| GET/POST/PUT/DELETE | `/schedule/milestones[/{id}]` | 1件取得・登録・更新・論理削除（監査記録つき） |
| GET | `/schedule/calendar/events?date_from=&date_to=&project_id=&project_ids=&source_kinds=&statuses=&responsible_ids=&company_ids=&q=&limit=` | カレンダーの共通イベント。工程・マイルストーン・品質確認期限・現場日報・試験記録を1つの形へ揃えて返す |
| GET | `/schedule/calendar/options` | カレンダーの絞り込み選択肢（案件・種別・状態・担当者・担当会社） |

- **確定計算**：基準日はサーバー側の JST。完了=実績日あり、期限超過=実績未入力かつ予定日<基準日（当日は含めない）、
  近日予定=残日数が0以上かつ指定日数以内、遅れ日数=完了時 max(実績-予定,0)／未完了時は超過日数。
  「AI予測」ではなく**システム検知（確定計算）**として扱い、DBの `status` とは別の項目で返す。
- **未設定候補**：`active=true` の標準種別と登録済みを**IDで**突き合わせた結果。実在IDや予定日・状態・担当者は持たない。
- **関連工程**：`resolve_related_task()` を登録・更新の両方で使う。存在しない/削除済み/別案件=422、スコープ外=403。
- **入力粒度**：`schedule_precision` は `day`（JST 00:00）と `half_day`（午前=00:00 / 午後=12:00）。AM/PM 専用列は持たない。

### カレンダーの共通イベント（Ver.0.3 Phase 3 P3-5）

`GET /schedule/calendar/events` は**実在する元データだけ**を読み取り、カレンダー用の
共通形式へ変換する。カレンダー専用テーブルは作らず、元データを二重保存しない。

| source_kind | 元データ | 日時の根拠 | record_kind |
|---|---|---|---|
| `task` | `tasks` | `planned_start_at` 〜 `planned_finish_at` ／ `actual_start_at` 〜 `actual_finish_at` | `plan` / `actual` |
| `milestone` | `milestones` | `planned_at` ／ `actual_at` | `plan` / `actual` |
| `quality_check` | `quality_checks` | `due_date`（JST 00:00） | `due` |
| `daily_report` | `daily_reports` | `report_date`（JST 00:00） | `actual` |
| `test_record` | `test_records` | `measured_at` | `actual` |

- **図面の提出期限は扱わない**：`documents` に期限日の列が無いため。推測して表示すると
  架空の期限になる。追加するには列の新設（migration）と運用の決定が必要。
- `event_id` は `種別:区分:元ID`。別テーブルの同じ数値IDを取り違えない。
- 期間は Phase 1 と同じ半開区間。`date_to` は「その日を含む」指定として翌日0:00までを見る。
- `end_at` が null のイベントは開始日だけの単日イベント（終了を推測しない）。
- SQLは種別ごとに1本で、件数に比例して発行数が増えない。`total` / `displayed` / `truncated` を別々に返す。
- 保存検索は既存の `saved_searches` を `screen='schedule_calendar'` で再利用する。

## 監査ログ

写真登録/編集/削除・品質状態変更/承認/差戻し・日報作成/提出/差戻し/承認・工程実績反映・台帳更新・図面登録/更新/削除を、`audit_logs`（user/action/entity_type/entity_id/before/after）へ記録。

## エラー

`{ "detail": "メッセージ" }`。401=未認証、403=権限/スコープ、404=未検出、409=重複、422=バリデーション。
