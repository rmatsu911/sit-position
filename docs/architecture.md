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
