# アーキテクチャ

## 全体像

```
┌────────────┐    HTTPS/JSON     ┌───────────────┐    SQL     ┌────────────┐
│  Frontend   │  ───────────────▶ │   Backend      │ ─────────▶ │ PostgreSQL │
│ React+Vite  │  ◀─────────────── │  FastAPI       │            └────────────┘
│ TanStack Q. │     JWT (Bearer)  │  SQLAlchemy    │  ┌────────┐
└────────────┘                    │  Alembic       │ ─┤ Storage│ (local / S3・MinIO)
                                   └───────┬────────┘  └────────┘
                                           │ enqueue (ai_analysis_jobs)
                                           ▼
                                   ┌───────────────┐   ※Ver.0.1では未稼働
                                   │  AI Worker     │   YOLO / ViT / OCR / RAG・LLM
                                   │ (将来・分離可能) │   → ai_predictions を書き込む
                                   └───────────────┘
```

## 方針

- **施工管理システム本体は AI へ依存しない。** AIサービスが停止していても、案件・工程・写真・品質・日報・要員・資材・試験・帳票は利用できる。
- AIは **ジョブ方式**（`ai_analysis_jobs`）で分離。Worker が結果を `ai_predictions` に書き込む。人間確定結果（`quality_checks.human_result` / `photos.confirmed_*`）とは必ず分離する。
- データは **Project → Site → Asset** の3階層を中心に、`project_id` / `site_id` / `asset_id` / `task_id` へ関連付ける。
- マスタは ID / 表示名を分離（将来AIも同じマスタIDを返せる）。

## 技術スタック

| 層 | 技術 |
| --- | --- |
| Frontend | React 18 / TypeScript / Vite 6 / Tailwind CSS / React Router 7 / TanStack Query 5 |
| Backend | Python 3.11 / FastAPI / SQLAlchemy 2.0 / Alembic / Pydantic v2 |
| DB | PostgreSQL 16 |
| Storage | ローカルFS（開発） / S3互換・MinIO（本番） |
| Auth | JWT（Bearer）、bcrypt |

## ディレクトリ

```
/                      … フロントエンド（既存Viteアプリを維持）
  src/api/             … APIクライアント＋TanStack Queryフック
  src/auth/            … 認証（Context / Login / PrivateRoute）
  src/data/            … 既存ダミーデータ（未移行画面のフォールバック）
/backend/              … FastAPI
  app/core/            … config / db / security / deps / audit
  app/models.py        … SQLAlchemyモデル
  app/schemas.py       … Pydanticスキーマ
  app/api/             … ルーター（auth/projects/sites/assets/tasks/...）
  app/services/        … storage 等
  app/seed/            … 初期データ投入
  alembic/             … マイグレーション
/docs/                 … 本ドキュメント群
docker-compose.yml     … frontend/backend/postgres/minio
```

## 段階的移行（デモ → 実運用）

固定ダミーデータ → **Seed（PostgreSQL）** → **API** の順で、UIを壊さず1画面ずつ移行する。
Ver.0.1では 認証・案件一覧/詳細・工程(読) をAPI化。他画面は既存ダミー表示を維持し、同じフックパターン（`useProjects` 等）で順次移行する。

## 案件一覧の検索条件（Ver.0.4）

検索条件の正は **URL** で、画面側の状態ではない。URLとAPIパラメータと React Query の
`queryKey` を1対1で対応させ、画面が独自に絞り込み・並び替え・件数集計をしない。

