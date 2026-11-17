#!/usr/bin/env bash
set -euo pipefail
pg_bin="/usr/lib/postgresql/18/bin"
data_dir="${XDG_DATA_HOME:-$HOME/.local/share}/audiotrust/postgres"
if [[ -s "$data_dir/PG_VERSION" ]]; then
  "$pg_bin/pg_ctl" -D "$data_dir" status
else
  echo "AudioTrust's user-owned PostgreSQL cluster has not been initialized."
  exit 1
fi
