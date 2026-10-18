import Database from 'better-sqlite3';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import fs from 'fs';
import path from 'path';
import * as schema from './schema';
import { getAppDbPath, refreshPaths } from './paths';
import { assertTestIsolationGuard } from './guard';

// Singleton pattern on globalThis (survives Next.js dev HMR)
const globalForDb = globalThis as unknown as {
    _biKitDb: ReturnType<typeof drizzle<typeof schema>> | undefined;
    _biKitSqlite: Database.Database | undefined;
};

function createDb(): ReturnType<typeof drizzle<typeof schema>> {
    refreshPaths();
    const currentDbPath = getAppDbPath();
    assertTestIsolationGuard(currentDbPath);

    const dbDir = path.dirname(currentDbPath);
    if (!fs.existsSync(dbDir)) {
        fs.mkdirSync(dbDir, { recursive: true });
    }

    const sqlite = new Database(currentDbPath);
    sqlite.pragma('journal_mode = WAL');
    sqlite.pragma('foreign_keys = ON');

    const drizzleDb = drizzle(sqlite, { schema });
    globalForDb._biKitSqlite = sqlite;
    globalForDb._biKitDb = drizzleDb;
    return drizzleDb;
}

/**
 * Resets the SQLite connection by closing the existing connection handle (if open)
 * and creating a new Drizzle + better-sqlite3 instance.
 *
 * Used by "Load sample data", database reset flows, and test fixtures.
 */
export function resetConnection(): ReturnType<typeof drizzle<typeof schema>> {
    if (globalForDb._biKitSqlite) {
        try {
            globalForDb._biKitSqlite.close();
        } catch {
            // Ignore if already closed
        }
        globalForDb._biKitSqlite = undefined;
    }
    globalForDb._biKitDb = undefined;
    return createDb();
}

export function getDb(): ReturnType<typeof drizzle<typeof schema>> {
    if (!globalForDb._biKitDb) {
        return createDb();
    }
    return globalForDb._biKitDb;
}

/**
 * Proxied `db` export: All callers importing `db` will seamlessly use the active
 * Drizzle connection, even after `resetConnection()` recreates the underlying SQLite instance.
 */
export const db = new Proxy({} as ReturnType<typeof drizzle<typeof schema>>, {
    get(_target, prop, receiver) {
        const active = getDb();
        const value = Reflect.get(active, prop, receiver);
        if (typeof value === 'function') {
            return value.bind(active);
        }
        return value;
    },
});
