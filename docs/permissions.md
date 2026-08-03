# 認証・権限

## ロール

| ロール | 説明 | 主な権限 |
| --- | --- | --- |
| ADMIN | システム管理者 | 全操作 |
| PROJECT_MANAGER | 案件管理者 | 案件・現場・設備・工程・日報の作成/更新、削除（論理） |
| FIELD_WORKER | 現場担当者 | 日報作成、写真アップロード、割当案件の閲覧 |
| QUALITY_MANAGER | 品質管理者 | 品質チェックの更新・承認 |
| VIEWER | 閲覧者 | 参照のみ |

ADMIN はロールチェックを常に通過する。

## 案件スコープ（協力会社対応）

- 内部ロール（ADMIN / PROJECT_MANAGER / QUALITY_MANAGER / VIEWER）は全案件にアクセス可能。
- FIELD_WORKER（協力会社ユーザーを含む）は `project_members` に登録された案件のみアクセス可能。
- スコープは **API側で強制**する（`ensure_project_access` / `accessible_project_ids`）。画面を非表示にするだけの制御は行わない。

## 実装

- 認証: `app/core/deps.py::get_current_user`（JWTを検証しユーザーを解決）
- ロール: `require_roles("PROJECT_MANAGER", ...)`（ADMINは常に許可）
- スコープ: `ensure_project_access(db, user, project_id)` → 404/403 を返す

## 検証例

```
partner@example.co.jp（協力会社, p1のみ割当）
  GET /projects        → p1 のみ
  GET /projects/2      → 403
  POST /projects       → 403
yamada@example.co.jp（PROJECT_MANAGER）
  POST /projects       → 201（audit_logs に CREATE 記録）
```

## 案件ライフサイクル（Ver.0.4）

| 操作 | ADMIN | PROJECT_MANAGER | QUALITY_MANAGER | VIEWER | FIELD_WORKER |
| --- | --- | --- | --- | --- | --- |
| `GET /projects/search` | 全件 | 全件 | 全件 | 全件 | 割当案件のみ |
| `GET /projects/filter-options` | 全件から生成 | 全件 | 全件 | 全件 | 割当案件から生成 |
| `GET /projects/{id}` | ○ | ○ | ○ | ○ | 割当案件のみ（他は403） |
| `POST /projects` | ○ | ○ | 403 | 403 | 403 |
| `PUT /projects/{id}` | ○ | ○（スコープ内） | 403 | 403 | 403 |

- `total` は権限・案件スコープを適用したあとに数える。権限で見えない案件は件数にも含めない。
- 割当が1件も無い協力会社ユーザーは、403 ではなく **0件の 200** を返す（権限なしと区別する）。
- 画面は操作できない権限に入口を出さないが、拒否の最終判断はAPI側が行う。

## 監査

すべての作成/更新/削除は `audit_logs`（user_id / action / entity_type / entity_id / project_id / before / after）に記録する。
