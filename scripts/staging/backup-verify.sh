#!/usr/bin/env bash
# Backup + restore verification for the approved staging database. Stops at the first error.
# Needs: DATABASE_URL (external URL), STAGING_DB_HOST, STAGING_DB_NAME, local psql/pg_dump/pg_restore/createdb.
# Restores into a throwaway LOCAL database and compares (1) the schema, (2) counts AND per-table content hashes.
# The backup file is NEVER deleted by this script; delete it yourself only after you see VERIFIED.
set -euo pipefail

cd "$(dirname "$0")/../.."
: "${DATABASE_URL:?DATABASE_URL is not set}"

npx tsx scripts/staging/db-identity.ts

# pg_dump must be at least as new as the server.
server_major=$(psql "$DATABASE_URL" -X -A -t -c "show server_version_num" | cut -c1-2)
client_major=$(pg_dump --version | sed -E 's/[^0-9]*([0-9]+).*/\1/')
if [ "$client_major" -lt "$server_major" ]; then
  echo "pg_dump v$client_major is older than server v$server_major; install a newer client." >&2; exit 3
fi

# Applied ONLY to local commands (never exported), so the remote URL is never affected by a local port.
local_psql() { PGSSLMODE=disable PGHOST="${SCRATCH_PGHOST:-/tmp}" PGPORT="${SCRATCH_PGPORT:-5432}" "$@"; }
# The throwaway restore target is a LOCAL server (SCRATCH_PGHOST/SCRATCH_PGPORT select it; default: local socket in /tmp, port 5432).
# It must be at least as new as the staging server, and must not inherit the remote's PGSSLMODE.
local_major=$(local_psql psql -X -A -t -d postgres -c "show server_version_num" | cut -c1-2)
if [ "$local_major" -lt "$server_major" ]; then
  echo "local scratch server v$local_major is older than staging v$server_major; set SCRATCH_PGPORT to a v$server_major+ local server." >&2; exit 3
fi

dir="${BACKUP_DIR:-$HOME/bahaos-staging-backups}"
stamp=$(date +%Y%m%dT%H%M%S)
dump="$dir/staging-$stamp.dump"
scratch="bahaos_restore_check_$stamp"
mkdir -p "$dir"; chmod 700 "$dir"
[ ! -e "$dump" ] || { echo "backup file already exists" >&2; exit 3; }

pg_dump -Fc --no-owner --no-privileges -f "$dump" "$DATABASE_URL"
[ -s "$dump" ] || { echo "backup file is empty" >&2; exit 3; }
pg_restore -l "$dump" > /dev/null          # the archive must be readable

local_psql createdb "$scratch"
local_psql pg_restore --exit-on-error --no-owner --no-privileges -d "$scratch" "$dump"

work=$(mktemp -d)
# Compare DEFINITIONS only: drop SQL comment lines ("-- ...": version banner, object headers, the public-schema note) and
# blank lines. pg_dump also prints a random \restrict token on each run. Every CREATE/ALTER statement is still compared.
strip_token() { grep -v -E '^(\\(un)?restrict |--|[[:space:]]*$)'; }
pg_dump -s --no-owner --no-privileges "$DATABASE_URL" | strip_token > "$work/schema.src.sql"
local_psql pg_dump -s --no-owner --no-privileges "$scratch" | strip_token > "$work/schema.dst.sql"
diff "$work/schema.src.sql" "$work/schema.dst.sql"      # non-zero exit stops the script

psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f scripts/staging/compare-db.sql > "$work/data.src.txt"
local_psql psql "$scratch" -X -A -t -v ON_ERROR_STOP=1 -f scripts/staging/compare-db.sql > "$work/data.dst.txt"
diff "$work/data.src.txt" "$work/data.dst.txt"
[ -s "$work/data.src.txt" ] || { echo "fingerprint is empty" >&2; exit 3; }

local_psql dropdb "$scratch"; rm -rf "$work"
echo "VERIFIED: schema and per-table content hashes identical. Backup kept at: $dump"
