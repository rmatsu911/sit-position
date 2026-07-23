# デプロイ / 環境構築

## ローカル（Docker Compose 推奨）

```bash
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec backend alembic upgrade head
docker compose exec backend python -m app.seed.seed
# frontend: http://localhost:5173  backend: http://localhost:8000/docs
```

構成: frontend / backend / postgres / minio。AI Worker は将来 `services` に追加（施工管理APIとは分離）。

## ローカル（Docker を使わない場合）

### PostgreSQL
16系を用意し、DB `sysken` とロール `sysken` を作成。

### Backend
```bash
cd backend
python -m venv .venv && source .venv/bin/activate   # Windows: .venv\Scripts\activate
pip install -e ".[dev]"          # または pyproject の依存を pip install
cp .env.example .env             # DATABASE_URL を環境に合わせる
alembic upgrade head             # マイグレーション
python -m app.seed.seed          # 初期データ（既存ダミー相当）
uvicorn app.main:app --reload    # http://localhost:8000
```

### Frontend
```bash
cp .env.example .env             # VITE_API_BASE_URL=http://localhost:8000/api
npm install
npm run dev                      # http://localhost:5173
```

## 本番の考え方

- Frontend: `npm run build` の `dist/` を静的ホスティング（CDN等）。
- Backend: uvicorn/gunicorn をコンテナで実行、PostgreSQLはマネージド、ストレージはS3。
- `JWT_SECRET` は十分に長いランダム値。秘密情報は環境変数（`.env` はコミットしない）。
- CORS は本番フロントのオリジンのみ許可。
- ストレージは `STORAGE_BACKEND=s3`、`S3_*` を設定。

## 環境変数

- Frontend: `VITE_API_BASE_URL`
- Backend: `DATABASE_URL` `JWT_SECRET` `ACCESS_TOKEN_EXPIRE_MINUTES` `CORS_ORIGINS` `STORAGE_BACKEND` `LOCAL_STORAGE_DIR` `PUBLIC_BASE_URL` `S3_*` `SEED_ADMIN_*`（詳細は `backend/.env.example`）
