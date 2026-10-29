#!/usr/bin/env bash
set -euo pipefail

echo "=================================================="
echo " Starting BI Kit Self-Hosted Production Container"
echo "=================================================="

# 1. Validate environment configuration with Zod
echo "⏳ Step 1/4: Validating environment variables..."
if ! node dist/validate-env.cjs; then
  echo "❌ Fatal: Environment validation failed. Stopping container." >&2
  exit 1
fi

# 2. Wait for PostgreSQL database
echo "⏳ Step 2/4: Waiting for PostgreSQL connection..."
MAX_ATTEMPTS=30
ATTEMPT=1

node -e "
const pg = require('pg');
async function check() {
  for (let i = 1; i <= ${MAX_ATTEMPTS}; i++) {
    const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
    try {
      await client.connect();
      await client.query('SELECT 1');
      await client.end();
      process.exit(0);
    } catch (err) {
      try { await client.end(); } catch {}
      if (i === ${MAX_ATTEMPTS}) {
        console.error('❌ Could not connect to PostgreSQL after ${MAX_ATTEMPTS} attempts:', err.message);
        process.exit(1);
      }
      await new Promise(r => setTimeout(r, 1000));
    }
  }
}
check();
" || {
  echo "❌ Fatal: PostgreSQL database is not reachable at DATABASE_URL." >&2
  exit 1
}
echo "✅ PostgreSQL is ready."

# 3. Apply migrations under Postgres advisory lock
echo "⏳ Step 3/4: Applying database migrations..."
if ! node dist/migrate.cjs; then
  echo "❌ Fatal: Database migration failed. Stopping container." >&2
  exit 1
fi

# 4. Run idempotent first-run bootstrap (only creates admin if 0 users exist)
echo "⏳ Step 4/4: Checking first-run bootstrap status..."
if ! node dist/bootstrap.cjs; then
  echo "❌ Fatal: Bootstrap verification failed. Stopping container." >&2
  exit 1
fi

echo "🚀 Initialization complete. Starting Next.js application server..."
exec node server.js

