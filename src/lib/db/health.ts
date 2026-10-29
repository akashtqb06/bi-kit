import 'server-only';

import fs from 'node:fs';
import path from 'node:path';
import { sql } from 'drizzle-orm';
import { db, isPglite } from './client';
import { extractCauseInfo, redactSecrets } from './errors';

export interface DatabaseConnectionInfo {
    host: string;
    port: string | number;
    database: string;
}

export type DatabaseHealthStatus =
    | { ok: true }
    | {
          ok: false;
          reason: 'unreachable' | 'not_migrated' | 'error';
          title: string;
          message: string;
          fix: string;
          exactFix: string;
          detail?: string;
          error?: string;
          host?: string;
          port?: string | number;
      };

export function getDatabaseConnectionInfo(): DatabaseConnectionInfo {
    const rawUrl = process.env.DATABASE_URL || 'postgres://postgres:bi_password_123!@localhost:5432/bikit_dev';
    try {
        const parsed = new URL(rawUrl);
        return {
            host: parsed.hostname || 'localhost',
            port: parsed.port || '5432',
            database: parsed.pathname.replace(/^\//, '') || 'bikit_dev',
        };
    } catch {
        return {
            host: 'localhost',
            port: '5432',
            database: 'bikit_dev',
        };
    }
}

/**
 * Parses any database error to determine whether it is an unreachable connection
 * failure, a missing/unmigrated table issue, or a general runtime query error.
 */
export function parseDatabaseError(error: unknown): DatabaseHealthStatus {
    const connInfo = getDatabaseConnectionInfo();
    const { code, message } = extractCauseInfo(error);
    const rawMsg = error instanceof Error ? error.message : String(error);
    const combined = `${code ?? ''} ${message ?? ''} ${rawMsg}`.toLowerCase();

    const isUnreachable =
        code === 'ECONNREFUSED' ||
        code === 'ETIMEDOUT' ||
        code === 'ENOTFOUND' ||
        code === 'EHOSTUNREACH' ||
        code === 'EPERM' ||
        code === '28P01' || // password authentication failed
        code === '3D000' || // database does not exist
        combined.includes('econnrefused') ||
        combined.includes('connection refused') ||
        combined.includes('password authentication failed') ||
        combined.includes('database') && combined.includes('does not exist') ||
        combined.includes('connect eperm');

    if (isUnreachable) {
        return {
            ok: false,
            reason: 'unreachable',
            title: 'Database Unavailable',
            message: `Postgres is not reachable at ${connInfo.host}:${connInfo.port}.`,
            fix: 'docker compose -f docker-compose.dev.yml up -d',
            exactFix: `Postgres is not reachable at ${connInfo.host}:${connInfo.port}. Start it with docker compose -f docker-compose.dev.yml up -d`,
            error: redactSecrets(message || rawMsg),
            host: connInfo.host,
            port: connInfo.port,
        };
    }

    const isNotMigrated =
        code === '42P01' || // undefined_table
        code === '3F000' || // invalid_schema_name
        combined.includes('does not exist') ||
        combined.includes('relation') ||
        combined.includes('not migrated');

    if (isNotMigrated) {
        return {
            ok: false,
            reason: 'not_migrated',
            title: 'Database Not Migrated',
            message: 'Database is not migrated.',
            fix: 'pnpm db:migrate',
            exactFix: 'Database is not migrated. Run pnpm db:migrate',
            error: redactSecrets(message || rawMsg),
            host: connInfo.host,
            port: connInfo.port,
        };
    }

    return {
        ok: false,
        reason: 'error',
        title: 'Database Error',
        message: 'A database error occurred.',
        fix: 'Check server logs for database details',
        exactFix: redactSecrets(rawMsg),
        error: redactSecrets(message || rawMsg),
        host: connInfo.host,
        port: connInfo.port,
    };
}

/**
 * Startup and health check used by /api/health and page layouts:
 * 1. Verifies connectivity by executing `SELECT 1`.
 * 2. Verifies the migrations table (`drizzle.__drizzle_migrations`) exists and is current.
 * 3. Verifies core required application relations exist (e.g., `public.sessions`).
 */
export async function checkDatabaseHealth(): Promise<DatabaseHealthStatus> {
    const connInfo = getDatabaseConnectionInfo();

    // 1. Connect & SELECT 1
    try {
        await db.execute(sql`SELECT 1 as ping`);
    } catch (err) {
        const parsed = parseDatabaseError(err);
        return parsed;
    }

    // In isolated in-memory PGlite test environments, if tables exist, health is verified
    if (isPglite()) {
        try {
            const tableCheck = (await db.execute(sql`SELECT to_regclass('public.sessions') as regclass`)) as {
                rows?: Array<{ regclass?: string | null }>;
            };
            const regclass = tableCheck.rows?.[0]?.regclass;
            if (regclass) {
                return { ok: true };
            }
        } catch {}
    }

    // 2. Verify migrations table is current
    try {
        const regRes = (await db.execute(sql`SELECT to_regclass('drizzle.__drizzle_migrations') as regclass`)) as {
            rows?: Array<{ regclass?: string | null }>;
        };
        const regclass = regRes.rows?.[0]?.regclass;
        if (!regclass) {
            return {
                ok: false,
                reason: 'not_migrated',
                title: 'Database Not Migrated',
                message: 'Database is not migrated.',
                fix: 'pnpm db:migrate',
                exactFix: 'Database is not migrated. Run pnpm db:migrate',
                detail: 'The migrations tracking table (drizzle.__drizzle_migrations) does not exist.',
                host: connInfo.host,
                port: connInfo.port,
            };
        }

        // Check expected count of migrations from journal
        const journalPath = path.join(process.cwd(), 'src/lib/db/migrations/meta/_journal.json');
        let expectedCount = 0;
        if (fs.existsSync(journalPath)) {
            try {
                const journal = JSON.parse(fs.readFileSync(journalPath, 'utf8')) as { entries?: unknown[] };
                expectedCount = journal.entries?.length || 0;
            } catch {}
        }

        const countRes = (await db.execute(sql`SELECT count(*)::int as count FROM drizzle.__drizzle_migrations`)) as {
            rows?: Array<{ count?: number }>;
        };
        const count = countRes.rows?.[0]?.count ?? 0;

        if (expectedCount > 0 && count < expectedCount) {
            return {
                ok: false,
                reason: 'not_migrated',
                title: 'Database Not Migrated',
                message: 'Database is not migrated.',
                fix: 'pnpm db:migrate',
                exactFix: 'Database is not migrated. Run pnpm db:migrate',
                detail: `Applied ${count} of ${expectedCount} migrations.`,
                host: connInfo.host,
                port: connInfo.port,
            };
        }

        // Verify public.sessions table exists
        const sessRes = (await db.execute(sql`SELECT to_regclass('public.sessions') as regclass`)) as {
            rows?: Array<{ regclass?: string | null }>;
        };
        const sessRegclass = sessRes.rows?.[0]?.regclass;
        if (!sessRegclass) {
            return {
                ok: false,
                reason: 'not_migrated',
                title: 'Database Not Migrated',
                message: 'Database is not migrated.',
                fix: 'pnpm db:migrate',
                exactFix: 'Database is not migrated. Run pnpm db:migrate',
                detail: 'Table public.sessions is missing.',
                host: connInfo.host,
                port: connInfo.port,
            };
        }

        return { ok: true };
    } catch (err) {
        return parseDatabaseError(err);
    }
}
