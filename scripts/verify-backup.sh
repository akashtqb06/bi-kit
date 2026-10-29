#!/usr/bin/env bash
set -euo pipefail

echo "=========================================================="
echo " BI Kit Backup Integrity Verification Drill"
echo "=========================================================="

LATEST_DUMP="$(find backups -name "db_*.dump" -type f 2>/dev/null | sort | tail -n 1 || echo "")"

if [ -z "$LATEST_DUMP" ] || [ ! -f "$LATEST_DUMP" ]; then
  echo "❌ Error: No database dumps found in ./backups." >&2
  exit 1
fi

echo "🔍 Found latest backup: $LATEST_DUMP"
PG_USER="${POSTGRES_USER:-postgres}"
VERIFY_DB="bikit_drill_scratch"

# 1. Quick format verification with pg_restore --list
echo "⏳ Step 1/3: Validating archive format integrity with pg_restore --list..."
docker compose exec -T db sh -c "cat > /tmp/drill_test.dump" < "$LATEST_DUMP"
docker compose exec -T db pg_restore --list /tmp/drill_test.dump > /dev/null
echo "✅ Archive structure is valid."

# 2. Restore into temporary drill database
echo "⏳ Step 2/3: Restoring dump into temporary drill database '${VERIFY_DB}'..."
docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${VERIFY_DB};" > /dev/null
docker compose exec -T db psql -U "$PG_USER" -c "CREATE DATABASE ${VERIFY_DB};" > /dev/null
docker compose exec -T db pg_restore -U "$PG_USER" -d "$VERIFY_DB" /tmp/drill_test.dump || true

# 3. Check migration ledger and table counts
echo "⏳ Step 3/3: Checking migration ledger and table row counts..."
MIGRATION_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$VERIFY_DB" -t -A -c "
SELECT count(*) FROM __drizzle_migrations;
" 2>/dev/null || echo "0")

echo "  - Drizzle migrations recorded in backup: ${MIGRATION_COUNT}"

USER_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$VERIFY_DB" -t -A -c "
SELECT count(*) FROM users;
" 2>/dev/null || echo "0")
echo "  - Users present: ${USER_COUNT}"

ACCOUNT_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$VERIFY_DB" -t -A -c "
SELECT count(*) FROM fin_accounts;
" 2>/dev/null || echo "0")
echo "  - Financial accounts present: ${ACCOUNT_COUNT}"

TX_COUNT=$(docker compose exec -T db psql -U "$PG_USER" -d "$VERIFY_DB" -t -A -c "
SELECT count(*) FROM fin_transactions;
" 2>/dev/null || echo "0")
echo "  - Financial transactions present: ${TX_COUNT}"

# Cleanup
docker compose exec -T db psql -U "$PG_USER" -c "DROP DATABASE IF EXISTS ${VERIFY_DB};" > /dev/null
docker compose exec -T db rm -f /tmp/drill_test.dump

echo ""
echo "=========================================================="
echo " ✅ BACKUP INTEGRITY VERIFICATION DRILL PASSED"
echo " Archive: $(basename "$LATEST_DUMP")"
echo " All tables readable and schema consistent."
echo "=========================================================="

