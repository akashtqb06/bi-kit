import { describe, it, expect } from 'vitest';
import { redactSecrets, extractCauseInfo, wrapDbError } from './errors';
import { parseDatabaseError, getDatabaseConnectionInfo } from './health';

describe('Database Error Wrapping and Diagnostics', () => {
    it('redacts sensitive passwords and connection URLs', () => {
        const rawUrl = 'Failed to connect to postgres://bikit_admin:SuperSecret123!@localhost:5432/bikit_dev';
        const redacted = redactSecrets(rawUrl);
        expect(redacted).not.toContain('SuperSecret123!');
        expect(redacted).toContain('postgres://bikit_admin:***@localhost:5432/bikit_dev');

        const rawPasswordParam = 'Query failed with password="SecretPassword!" in config';
        expect(redactSecrets(rawPasswordParam)).toBe('Query failed with password="***" in config');
    });

    it('extracts cause code and message from Drizzle cause objects', () => {
        const pgError = Object.assign(new Error('relation "sessions" does not exist'), {
            code: '42P01',
        });
        const drizzleError = new Error('Failed query: select * from "sessions"', { cause: pgError });

        const info = extractCauseInfo(drizzleError);
        expect(info.code).toBe('42P01');
        expect(info.message).toBe('relation "sessions" does not exist');
    });

    it('extracts cause code from AggregateError connection failures', () => {
        const networkError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
            code: 'ECONNREFUSED',
        });
        const aggError = Object.assign(new Error(''), {
            name: 'AggregateError',
            errors: [networkError],
        });
        const drizzleError = new Error('Failed query: select 1', { cause: aggError });

        const info = extractCauseInfo(drizzleError);
        expect(info.code).toBe('ECONNREFUSED');
        expect(info.message).toBe('connect ECONNREFUSED 127.0.0.1:5432');
    });

    it('wraps query error message with cause code and details while preserving error.cause', () => {
        const cause = Object.assign(new Error('relation "sessions" does not exist'), { code: '42P01' });
        const drizzleError = new Error('Failed query: select "id" from "sessions"', { cause });

        const wrapped = wrapDbError(drizzleError);
        expect(wrapped.message).toContain('Failed query [42P01: relation "sessions" does not exist]');
        expect(wrapped.cause).toBe(cause);
    });

    it('parses unreachable database error with exact fix instruction', () => {
        const connInfo = getDatabaseConnectionInfo();
        const connError = Object.assign(new Error('connect ECONNREFUSED 127.0.0.1:5432'), {
            code: 'ECONNREFUSED',
        });
        const status = parseDatabaseError(connError);

        expect(status.ok).toBe(false);
        if (!status.ok) {
            expect(status.reason).toBe('unreachable');
            expect(status.exactFix).toBe(
                `Postgres is not reachable at ${connInfo.host}:${connInfo.port}. Start it with docker compose -f docker-compose.dev.yml up -d`
            );
            expect(status.fix).toBe('docker compose -f docker-compose.dev.yml up -d');
        }
    });

    it('parses unmigrated database error with exact migration fix instruction', () => {
        const tableError = Object.assign(new Error('relation "sessions" does not exist'), {
            code: '42P01',
        });
        const status = parseDatabaseError(tableError);

        expect(status.ok).toBe(false);
        if (!status.ok) {
            expect(status.reason).toBe('not_migrated');
            expect(status.exactFix).toBe('Database is not migrated. Run pnpm db:migrate');
            expect(status.fix).toBe('pnpm db:migrate');
        }
    });
});
