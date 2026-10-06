#!/usr/bin/env bash
# Roda as migrações e os testes do banco num PostgreSQL temporário (sem Docker).
# Requer PostgreSQL 15+ instalado (initdb/pg_ctl no PATH ou em PG_BIN).
# Alternativa com Supabase CLI: `supabase start && supabase db reset` e depois psql com os testes.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
PG_BIN="${PG_BIN:-$(dirname "$(command -v initdb 2>/dev/null || ls /usr/lib/postgresql/*/bin/initdb | tail -1)")}"
TMP="$(mktemp -d)"
PORT="${PGPORT_TEST:-54329}"
RUN_AS=()
if [ "$(id -u)" = "0" ]; then
  id postgres >/dev/null 2>&1 || useradd -m postgres
  chown -R postgres "$TMP"
  RUN_AS=(su postgres -c)
fi

run() { if [ ${#RUN_AS[@]} -gt 0 ]; then "${RUN_AS[@]}" "$*"; else bash -c "$*"; fi; }
cleanup() { run "$PG_BIN/pg_ctl -D $TMP/data -m immediate stop" >/dev/null 2>&1 || true; rm -rf "$TMP"; }
trap cleanup EXIT

run "$PG_BIN/initdb -D $TMP/data -U postgres --auth=trust" >/dev/null
run "$PG_BIN/pg_ctl -D $TMP/data -o '-p $PORT -k $TMP' -l $TMP/log start -w" >/dev/null

PSQL="psql -h $TMP -p $PORT -U postgres -d postgres -v ON_ERROR_STOP=1 -q"
$PSQL -f "$ROOT/supabase/tests/00_supabase_stub.sql"
for f in "$ROOT"/supabase/migrations/*.sql; do
  echo "→ migração $(basename "$f")"
  $PSQL -f "$f"
done
$PSQL -f "$ROOT/supabase/tests/01_security_and_flows.test.sql" 2>&1 | sed 's/^psql:[^:]*:[0-9]*: //'
