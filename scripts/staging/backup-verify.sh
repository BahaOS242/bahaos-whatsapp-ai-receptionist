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

dir="${BACKUP_DIR:-$HOME/bahaos-staging-backups}"
stamp=$(date +%Y%m%dT%H%M%S)
dump="$dir/staging-$stamp.dump"
scratch="bahaos_restore_check_$stamp"
mkdir -p "$dir"; chmod 700 "$dir"
[ ! -e "$dump" ] || { echo "backup file already exists" >&2; exit 3; }

pg_dump -Fc --no-owner --no-privileges -f "$dump" "$DATABASE_URL"
[ -s "$dump" ] || { echo "backup file is empty" >&2; exit 3; }
pg_restore -l "$dump" > /dev/null          # the archive must be readable

createdb "$scratch"
pg_restore --exit-on-error --no-owner --no-privileges -d "$scratch" "$dump"

work=$(mktemp -d)
# pg_dump prints a random \restrict/\unrestrict token on every run; those two lines are the only expected difference.
strip_token() { grep -v -E '^\\(un)?restrict '; }
pg_dump -s --no-owner --no-privileges "$DATABASE_URL" | strip_token > "$work/schema.src.sql"
pg_dump -s --no-owner --no-privileges "$scratch"      | strip_token > "$work/schema.dst.sql"
diff "$work/schema.src.sql" "$work/schema.dst.sql"      # non-zero exit stops the script

psql "$DATABASE_URL" -X -A -t -v ON_ERROR_STOP=1 -f scripts/staging/compare-db.sql > "$work/data.src.txt"
psql "$scratch"      -X -A -t -v ON_ERROR_STOP=1 -f scripts/staging/compare-db.sql > "$work/data.dst.txt"
diff "$work/data.src.txt" "$work/data.dst.txt"
[ -s "$work/data.src.txt" ] || { echo "fingerprint is empty" >&2; exit 3; }

dropdb "$scratch"; rm -rf "$work"
echo "VERIFIED: schema and per-table content hashes identical. Backup kept at: $dump"
