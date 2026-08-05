# 株式会社SYSKEN AI施工管理システム

通信工事の施工管理を工事単位で一元管理し、蓄積データを将来AI（画像認識・分類・品質判定・工期予測）へ接続する施工管理システム。**React/TypeScript/Vite のフロントエンド**と **FastAPI/PostgreSQL のバックエンド**で構成する。

現在は **Ver.0.1（実用システム基盤）**。発表用デモの画面・デザインを維持したまま、固定ダミーデータ → PostgreSQL（Seed）→ API へ段階的に移行している。

> **開発者向け**：仕様の正は [`docs/MASTER_SPEC.md`](docs/MASTER_SPEC.md)、現在状態・開発ルール・次回作業は [`docs/PROGRESS.md`](docs/PROGRESS.md)。次回セッションは過去チャットではなく docs を参照して続きから作業する。

- 詳細設計: [`docs/architecture.md`](docs/architecture.md) / [`docs/database.md`](docs/database.md) / [`docs/api.md`](docs/api.md) / [`docs/permissions.md`](docs/permissions.md) / [`docs/ai-design.md`](docs/ai-design.md) / [`docs/deployment.md`](docs/deployment.md)

## 技術構成

| 層 | 技術 |
| --- | --- |
| Frontend | React 18 / TypeScript / Vite 6 / Tailwind CSS / React Router 7 / TanStack Query 5 |
| Backend | Python 3.11 / FastAPI / SQLAlchemy 2.0 / Alembic / Pydantic v2 |
| DB | PostgreSQL 16 |
| Storage | ローカルFS（開発） / S3・MinIO（本番） |
| Auth | JWT（Bearer）/ ロール5種＋案件スコープ |

## クイックスタート（Docker Compose）

```bash
cp .env.example .env
cp backend/.env.example backend/.env
docker compose up -d --build
docker compose exec backend alembic upgrade head     # DBマイグレーション
docker compose exec backend python -m app.seed.seed  # 初期データ（既存ダミー相当）
```

- フロント: http://localhost:5173 　バックエンドAPI: http://localhost:8000/docs
- ログイン: `admin@example.co.jp` / `Passw0rd!`（他 `yamada@` PM、`partner@` 協力会社。パスワード共通）

## クイックスタート（Dockerなし）

### 1) PostgreSQL
16系にDB `sysken`・ロール `sysken`（パスワード `sysken`）を作成。

### 2) Backend
```bash
cd backend
python -m venv .venv
source .venv/bin/activate            # Windows: .venv\Scripts\activate
pip install "fastapi[all]" "sqlalchemy>=2" alembic psycopg2-binary "pydantic[email]" \
            pydantic-settings "python-jose[cryptography]" bcrypt python-multipart pillow boto3
cp .env.example .env                 # DATABASE_URL を環境に合わせる
alembic upgrade head                 # マイグレーション
python -m app.seed.seed              # 初期データ投入（--reset で再投入）
uvicorn app.main:app --reload        # http://localhost:8000
```

### 3) Frontend（別ターミナル・リポジトリのルート）
```bash
cp .env.example .env                 # VITE_API_BASE_URL=http://localhost:8000/api
npm install
npm run dev                          # http://localhost:5173
```

ブラウザで http://localhost:5173 → ログイン画面 → 上記アカウントでログイン。

## Ver.0.1 でAPI連携済みの画面

- **ログイン / ログアウト**（JWT、ロール表示、案件スコープ）
- **案件一覧**（検索・絞り込み・新規登録・ページング／DBから取得）
- **案件詳細**（基本情報タブをAPIから表示）
- **工程管理**（ガントの工程データをAPIから読み込み）

その他の画面（施工写真・品質・日報・要員・帳票 等）は既存のダミー表示を維持し、同じフックパターンで順次API化する。

## AIについて

`ai_models` / `ai_analysis_jobs` / `ai_predictions` / `ai_feedback` のDB・API・接続準備までを実装。**この段階では実推論（YOLO/ViT/OCR/LLM）は未実装**で、`analyze` はジョブを QUEUED 登録するのみ。設計は [`docs/ai-design.md`](docs/ai-design.md)。

## テスト

```bash
cd backend
pip install pytest httpx
pytest            # 認証・案件・権限スコープのAPIテスト
```

## 開発環境の前提

| 対象 | バージョン | 備考 |
|---|---|---|
| Node.js | **20.19 以上**（`package.json` の `engines` と `.nvmrc` で固定） | `playwright` が Node 20 以上を要求するため |
| npm | Node.js 同梱版 | |
| Python | **3.11 以上** | `backend/pyproject.toml` の `requires-python` |
| PostgreSQL | 16 | 開発は docker-compose でも可 |

```bash
node -v          # v20.19 以上であること
npm ci           # 依存を lockfile どおりに導入
```

### ブラウザ回帰（Playwright）

実ブラウザ回帰スクリプト（`scripts/*.mjs`）は Playwright を使う。**ブラウザ本体は
別途インストールが必要**で、既定の場所へ入れる場合は次を実行する。

```bash
npx playwright install chromium          # ブラウザ本体を導入
node scripts/phase4-verify.mjs           # backend(:8000) と vite preview(:4173) を起動しておく
```

すでに別の場所へ Chromium がある環境（CI イメージ等）では、パスを渡して実行する。

```bash
PW_CHROME=/path/to/chromium node scripts/phase4-verify.mjs
```

これらの回帰は DB とブラウザを必要とするため CI では自動実行せず、**手動実行**する。
CI で自動実行するのは pytest / typecheck / ESLint / build / timeline テスト。
