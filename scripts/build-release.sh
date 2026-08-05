#!/usr/bin/env bash
# 配布用のフロントエンドをビルドする。
#
#   scripts/build-release.sh --api-url https://api.example.com/api [--base /sysken/]
#
# 手でビルドして他ホスト（Xserver 等）へ置く場合、次を毎回やる必要がある。
# 忘れると「どのコードが動いているか分からない」「サブパスで画面が出ない」状態になるため、
# このスクリプトにまとめている。
#
#   1. GIT_COMMIT を渡す（渡さないと画面のSHAが unknown になる）
#   2. VITE_BASE_PATH を配信パスに合わせる
#   3. SPA用の .htaccess を dist/ へ置く
#   4. 成果物が意図どおりか検証する（scripts/check-release.mjs）
#
# 認証情報は扱わない。APIのURLは公開値なので引数で渡す。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT"

BASE="/"
API_URL=""
APP_ENV="production"

while [ $# -gt 0 ]; do
  case "$1" in
    --base) BASE="$2"; shift 2 ;;
    --api-url) API_URL="$2"; shift 2 ;;
    --app-env) APP_ENV="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,18p' "${BASH_SOURCE[0]}"; exit 0 ;;
    *) echo "不明な引数: $1" >&2; exit 2 ;;
  esac
done

if [ -z "$API_URL" ]; then
  echo "--api-url は必須です（例: --api-url https://api.example.com/api）" >&2
  exit 2
fi

# 末尾のスラッシュを揃える（/sysken → /sysken/）。Vite の base は末尾スラッシュが要る。
case "$BASE" in
  */) ;;
  *) BASE="${BASE}/" ;;
esac

COMMIT="$(git rev-parse HEAD 2>/dev/null || echo unknown)"
if [ "$COMMIT" = "unknown" ]; then
  echo "警告: git のコミットSHAを取得できませんでした。画面のSHAが unknown になります。" >&2
fi
if [ -n "$(git status --porcelain 2>/dev/null || true)" ]; then
  echo "警告: コミットしていない変更があります。埋め込むSHA($COMMIT)と中身が一致しません。" >&2
fi

echo "ビルド設定"
echo "  コミット      : $COMMIT"
echo "  配信パス      : $BASE"
echo "  APIのURL      : $API_URL"
echo "  実行環境      : $APP_ENV"

rm -rf dist
GIT_COMMIT="$COMMIT" \
VITE_BASE_PATH="$BASE" \
VITE_API_BASE_URL="$API_URL" \
VITE_APP_ENV="$APP_ENV" \
npm run build

# Apache（Xserver 等）向けの SPA 設定。Render の静的サイトは rewrite を
# render.yaml 側で持つため不要だが、置いてあっても害はない。
sed "s|__BASE_PATH__|$BASE|g" deploy/apache/htaccess.template > dist/.htaccess
echo "dist/.htaccess を書き出しました（RewriteBase $BASE）"

node scripts/check-release.mjs --base "$BASE" --api-url "$API_URL" --commit "$COMMIT"
