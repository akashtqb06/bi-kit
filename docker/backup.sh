#!/usr/bin/env bash
set -euo pipefail

BACKUP_DIR="${BACKUP_DIR:-/backups}"
DATA_DIR="${DATA_DIR:-/app_data}"
BACKUP_EXCLUDE_SCHEMAS="${BACKUP_EXCLUDE_SCHEMAS:-store_*}"
HEARTBEAT_FILE="${BACKUP_DIR}/heartbeat.json"
APP_HEARTBEAT_FILE="${DATA_DIR}/backup-heartbeat.json"

mkdir -p "$BACKUP_DIR"

TIMESTAMP="$(date +%Y%m%d_%H%M%S)"
ISO_TIME="$(date -u +"%Y-%m-%dT%H:%M:%SZ")"
DB_DUMP_FILE="db_${TIMESTAMP}.dump"
APP_DATA_FILE="app_data_${TIMESTAMP}.tar.gz"
DB_DUMP_PATH="${BACKUP_DIR}/${DB_DUMP_FILE}"
APP_DATA_PATH="${BACKUP_DIR}/${APP_DATA_FILE}"

echo "=================================================="
echo " Starting BI Kit Backup at ${ISO_TIME}"
echo "=================================================="

write_heartbeat() {
  local status="$1"
  local err_msg="$2"
  local db_file="${3:-}"
  local app_file="${4:-}"
  local db_size="${5:-0}"
  local app_size="${6:-0}"

  cat <<EOF > "$HEARTBEAT_FILE"
{
  "status": "${status}",
  "timestamp": "${ISO_TIME}",
  "databaseBackup": ${db_file:+"\"$db_file\""}${db_file:-null},
  "appDataBackup": ${app_file:+"\"$app_file\""}${app_file:-null},
  "databaseSizeBytes": ${db_size},
  "appDataSizeBytes": ${app_size},
  "error": ${err_msg:+"\"$err_msg\""}${err_msg:-null}
}
EOF

  # Copy to app_data volume so app container can read it via /app/data
  if [ -d "$DATA_DIR" ] && [ -w "$DATA_DIR" ]; then
    cp "$HEARTBEAT_FILE" "$APP_HEARTBEAT_FILE" 2>/dev/null || true
  fi
}

PG_HOST="${PGHOST:-db}"
PG_PORT="${PGPORT:-5432}"
PG_USER="${PGUSER:-postgres}"
PG_DB="${PGDATABASE:-bikit_prod}"

echo "⏳ Step 1/4: Dumping PostgreSQL database (${PG_DB})..."
EXCLUDE_FLAG=""
if [ -n "$BACKUP_EXCLUDE_SCHEMAS" ]; then
  EXCLUDE_FLAG="--exclude-schema=${BACKUP_EXCLUDE_SCHEMAS}"
fi

export PGPASSWORD="${POSTGRES_PASSWORD:-}"

if ! pg_dump -h "$PG_HOST" -p "$PG_PORT" -U "$PG_USER" -d "$PG_DB" -Fc $EXCLUDE_FLAG -f "$DB_DUMP_PATH"; then
  echo "❌ Error: pg_dump failed!" >&2
  write_heartbeat "error" "pg_dump failed"
  exit 1
fi

echo "⏳ Step 2/4: Verifying database dump archive..."
if ! pg_restore --list "$DB_DUMP_PATH" > /dev/null 2>&1; then
  echo "❌ Error: pg_restore verification failed for ${DB_DUMP_PATH}!" >&2
  write_heartbeat "error" "pg_restore verification failed"
  rm -f "$DB_DUMP_PATH"
  exit 1
fi
echo "✅ Database dump verified successfully."

DB_SIZE=$(stat -c%s "$DB_DUMP_PATH" 2>/dev/null || stat -f%z "$DB_DUMP_PATH" 2>/dev/null || echo 0)

echo "⏳ Step 3/4: Archiving app data volume..."
APP_SIZE=0
if [ -d "$DATA_DIR" ]; then
  tar -czf "$APP_DATA_PATH" -C "$DATA_DIR" --exclude="backup-heartbeat.json" .
  APP_SIZE=$(stat -c%s "$APP_DATA_PATH" 2>/dev/null || stat -f%z "$APP_DATA_PATH" 2>/dev/null || echo 0)
  echo "✅ App data archived successfully."
else
  echo "ℹ️ ${DATA_DIR} not found; skipping app data archive."
fi

# 4. GFS Retention pruning: 14 daily + 8 weekly + 12 monthly
echo "⏳ Step 4/4: Applying retention pruning (14 daily + 8 weekly + 12 monthly)..."

# Collect all existing database dumps sorted chronologically
mapfile -t ALL_DUMPS < <(find "$BACKUP_DIR" -name "db_*.dump" -type f | sort)

declare -A KEEP_SET

# Keep most recent 14 daily dumps
if [ ${#ALL_DUMPS[@]} -gt 0 ]; then
  for ((i=${#ALL_DUMPS[@]}-1; i>=0 && i>=${#ALL_DUMPS[@]}-14; i--)); do
    KEEP_SET["${ALL_DUMPS[$i]}"]=1
  done
fi

# Keep 8 weekly dumps (from Sundays)
for dump in "${ALL_DUMPS[@]}"; do
  fname="$(basename "$dump")"
  # Extract YYYYMMDD
  date_str="${fname:3:8}"
  if [ ${#date_str} -eq 8 ]; then
    day_of_week="$(date -d "${date_str:0:4}-${date_str:4:2}-${date_str:6:2}" +%u 2>/dev/null || date -j -f "%Y%m%d" "$date_str" +%u 2>/dev/null || echo "")"
    if [ "$day_of_week" = "7" ]; then # 7 = Sunday
      KEEP_SET["$dump"]=1
    fi
  fi
done

# Keep 12 monthly dumps (from 1st of month)
for dump in "${ALL_DUMPS[@]}"; do
  fname="$(basename "$dump")"
  date_str="${fname:3:8}"
  if [ ${#date_str} -eq 8 ]; then
    day_of_month="${date_str:6:2}"
    if [ "$day_of_month" = "01" ]; then
      KEEP_SET["$dump"]=1
    fi
  fi
done

# Prune older un-kept dumps and their matching app_data archives
for dump in "${ALL_DUMPS[@]}"; do
  if [ -z "${KEEP_SET[$dump]:-}" ]; then
    echo "🗑️ Pruning expired backup: $(basename "$dump")"
    rm -f "$dump"
    matching_app_data="${dump/db_/app_data_}"
    matching_app_data="${matching_app_data/.dump/.tar.gz}"
    rm -f "$matching_app_data"
  fi
done

# Optional rsync sync
if [ -n "${BACKUP_SYNC_DIR:-}" ] && [ -d "${BACKUP_SYNC_DIR}" ]; then
  echo "⏳ Syncing backups to external destination: ${BACKUP_SYNC_DIR}..."
  if command -v rsync >/dev/null 2>&1; then
    rsync -a "$BACKUP_DIR/" "${BACKUP_SYNC_DIR}/"
    echo "✅ Backups synced to ${BACKUP_SYNC_DIR}."
  else
    cp -u "$BACKUP_DIR"/* "${BACKUP_SYNC_DIR}/" 2>/dev/null || true
  fi
fi

# Record heartbeat
write_heartbeat "ok" "" "$DB_DUMP_FILE" "$APP_DATA_FILE" "$DB_SIZE" "$APP_SIZE"
echo "✅ Backup successfully completed at $(date -u +"%Y-%m-%dT%H:%M:%SZ")."

