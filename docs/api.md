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

| GET/POST | `/sites?project_id=` , `/assets?project_id=` |

## 工程

| GET | `/projects/{id}/tasks` | 一覧（read） |
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
| POST | `/daily-reports/{id}/reflect-progress` | **工程実績へ明示反映（自動反映しない）。紐付け工程の実績を更新し `task_change_history` / `audit_logs` へ記録。PROJECT_MANAGER** |

## 監査ログ

写真登録/編集/削除・品質状態変更/承認/差戻し・日報作成/提出/差戻し/承認・工程実績反映を、`audit_logs`（user/action/entity_type/entity_id/before/after）へ記録。

## エラー

`{ "detail": "メッセージ" }`。401=未認証、403=権限/スコープ、404=未検出、409=重複、422=バリデーション。
