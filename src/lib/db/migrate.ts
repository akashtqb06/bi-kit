import 'server-only';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { migrate as migratePg } from 'drizzle-orm/node-postgres/migrator';
import { migrate as migratePglite } from 'drizzle-orm/pglite/migrator';
import type { NodePgDatabase } from 'drizzle-orm/node-postgres';
import type { PgliteDatabase } from 'drizzle-orm/pglite';
import { getDb, isPglite } from './client';
import { assertTestIsolationGuard } from './guard';
import * as schema from './schema';

const MIGRATIONS_DIR = path.join(process.cwd(), 'src/lib/db/migrations');

/**
 * Apply all pending Drizzle migrations from src/lib/db/migrations/ to the active database.
 */
export async function runMigrations(): Promise<void> {
    assertTestIsolationGuard();

    const activeDb = getDb();
    if (isPglite()) {
        await migratePglite(activeDb as PgliteDatabase<typeof schema>, { migrationsFolder: MIGRATIONS_DIR });
    } else {
        await migratePg(activeDb as NodePgDatabase<typeof schema>, { migrationsFolder: MIGRATIONS_DIR });
    }
}

// Allow running as a standalone script: tsx src/lib/db/migrate.ts
const isMainModule =
    typeof process.argv[1] === 'string' &&
    (process.argv[1].endsWith('migrate.ts') ||
        (import.meta.url && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])));

if (isMainModule) {
    runMigrations()
        .then(() => {
            console.log('Migrations successfully applied.');
            process.exit(0);
        })
        .catch((error) => {
            console.error('Migration failed:', error);
            process.exit(1);
        });
}