| URLクエリ | APIパラメータ | 例 |
| --- | --- | --- |
| `q` | `q` | `?q=KM-2026` |
| `statuses` | `statuses` | `?statuses=施工中,遅延` |
| `managers` | `manager_ids` | `?managers=3,5` |
| `companies` | `company_ids` | `?companies=2`（工程の担当会社） |
| `areas` | `areas` | `?areas=熊本市中央区` |
| `depts` | `department_ids` | `?depts=1` |
| `delayed` | `delayed_only` | `?delayed=1` |
| `from` | `date_from` | `?from=2026-06-01` |
| `to` | `date_to` | `?to=2026-08-31` |
| `page` | `page` | 既定1のときはURLに出さない |
| `per_page` | `per_page` | 既定20のときはURLに出さない |
| `sort` | `sort` | 既定 `recent` のときはURLに出さない |
| `new` | （APIには渡さない） | 登録直後の案件を強調するための一時的な印 |

- `queryKey` は `['projects', 'search', <組み立て済みクエリ文字列>]`。全条件・`page`・
  `per_page`・`sort` が含まれるため、条件が変われば必ず取り直す。
- 登録・更新の後は `['projects']` を prefix で invalidate し、表示中のクエリを再取得する。
- 登録すると `page` を1へ戻し、`sort` を既定へ戻したうえで `new=<id>` を付ける。
  それでも条件で隠れる場合は「登録済みだが現在の条件では表示されていない」と案内し、
  「条件を解除して表示」で条件だけを外す（登録した案件の印は保つ）。
- 戻る／進むはURLの復元だけで動く（画面側に検索状態を二重に持たない）。

## 案件の選択（固定案件参照の撤去・Ver.0.4）

案件を指定して使う画面は、共通の `src/components/ui/ProjectSelect.tsx` を使う。

- 選択状態はURLの `?project_id=` が正。再読込・URL共有・戻る進むで同じ案件が開く。
- 既定では**何も選ばない**（先頭の案件を勝手に選ばない）。未選択のときは
  `NoProjectSelected` の空状態を出し、架空のデータを表示しない。
- 撤去した固定参照: 施工写真（`DEMO_PROJECT_ID = 1`・詳細の固定案件名）、品質管理
  （`q.projectId === 'p1' ? '熊本中央局' : …` の固定判定）、現場日報、試験記録、
  報告書（固定の工事名・作成日・作成者・固定の工程行・プレビューの固定工事名）、
  案件詳細の「概要」「作業内容」タブ（固定文言）、`/schedule` の先頭案件の自動選択。
  報告書の下書きは選択した案件の工程（`tasks`）から作る。
- **案件を切り替えたときの状態の捨て方**: 案件に紐づく画面の状態（編集中の日報、
  ローカルに持つ写真、選択・ライトボックス・入力中のフォーム）は、`useEffect` ではなく
  **レンダリング前**に初期化する。`useEffect` だと1回だけ前の案件が描画されるため。
  取得前（読み込み中）と未選択のときも、前の案件のデータは描画しない。
- 登録先の案件を `?? 0` や `as number` で補わない。写真アップロード・試験記録は
  実行前に案件を検証し、APIも存在しない案件・スコープ外を 404 / 403 で拒否する。
- 監査は `node scripts/fixed-project-audit.mjs`（既定の案件ID・案件IDでの分岐・
  既定値での補完・画面へ直接書いた実在案件名を検出。残存0件を維持する）。

## 案件操作の権限（Ver.0.4）

| 操作 | ADMIN | PROJECT_MANAGER | QUALITY_MANAGER | VIEWER | FIELD_WORKER |
| --- | --- | --- | --- | --- | --- |
| 案件一覧・検索 | 全件 | 全件 | 全件 | 全件 | 割当案件のみ |
| 案件詳細 | ○ | ○ | ○ | ○ | 割当案件のみ（他は403） |
| 新規登録 | ○ | ○ | 403 | 403 | 403 |
| 基本情報の更新 | ○ | ○（案件スコープ内） | 403 | 403 | 403 |
| 論理削除 | ○ | ○（案件スコープ内） | 403 | 403 | 403 |

画面側は操作できない権限に入口（「新規案件登録」「基本情報を編集」）を出さないが、
**拒否の最終判断はAPI**で行う。0件（200 + `total: 0`）と権限なし（403）は区別して表示する。
