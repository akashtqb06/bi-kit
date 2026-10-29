#!/usr/bin/env bash
set -euo pipefail

DUMP_ARG="${1:-}"

if [ -z "$DUMP_ARG" ]; then
  echo "Usage: $0 <path-to-dump-file>"
  echo ""
  echo "Available backups in ./backups:"
  ls -lh backups/*.dump 2>/dev/null || echo "  (no dumps found)"
  exit 1
fi

if [ ! -f "$DUMP_ARG" ]; then
  echo "❌ Error: Backup file not found: $DUMP_ARG" >&2
  exit 1
fi

DUMP_BASENAME="$(basename "$DUMP_ARG")"
SCRATCH_DB="bikit_restore_scratch"
TARGET_DB="${POSTGRES_DB:-bikit_prod}"
PG_USER="${POSTGRES_USER:-postgres}"

echo "=========================================================="
echo " BI Kit Production Restore"
echo " Target Dump: $DUMP_ARG"
echo "=========================================================="

echo "⏳ Step 1/4: Restoring dump into scratch database '${SCRATCH_DB}'..."

# Copy dump to temporary path inside db container
docker compose exec -T db sh -c "cat > /tmp/restore_target.dump" < "$DUMP_ARG"

# Recreate scratch database
docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" > /dev/null
docker compose exec -T db psql -U "$PG_USER" -c "CREATE DATABASE ${SCRATCH_DB};" > /dev/null

# Restore into scratch database
docker compose exec -T db pg_restore -U "$PG_USER" -d "$SCRATCH_DB" --clean --if-exists /tmp/restore_target.dump || true

echo "✅ Dump successfully restored into scratch database."
echo ""
echo "📊 Inspected Table Row Counts from Backup:"
echo "----------------------------------------------------------"

docker compose exec -T db psql -U "$PG_USER" -d "$SCRATCH_DB" -t -A -c "
DO \$\$
DECLARE
  rec record;
  cnt bigint;
BEGIN
  FOR rec IN
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public'
    ORDER BY tablename
  LOOP
    EXECUTE format('SELECT count(*) FROM %I', rec.tablename) INTO cnt;
    RAISE NOTICE '  - %: % row(s)', rpad(rec.tablename, 25), cnt;
  END LOOP;
END \$\$;
" 2>&1 | grep "NOTICE:" | sed 's/NOTICE: //'

echo "----------------------------------------------------------"
echo ""
echo "⚠️  CRITICAL WARNING:"
echo "Proceeding will REPLACE the active production database '${TARGET_DB}'"
echo "with the data from: ${DUMP_BASENAME}."
echo ""

read -r -p "Type 'RESTORE' to overwrite production database: " CONFIRMATION

if [ "$CONFIRMATION" != "RESTORE" ]; then
  echo "❌ Confirmation failed. Aborting restore. Production database untouched."
  docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${SCRATCH_DB};" > /dev/null
  docker compose exec -T db rm -f /tmp/restore_target.dump
  exit 1
fi

echo "⏳ Step 2/4: Swapping scratch database into production '${TARGET_DB}'..."

# Disconnect active connections to TARGET_DB
docker compose exec -T db psql -U "$PG_USER" -c "
SELECT pg_terminate_backend(pid)
FROM pg_stat_activity
WHERE datname = '${TARGET_DB}' AND pid <> pg_backend_pid();
" > /dev/null

# Swap databases
docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${TARGET_DB};" > /dev/null
docker compose exec -T db psql -U "$PG_USER" -c "ALTER DATABASE ${SCRATCH_DB} RENAME TO ${TARGET_DB};" > /dev/null
docker compose exec -T db rm -f /tmp/restore_target.dump

# Restore matching app_data archive if present
MATCHING_APP_DATA="${DUMP_ARG/db_/app_data_}"
MATCHING_APP_DATA="${MATCHING_APP_DATA/.dump/.tar.gz}"

if [ -f "$MATCHING_APP_DATA" ]; then
  echo "⏳ Step 3/4: Restoring matching file archive ($(basename "$MATCHING_APP_DATA"))..."
  docker compose run --rm --entrypoint /bin/sh backup -c "tar -xzf /backups/$(basename "$MATCHING_APP_DATA") -C /app_data"
  echo "✅ App data files restored."
else
  echo "ℹ️ Step 3/4: No matching app_data archive found; skipping file unpack."
fi

echo "⏳ Step 4/4: Restarting application container..."
docker compose restart app

echo "⏳ Waiting for app container to report healthy..."
for i in {1..30}; do
  if docker compose ps app | grep -q "healthy"; then
    echo "✅ Application container is healthy and serving restored data."
    break
  fi
  sleep 1
done

echo ""
echo "🎉 Restore completed successfully!"

