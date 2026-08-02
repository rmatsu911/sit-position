# 本番公開手順（Render）

React(静的) + FastAPI(Docker) + PostgreSQL を Render に公開する手順。
アプリのコードは変更せず、`render.yaml`（Blueprint）と環境変数だけで動く。

前提: GitHub リポジトリ `rmatsu911/sit-position`、ブランチ `claude/session-rkd93u`。
Render の無料アカウント（https://render.com/）。

## 1. Blueprint で作成

1. Render ダッシュボード → **New +** → **Blueprint**
2. リポジトリ `rmatsu911/sit-position` を接続し、ブランチ `claude/session-rkd93u` を選択
3. `render.yaml` が読み込まれ、次の3リソースが作成される:
   - `sysken-db`（PostgreSQL・無料）
   - `sysken-backend`（FastAPI・Docker・無料）
   - `sysken-frontend`（静的サイト・無料）
4. **Apply** で作成開始。最初は下記の未設定の環境変数（`sync:false`）があるため、
   一旦それらを埋めてからデプロイを完了させる。

## 2. 環境変数を設定（初回のみ）

サービスの URL は作成時に確定する（例）:
- backend: `https://sysken-backend.onrender.com`
- frontend: `https://sysken-frontend.onrender.com`
（実際に払い出された URL を各サービスの画面で確認して使う）

### sysken-backend の環境変数
| キー | 値 |
|---|---|
| `SEED_ADMIN_PASSWORD` | 任意の安全なパスワード（**チャット等に貼らない**） |
| `PUBLIC_BASE_URL` | backend の URL（例 `https://sysken-backend.onrender.com`） |
| `CORS_ORIGINS` | frontend の URL（例 `https://sysken-frontend.onrender.com`） |

（`DATABASE_URL` と `JWT_SECRET` は自動設定される）

### sysken-frontend の環境変数
| キー | 値 |
|---|---|
| `VITE_API_BASE_URL` | backend の URL + `/api`（例 `https://sysken-backend.onrender.com/api`） |

設定後、両サービスを **Manual Deploy → Deploy latest commit** で再デプロイする
（frontend は API URL をビルド時に埋め込むため、設定変更後の再ビルドが必須）。

## 3. 動作確認

- backend: `https://sysken-backend.onrender.com/health` → `{"status":"ok","version":"1.0.0"}`
- frontend: `https://sysken-frontend.onrender.com/` を開く
  - ログイン: `admin@example.co.jp` / 手順2で設定した `SEED_ADMIN_PASSWORD`
  - フッターが `v1.0.0`、ヘッダーに「デモガイド」なし、工程管理のガントが正常表示

## 注意・制限

- **初期データ**: 起動時に初期管理者と表示用の初期データ（Seed）を投入する。
  実運用でクリーンな状態から始めたい場合は、`render.yaml` の `dockerCommand` から
  `python -m app.seed.seed --force-production &&` を外して再デプロイする
  （その場合、管理者ユーザーは別途作成が必要）。
- **アップロードファイル**: `STORAGE_BACKEND=local` はコンテナのローカルディスクに保存するため、
  無料プランの再デプロイで消える。写真・図面を永続化するなら Render の Persistent Disk（有料）か
  S3/MinIO（`STORAGE_BACKEND=s3` と `S3_*` を設定）に切り替える。
- **無料プランのスリープ**: 無料の Web サービスは無操作でスリープし、初回アクセスに数十秒かかる。
- 無料 PostgreSQL には有効期限がある場合がある（Render の最新条件を確認）。

## 他ホストでも可

- `backend/Dockerfile` は `$PORT` 対応・全依存導入済みなので、Railway / Fly.io / Cloud Run でも
  そのまま使える（マネージド PostgreSQL を用意し `DATABASE_URL` を渡す）。
- Docker が使える1台のサーバ/VPS なら、リポジトリの `docker-compose.yml` で
  postgres/backend/frontend を一括起動できる。
