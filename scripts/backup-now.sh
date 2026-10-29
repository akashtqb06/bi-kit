#!/usr/bin/env bash
set -euo pipefail

echo "⏳ Initiating on-demand backup..."

if docker compose ps --services --filter "status=running" 2>/dev/null | grep -q "^backup$"; then
  docker compose exec -T backup /usr/local/bin/backup.sh
else
  docker compose run --rm backup /usr/local/bin/backup.sh
fi

echo "✅ Backup process finished."
if [ -f "backups/heartbeat.json" ]; then
  cat backups/heartbeat.json
  echo ""
fi

