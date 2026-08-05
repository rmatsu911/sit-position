# 公開環境へ反映するときの手順

「反映できる状態」かどうかを、思い込みではなく**確認できる形**で判定するための手順。
Render・Xserver のどちらでも共通の考え方で、違うのは配置方法だけ。

秘密情報（パスワード・接続文字列・鍵・トークン）は、この手順のどこでも
リポジトリ・チャット・ログ・スクリーンショットへ書かない。

---

## 0. 反映前に必ず通すもの

```bash
scripts/dev-stack.sh start                 # PostgreSQL → migration → backend → preview
PW_CHROME=<chromium> npm run verify:all    # 全ゲート
```

`skipped` が1件でもあれば、それは**成功ではない**。起動して実行し直す。

このうち、公開環境の事故に直接つながるものは次の3つ。

| ゲート | 何を防ぐか |
| --- | --- |
| `node scripts/deploy-config-audit.mjs` | 公開環境へ架空の案件・既知パスワードの利用者を作る設定へ戻っていないか |
| `scripts/check-bootstrap.sh` | 本番の初期投入が業務データを作らないこと（実際のDBで件数を数える） |
| `node scripts/check-release.mjs` | 配布用ビルドがそのまま置いて動くか（資産パス・SHA・API URL・SPA設定） |

---

## 1. 初期投入の方針（重要）

公開環境の初期投入は **`python -m app.seed.seed --bootstrap`** を使う。

| モード | 作るもの | 用途 |
| --- | --- | --- |
| `--bootstrap` | 初期管理者1名 ＋ 区分マスタ（工種・工程種別など） | **公開環境**。何度実行しても同じ結果 |
| `--force-production` | 架空の案件8件・工程・写真・日報 ＋ **全員が同じ既知パスワードの利用者10名** | デモ環境専用。公開環境では使わない |

`--bootstrap` は案件・工程・施工写真・現場日報・要員・資材・試験記録・通知・
会社・部署を**一切作らない**。それらは利用者が登録する。

> 区分マスタが空だと工程フォームの選択肢が出ないが、画面は「マスタが登録されて
> いません」と正直に表示する（仮の選択肢は作らない）。`--bootstrap` はこの
> マスタまでを入れるので、登録直後から工程を登録できる。

---

## 2. Render（Blueprint）

`render.yaml` がそのまま使える。管理画面で設定するのは次の3つだけ。

| サービス | キー | 値 |
| --- | --- | --- |
| sysken-backend | `SEED_ADMIN_PASSWORD` | 十分に長いランダム値（**どこにも書き残さない**） |
| sysken-backend | `PUBLIC_BASE_URL` | backend の URL |
| sysken-backend | `CORS_ORIGINS` | frontend の URL |
| sysken-frontend | `VITE_API_BASE_URL` | backend の URL + `/api` |

- `DATABASE_URL` / `JWT_SECRET` は自動。`JWT_SECRET` は自動生成なので固定値を書かない。
- コミットSHAは Render の `RENDER_GIT_COMMIT` を frontend / backend の両方が読む。
  追加設定は不要。
- 起動時に `alembic upgrade head` → `seed --bootstrap` → `uvicorn` が走る。
- **参照ブランチはコードでは決まらない**。管理画面の
  Settings → Build & Deploy → Branch で指定する。

---

## 3. Xserver（Apache・手元でビルドして配置）

### 3-1. フロントエンド

```bash
scripts/build-release.sh \
  --base /sysken/ \
  --api-url https://<APIのホスト>/api
```

このスクリプトが次をまとめてやる。手でビルドすると毎回どれかを忘れる。

1. `GIT_COMMIT` を埋め込む（忘れると画面のSHAが `unknown` になり、稼働中のコードを確認できない）
2. `VITE_BASE_PATH` を配信パスに合わせる（忘れるとサブパスで白画面になる）
3. SPA用の `.htaccess` を `dist/` へ置く（忘れると直リンクが404になる）
4. `scripts/check-release.mjs` で成果物を検証する

`dist/` の中身を `public_html/sysken/` へそのまま置く（`.htaccess` を含む）。

### 3-2. バックエンド

```bash
export APP_ENV=production
export DATABASE_URL='postgresql+psycopg2://<user>:<pass>@<host>:5432/<db>'
export JWT_SECRET='<十分に長いランダム値>'
export SEED_ADMIN_PASSWORD='<初回だけ必要>'
export CORS_ORIGINS='https://<フロントのホスト>'
export PUBLIC_BASE_URL='https://<APIのホスト>'
export GIT_COMMIT="$(git rev-parse HEAD)"
# サブパスでAPIを出す場合のみ（例: https://example.com/sysken/api）
# export API_ROOT_PATH=/sysken/api

python -m alembic upgrade head
python -m app.seed.seed --bootstrap
uvicorn app.main:app --host 0.0.0.0 --port 8000
```

`API_ROOT_PATH` と画面の `VITE_BASE_PATH` は配信構成に合わせる。

| 配信構成 | `VITE_BASE_PATH` | `API_ROOT_PATH` |
| --- | --- | --- |
| フロント直下 ＋ API が別ホスト | `/`（既定） | 空（既定） |
| `https://example.com/sysken/` ＋ API が `/sysken/api` | `/sysken/` | `/sysken/api` |

---

## 4. 反映後の確認（画面から）

「設定 ＞ システム情報」を開き、次を突き合わせる。**推測で完了と判断しない。**

| 見るもの | 期待 |
| --- | --- |
| フロントエンドのコミット | 反映したコミットSHA（`unknown` でない） |
| バックエンドのコミット | 同上。**フロントと一致**（違うと赤い警告が出る） |
| migration | `e7c4b2f10a93`（Ver.0.5 時点の head） |
| データベース | 接続確認済み |
| ファイル保存 | 接続確認済み |
| APIの公開パス / 画面のベースパス | 配信構成と一致 |
| AI Worker | `待ちジョブなし（稼働は未確認）`。Worker を動かしていない構成ではこれが正しい |

あわせて次も確認する。

- ログイン → ダッシュボードが開く
- **案件一覧が0件で、「案件が登録されていません」と出る**
  （架空の案件が並んでいたら `--force-production` で初期投入されている。作り直す）
- 案件を1件登録 → 工程を1件登録 → 工程管理でガントに出る
- 帳票（施工管理表）の PDF / Excel / CSV が、画面と同じ行数で出る

`/health` は **DBを見ない**ので、疎通確認だけに使う。DB・migration の状態は
`/api/system/info`（ADMIN のみ）で見る。

---

## 5. 反映を中止する条件

次のどれかに当てはまるなら、反映しない。

- `npm run verify:all` に `failed` または `skipped` がある
- 公開環境に既に架空の案件（`KM-2026-xxx` など）が入っている
  → `--force-production` で投入されている。DBを作り直してから `--bootstrap`
- 画面のコミットSHAが `unknown`、またはフロントとバックエンドで食い違う
- migration の head がリポジトリと違う
