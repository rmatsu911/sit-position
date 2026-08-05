#!/usr/bin/env bash
# 回帰スクリプト（scripts/*-verify.mjs）を動かすための開発スタックを起動する。
#
#   scripts/dev-stack.sh start   # PostgreSQL → backend(:8000) → preview(:4173)
#   scripts/dev-stack.sh stop
#   scripts/dev-stack.sh status
#
# 認証情報はこのファイルに書かない。backend/.env と .env を読む。
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
RUN_DIR="${TMPDIR:-/tmp}/sysken-dev-stack"
BACKEND_LOG="$RUN_DIR/backend.log"
PREVIEW_LOG="$RUN_DIR/preview.log"

# ブラウザ回帰は preview(:4173) から API を叩くため、その origin を許可する。
# 開発用の値のみ。実環境の CORS_ORIGINS は backend/.env / 各ホストの設定で決める。
DEV_CORS="http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173"

mkdir -p "$RUN_DIR"

wait_for() { # wait_for <url> <label>
  for _ in $(seq 1 40); do
    if curl -fsS -o /dev/null "$1"; then echo "  $2 ready"; return 0; fi
    sleep 1
  done
  echo "  $2 did not come up. see logs under $RUN_DIR" >&2
  return 1
}

start() {
  echo "PostgreSQL"
  if ! pg_isready -h 127.0.0.1 -p 5432 >/dev/null 2>&1; then
    pg_ctlcluster 16 main start || service postgresql start
  fi
  pg_isready -h 127.0.0.1 -p 5432

  echo "migration"
  (cd "$ROOT/backend" && .venv/bin/python -m alembic upgrade head >/dev/null)
  (cd "$ROOT/backend" && .venv/bin/python -m alembic current | tail -1)

  echo "backend :8000"
  (cd "$ROOT/backend" \
    && CORS_ORIGINS="$DEV_CORS" \
       setsid nohup .venv/bin/python -m uvicorn app.main:app --host 127.0.0.1 --port 8000 \
       >"$BACKEND_LOG" 2>&1 </dev/null &)
  wait_for http://127.0.0.1:8000/health backend

  echo "preview :4173"
  (cd "$ROOT" && setsid nohup npx vite preview --port 4173 --host 127.0.0.1 \
    >"$PREVIEW_LOG" 2>&1 </dev/null &)
  wait_for http://127.0.0.1:4173/ preview
}

stop() {
  pkill -f "uvicorn app.main:app" || true
  pkill -f "vite preview" || true
  echo "stopped (PostgreSQL は止めない)"
}

status() {
  pg_isready -h 127.0.0.1 -p 5432 || true
  curl -fsS -o /dev/null -w "backend: %{http_code}\n" http://127.0.0.1:8000/health || echo "backend: down"
  curl -fsS -o /dev/null -w "preview: %{http_code}\n" http://127.0.0.1:4173/ || echo "preview: down"
}

case "${1:-start}" in
  start) start ;;
  stop) stop ;;
  restart) stop; start ;;
  status) status ;;
  *) echo "usage: $0 {start|stop|restart|status}" >&2; exit 2 ;;
esac
