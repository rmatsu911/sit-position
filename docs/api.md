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

## AI（構造のみ・推論未実装）

| POST | `/ai/photos/{photo_id}/analyze?job_type=detection` | ジョブを QUEUED 登録 |
| GET | `/ai/jobs?photo_id=` , `/ai/predictions?photo_id=` | 参照 |

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

## 監査ログ

写真登録/編集/削除・品質状態変更/承認/差戻し・日報作成/提出/差戻し/承認・工程実績反映・台帳更新・図面登録/更新/削除を、`audit_logs`（user/action/entity_type/entity_id/before/after）へ記録。

## エラー

`{ "detail": "メッセージ" }`。401=未認証、403=権限/スコープ、404=未検出、409=重複、422=バリデーション。
