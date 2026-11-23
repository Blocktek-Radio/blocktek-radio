#!/usr/bin/env bash
set -euo pipefail

pg_bin="/usr/lib/postgresql/18/bin"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/audiotrust/postgres"
socket_dir="${XDG_RUNTIME_DIR:-/tmp}/audiotrust-pg-${UID}"
port=5440

if [[ ! -x "$pg_bin/initdb" ]]; then
  echo "PostgreSQL 18 server binaries were not found at $pg_bin." >&2
  exit 1
fi
mkdir -p "$(dirname "$data_dir")" "$socket_dir"
chmod 700 "$socket_dir"

if [[ ! -s "$data_dir/PG_VERSION" ]]; then
  mkdir -p "$data_dir"
  chmod 700 "$data_dir"
  "$pg_bin/initdb" -D "$data_dir" --username="$(id -un)" --auth-local=peer --auth-host=scram-sha-256
fi

if ! "$pg_bin/pg_ctl" -D "$data_dir" status >/dev/null 2>&1; then
  "$pg_bin/pg_ctl" -D "$data_dir" -l "$data_dir/server.log" -o "-h '' -k $socket_dir -p $port" start
fi

if ! PGHOST="$socket_dir" PGPORT="$port" psql -d postgres -Atqc 'select 1' >/dev/null 2>&1; then
  echo "PostgreSQL is running but the local peer connection failed." >&2
  exit 1
fi

ident_config="$data_dir/pg_ident.conf"
hba_config="$data_dir/pg_hba.conf"
if ! rg -q '^audiotrust_user[[:space:]]+[^[:space:]]+[[:space:]]+audiotrust_app$' "$ident_config"; then
  printf 'audiotrust_user %s audiotrust_app\n' "$(id -un)" >> "$ident_config"
fi
if ! rg -q '^local[[:space:]]+all[[:space:]]+audiotrust_app[[:space:]]+peer[[:space:]]+map=audiotrust_user$' "$hba_config"; then
  sed -i '1ilocal all audiotrust_app peer map=audiotrust_user' "$hba_config"
fi
"$pg_bin/pg_ctl" -D "$data_dir" reload >/dev/null
PGHOST="$socket_dir" PGPORT="$port" psql -d postgres -v ON_ERROR_STOP=1 -c "DO \$\$ BEGIN IF NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'audiotrust_app') THEN EXECUTE 'CREATE ROLE audiotrust_app LOGIN'; END IF; END \$\$;" >/dev/null
if ! PGHOST="$socket_dir" PGPORT="$port" psql -d postgres -Atqc "SELECT 1 FROM pg_database WHERE datname = 'audiotrust'" | rg -q 1; then
  PGHOST="$socket_dir" PGPORT="$port" createdb --owner=audiotrust_app audiotrust
fi

encoded_socket="$(node -e 'process.stdout.write(encodeURIComponent(process.argv[1]))' "$socket_dir")"
if [[ ! -e backend/.env.local ]]; then
cat > backend/.env.local <<EOF
HOST=127.0.0.1
PORT=4100
DATABASE_URL=postgresql://audiotrust_app@localhost:5432/audiotrust?host=$encoded_socket&port=$port
STORAGE_ROOT=${XDG_DATA_HOME:-$HOME/.local/share}/audiotrust/private-audio
PLATFORM_KEY_PATH=${XDG_DATA_HOME:-$HOME/.local/share}/audiotrust/keys/platform-dev-private.pem
PLATFORM_KEY_ID=audiotrust-platform-dev-v1
FRONTEND_ORIGIN=http://localhost:3000
MIDNIGHT_NETWORK=undeployed
MAX_UPLOAD_BYTES=104857600
LOG_LEVEL=info
EOF
chmod 600 backend/.env.local
else
  echo "Preserving existing backend/.env.local; verify it targets the private port $port cluster."
fi
echo "AudioTrust PostgreSQL is ready on private socket $socket_dir, port $port."
echo "Local API configuration is in backend/.env.local (gitignored)."
