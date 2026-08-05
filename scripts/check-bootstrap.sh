#!/usr/bin/env bash
# 本番の初期投入（`seed --bootstrap`）が、業務データを作らないことを実測する。
#
#   scripts/check-bootstrap.sh
#
# 使い捨ての PostgreSQL データベースを作り、migration → bootstrap を2回流して
#   - 初期管理者が1名だけ作られる
#   - 区分マスタが入る
#   - 案件・工程・写真・日報・要員・通知が **0件** のまま
#   - 2回目の実行で何も増えない（冪等）
# を確かめる。**既存のデータベースには一切触れない。**
set -euo pipefail

ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT/backend"

# 手元は backend/.venv、CI は pip でそのまま入れているため、あるほうを使う
PY=".venv/bin/python"
[ -x "$PY" ] || PY="python"

HOST="${PGHOST:-127.0.0.1}"
PORT="${PGPORT:-5432}"
USER="${PGUSER:-sysken}"
PASS="${PGPASSWORD:-sysken}"
# 毎回一意な名前を使い、既存DBと衝突させない
DB="sysken_bootstrap_check_$$"

export PGPASSWORD="$PASS"
psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -q -c "CREATE DATABASE \"$DB\" OWNER $USER;"
cleanup() {
  psql -h "$HOST" -p "$PORT" -U "$USER" -d postgres -q -c "DROP DATABASE IF EXISTS \"$DB\";" || true
}
trap cleanup EXIT

export DATABASE_URL="postgresql+psycopg2://$USER:$PASS@$HOST:$PORT/$DB"
export APP_ENV=production
# この検証用の使い捨てDBだけで使う値。公開環境の値ではない。
export SEED_ADMIN_PASSWORD="bootstrap-check-$$"

echo "== migration =="
"$PY" -m alembic upgrade head >/dev/null
"$PY" -m alembic current | tail -1

echo "== bootstrap（1回目） =="
"$PY" -m app.seed.seed --bootstrap

echo "== bootstrap（2回目・冪等性） =="
"$PY" -m app.seed.seed --bootstrap

echo "== 件数の実測 =="
psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tA -F' ' -c "
  select 'users', count(*) from users
  union all select 'projects', count(*) from projects
  union all select 'tasks', count(*) from tasks
  union all select 'photos', count(*) from photos
  union all select 'daily_reports', count(*) from daily_reports
  union all select 'quality_checks', count(*) from quality_checks
  union all select 'workers', count(*) from workers
  union all select 'notifications', count(*) from notifications
  union all select 'companies', count(*) from companies
  union all select 'departments', count(*) from departments
  union all select 'work_types', count(*) from work_types
  order by 1;"

fails=0
check() { # check <ラベル> <SQL> <期待値>
  local got
  got="$(psql -h "$HOST" -p "$PORT" -U "$USER" -d "$DB" -tA -c "$2")"
  if [ "$got" = "$3" ]; then
    echo "  PASS $1 ($got)"
  else
    echo "  FAIL $1 期待 $3 / 実際 $got"
    fails=$((fails + 1))
  fi
}

echo "== 判定 =="
check "利用者は初期管理者1名だけ" "select count(*) from users" 1
check "管理者の権限は ADMIN" "select role from users limit 1" ADMIN
check "案件は作られない" "select count(*) from projects" 0
check "工程は作られない" "select count(*) from tasks" 0
check "施工写真は作られない" "select count(*) from photos" 0
check "現場日報は作られない" "select count(*) from daily_reports" 0
check "品質確認は作られない" "select count(*) from quality_checks" 0
check "要員は作られない" "select count(*) from workers" 0
check "通知は作られない" "select count(*) from notifications" 0
check "会社は作られない" "select count(*) from companies" 0
check "部署は作られない" "select count(*) from departments" 0
# 区分マスタは「設定」なので入る（工程フォームの選択肢に必要）
check "工種マスタは入る" "select count(*) from work_types" 17
check "工程種別マスタは入る" "select count(*) from process_types" 21

if [ "$fails" -gt 0 ]; then
  echo "結果: $fails 件が期待どおりではありません"
  exit 1
fi
echo "結果: すべて期待どおり（業務データは作られない）"
