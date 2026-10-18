import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';
import { getDb } from './client';
import { APP_DB_PATH, DATA_DIR, refreshPaths } from './paths';
import { assertTestIsolationGuard } from './guard';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/lib/db/migrations');

/**
 * Apply all pending Drizzle migrations from src/lib/db/migrations/ to app.db.
 * Synchronous — better-sqlite3 is a synchronous driver.
 *
 * Ensures:
 * 1. DATA_DIR and DB parent directories exist
 * 2. SQLite connection is opened with WAL and foreign_keys = ON
 * 3. Pending migrations run safely and idempotently
 */
export function runMigrations(): void {
    refreshPaths();
    assertTestIsolationGuard(APP_DB_PATH);

    // 1. Create DATA_DIR and parent directories if missing
    if (!fs.existsSync(DATA_DIR)) {
        fs.mkdirSync(DATA_DIR, { recursive: true });
    }
    const dbDir = path.dirname(APP_DB_PATH);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    // 2. Open DB and configure pragmas
    const activeDb = getDb();
    activeDb.$client.pragma('journal_mode = WAL');
    activeDb.$client.pragma('foreign_keys = ON');

    // 3. Run pending migrations
    migrate(activeDb, { migrationsFolder: MIGRATIONS_DIR });
}

// Allow running as a standalone script: tsx src/lib/db/migrate.ts
const isMainModule =
    typeof process.argv[1] === 'string' &&
    (process.argv[1].endsWith('migrate.ts') ||
        (import.meta.url && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])));

if (isMainModule) {
    try {
        console.log(`Applying migrations to ${APP_DB_PATH}...`);
        runMigrations();
        console.log('Migrations successfully applied.');
    } catch (error) {
        console.error('Migration failed:', error);
        process.exit(1);
    }
}
