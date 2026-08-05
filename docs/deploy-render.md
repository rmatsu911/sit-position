# 本番公開手順（Render）

> **手順の入口は [`docs/deploy-checklist.md`](./deploy-checklist.md)。**
> 反映前に通すゲート、初期投入の方針（`--bootstrap`）、Xserver での配置、
> 反映後の画面確認、中止条件をまとめてある。この文書は Render 固有の設定を扱う。


React(静的) + FastAPI(Docker) + PostgreSQL を Render に公開する手順。
アプリのコードは変更せず、`render.yaml`（Blueprint）と環境変数だけで動く。

前提: GitHub リポジトリ `rmatsu911/sit-position`、ブランチ **`main`**。
Render の無料アカウント（https://render.com/）。

> Ver.0.3 Phase 3 までの作業ブランチ `claude/session-rkd93u` は `main` へマージ済み
> （PR #1）。以降のリリースは `main` を参照する。`render.yaml` には `branch:` を
> 書いていないため、**どのブランチを追うかは Render 管理画面の各サービス設定
> （Settings → Build & Deploy → Branch）で決まる**。作業ブランチのまま作成した
> 環境は、管理画面で `main` に変更する必要がある（コードの変更では切り替わらない）。

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

- **初期データ**: 起動時に `seed --bootstrap` が走り、**初期管理者と区分マスタだけ**を
  作る。案件・工程・施工写真・現場日報などの業務データは作らない。
  何度再デプロイしても同じ結果になる（既にあるものは作り直さない）。
  デモ環境として架空の案件を入れたい場合だけ `--bootstrap` を `--force-production`
  へ変える（全員が同じ既知パスワードの利用者10名も作られるため、公開環境では使わない）。
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

## リリース時に確認すること

| 確認項目 | 確認方法 |
|---|---|
| 参照ブランチ | Render 管理画面 → 各サービス → Settings → Build & Deploy → Branch が `main` |
| 実環境のリビジョン | 各サービスの Events / Deploys 画面で、最新デプロイのコミットSHA |
| migration の適用 | backend の起動ログに `alembic upgrade head` が成功して出ているか。現在の head は `e7c4b2f10a93` |
| API とフロントのリビジョン一致 | backend と frontend の最新デプロイが同じコミットSHAか |
| 疎通 | `<backend>/health` が `{"status":"ok",...}`、frontend のログイン後に主要画面が開く |

これらは Render 管理画面（またはインターネット経由の実環境）にアクセスできる環境で
確認する。アクセスできない環境からは **確認不可**であり、推測でデプロイ完了と判断しない。

## サブパス配信（例: https://example.com/sysken/）

ルート直下ではなくサブパスへ置く場合、**ビルド時に** `VITE_BASE_PATH` を指定する。
指定しないと JS/CSS が `/assets/...` を指し、ルーティングも `/login` を期待するため、
`/sysken/login` を開いても画面が出ない。

```bash
VITE_BASE_PATH=/sysken/ \
VITE_API_BASE_URL="https://<バックエンド>/api" \
VITE_APP_ENV=production \
npm ci && npm run build
```

- `dist/index.html` の参照が `/sysken/assets/...` になっていることを確認する。
- react-router の basename も同じ値になるため、`/sysken/login` で同じ画面が開く。
- Apache の場合は `dist/` を `public_html/sysken/` へ置き、同ディレクトリに
  SPA用の `.htaccess`（全パスを `index.html` へ）を置く。
- 画像・帳票のURLはAPIが絶対URLで返すため、バックエンドの `PUBLIC_BASE_URL` を
  実際のAPIホストに合わせる（フロントのベースパスとは独立）。

## 稼働中のコード世代の確認

3つのエンドポイントは目的が違う。用途に合わないものを使うと、
「動いていない」ことに気づけないので使い分ける。

| エンドポイント | 認証 | 用途 | 返すもの |
| --- | --- | --- | --- |
| `GET /health` | 不要 | ロードバランサ・外形監視の死活確認 | `status` / `version` / `environment` / `backend_commit` / `backend_built_at` |
| `GET /api/system/ping` | 全ロール | ログイン済み画面から「APIが自分と同じ世代か」を確かめる | `environment` / `api_version` / `backend_commit` |
| `GET /api/system/info` | ADMIN のみ | 障害の切り分け | 上記＋`alembic_revision` / `database` / `storage` / `api_root_path` / `ai`（内訳） |

`/health` は **DBを見ない**。DBが落ちていても 200 を返すので、疎通確認だけに使う。
DB・ファイル保存・migration の状態を見たいときは `/api/system/info`。

### AIの状態は1語にまとめない

`system/info` の `ai` は次を**別々に**返す。まとめると障害の切り分けができない。

| 項目 | 意味 |
| --- | --- |
| `registered_models` | `ai_models` に登録されているモデル数（未学習を含む） |
| `trained_models` | そのうち学習済み（`trained_at` あり・ACTIVE/READY）の数 |
| `pending_jobs` | 処理待ち・処理中の推論ジョブ数 |
| `last_successful_job_at` | 最後に成功した推論ジョブの完了時刻。1件も無ければ `null` |
| `worker` | `processing`（処理中）/ `not_running`（15分以上滞留＝Workerが動いていない）/ `idle`（待ちジョブが無く稼働は未確認）/ `unknown` |

`idle` を「稼働中」とは書かない。待ちジョブが無い状態は、Worker が起動していなくても
同じ見え方になるため。

機能ごとの状態は `GET /api/ai/status`（全ロール）が返す。
`not_implemented` / `model_missing` / `service_down` / `failed` / `processing` / `connected`
の6状態で、画面（右側の「AI機能」パネル）はこの値だけを表示する。

### SHA とベースパス

- 画面では「設定 ＞ システム情報」。フロントとバックエンドのSHAが違うときは警告が出る。
- フロントのSHAはビルド時に埋め込む。CI/Render では `GIT_COMMIT`（または
  `RENDER_GIT_COMMIT`）を渡す。バックエンドも同じ環境変数を読む。
- **Xserver など、CIを通さず手元でビルドして配置する場合**は、ビルド時に
  `GIT_COMMIT=$(git rev-parse HEAD)` を明示的に渡す。渡さないと `unknown` になり、
  「どのコードが動いているか」を画面から確認できない。

  ```bash
  GIT_COMMIT=$(git rev-parse HEAD) VITE_BASE_PATH=/sysken/ npm run build
  ```

- サブパス配信では、画面の `VITE_BASE_PATH` と API の `API_ROOT_PATH` を
  配信構成に合わせる。両方の値は「設定 ＞ システム情報」に出るので、
  実環境で食い違っていないか目視で確認できる。

  | 配信構成 | `VITE_BASE_PATH` | `API_ROOT_PATH` |
  | --- | --- | --- |
  | `https://example.com/` ＋ API が別ホスト | `/`（既定） | 空（既定） |
  | `https://example.com/sysken/` ＋ API が `/sysken/api` | `/sysken/` | `/sysken/api` |
