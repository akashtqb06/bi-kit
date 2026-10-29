#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " BI Kit Migration Rehearsal Drill"
echo "=========================================================="

LATEST_DUMP="$(find backups -name "db_*.dump" -type f 2>/dev/null | sort | tail -n 1 || echo "")"

if [ -z "$LATEST_DUMP" ]; then
  echo "⚠️ No existing backup found. Creating an immediate backup before rehearsal..."
  ./scripts/backup-now.sh
  LATEST_DUMP="$(find backups -name "db_*.dump" -type f | sort | tail -n 1)"
fi

echo "🔍 Rehearsing migrations on backup: $LATEST_DUMP"
REHEARSE_DB="bikit_update_rehearsal"
PG_USER="${POSTGRES_USER:-postgres}"

# 1. Prepare rehearsal database
echo "⏳ Step 1/3: Restoring production backup into '${REHEARSE_DB}'..."
docker compose exec -T db sh -c "cat > /tmp/rehearse.dump" < "$LATEST_DUMP"
docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${REHEARSE_DB};" > /dev/null
docker compose exec -T db psql -U "$PG_USER" -c "CREATE DATABASE ${REHEARSE_DB};" > /dev/null
docker compose exec -T db pg_restore -U "$PG_USER" -d "$REHEARSE_DB" /tmp/rehearse.dump || true
docker compose exec -T db rm -f /tmp/rehearse.dump

# 2. Run pending migrations against the rehearsal database
echo "⏳ Step 2/3: Applying pending migrations to '${REHEARSE_DB}'..."
docker compose run --rm \
  -e "DATABASE_URL=postgres://${PG_USER}:${POSTGRES_PASSWORD}@db:5432/${REHEARSE_DB}" \
  app node dist/migrate.cjs

# 3. Sanity checks
echo "⏳ Step 3/3: Running post-migration schema sanity checks..."
docker compose exec -T db psql -U "$PG_USER" -d "$REHEARSE_DB" -c "
SELECT count(*) FROM users;
SELECT count(*) FROM fin_accounts;
SELECT count(*) FROM fin_transactions;
" > /dev/null

# Clean up rehearsal database
docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${REHEARSE_DB};" > /dev/null

echo "✅ Migration rehearsal SUCCESSFUL. Safe to proceed with update."

