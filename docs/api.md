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

## 施工写真

| GET | `/photos?project_id=` | 一覧 |
| POST | `/photos`（multipart: `file`, `project_id`, `task_id?`, `comment?`） | 原本保存＋サムネ派生＋メタ登録 |

## AI（構造のみ・推論未実装）

| POST | `/ai/photos/{photo_id}/analyze?job_type=detection` | ジョブを QUEUED 登録 |
| GET | `/ai/jobs?photo_id=` , `/ai/predictions?photo_id=` | 参照 |

## 日報 / 品質

| GET/POST | `/daily-reports?project_id=` |
| PATCH | `/daily-reports/{id}/status` |（DRAFT/SUBMITTED/REVIEWING/RETURNED/APPROVED）
| GET | `/quality-checks?project_id=` |
| PATCH | `/quality-checks/{id}` |（ステータス変更、承認は QUALITY_MANAGER/PM）

## エラー

`{ "detail": "メッセージ" }`。401=未認証、403=権限/スコープ、404=未検出、409=重複、422=バリデーション。
