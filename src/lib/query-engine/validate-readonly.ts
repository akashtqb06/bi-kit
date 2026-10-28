import Database from 'better-sqlite3';
import { ReadOnlyValidationError } from '@src/lib/connectors/errors';
import type { SqlDialect } from '@src/lib/connectors/dialects/types';

export { ReadOnlyValidationError };

const COMMON_FORBIDDEN = new Set([
    'PRAGMA',
    'ATTACH',
    'DETACH',
    'INSERT',
    'UPDATE',
    'DELETE',
    'DROP',
    'CREATE',
    'ALTER',
    'REPLACE',
    'UPSERT',
    'VACUUM',
    'REINDEX',
    'TRUNCATE',
    'GRANT',
    'REVOKE',
]);

const POSTGRES_FORBIDDEN = new Set([
    'COPY',
    'DO',
    'CALL',
    'LISTEN',
    'NOTIFY',
    'UNLISTEN',
    'PG_SLEEP',
]);

const MYSQL_FORBIDDEN = new Set([
    'LOAD',
    'HANDLER',
    'LOCK',
    'UNLOCK',
    'OUTFILE',
    'DUMPFILE',
]);

const MSSQL_FORBIDDEN = new Set([
    'EXEC',
    'EXECUTE',
    'OPENROWSET',
    'OPENQUERY',
    'BULK',
    'WAITFOR',
    'USE',
    'BACKUP',
    'RESTORE',
    'SHUTDOWN',
]);

export function validateReadOnly(sql: string, dialect?: SqlDialect | string): void {
    const dialectName = typeof dialect === 'string' ? dialect.toLowerCase() : dialect?.name?.toLowerCase() || 'sqlite';
    validateReadOnlyShape(sql, dialectName);

    // If dialect is SQLite, check with in-memory prepare statement as extra defense-in-depth
    if (dialectName === 'sqlite' || dialectName === 'csv' || dialectName === 'excel') {
        let db: Database.Database | undefined;
        try {
            db = new Database(':memory:');
            const stmt = db.prepare(sql);
            if (!stmt.reader || !stmt.readonly) {
                throw new ReadOnlyValidationError(
                    'Only read-only SELECT statements are permitted. Write operations are not allowed.'
                );
            }
        } catch (err) {
            if (err instanceof ReadOnlyValidationError) {
                throw err;
            }
            // Ignore schema-resolution errors (e.g., "no such table: orders") in dummy :memory: DB
        } finally {
            db?.close();
        }
    }
}

export function validateReadOnlyShape(sql: string, dialectName = 'sqlite'): void {
    const stripped = stripCommentsAndLiterals(sql);

    // Semicolon in a single statement can only legitimately appear at the very end
    const withoutTrailingSemi = stripped.trimEnd().replace(/;$/, '');
    if (withoutTrailingSemi.includes(';')) {
        throw new ReadOnlyValidationError('Only a single SELECT statement is permitted. Multiple statements detected.');
    }

    const tokens = stripped.match(/\b[A-Za-z_][A-Za-z0-9_]*\b/g) || [];
    if (tokens.length === 0) {
        throw new ReadOnlyValidationError('Empty SQL query.');
    }

    const firstToken = tokens[0]?.toUpperCase() ?? '';
    if (firstToken !== 'SELECT' && firstToken !== 'WITH') {
        throw new ReadOnlyValidationError(
            'Only read-only SELECT statements are permitted. Write operations are not allowed.'
        );
    }

    // Check for "SELECT ... INTO"
    if (/\bSELECT\b[\s\S]+\bINTO\b/i.test(stripped)) {
        throw new ReadOnlyValidationError(
            'Forbidden operation "SELECT INTO". Write operations are not allowed.'
        );
    }

    for (let i = 0; i < tokens.length; i++) {
        const upper = tokens[i].toUpperCase();

        if (COMMON_FORBIDDEN.has(upper)) {
            throw new ReadOnlyValidationError(
                `Forbidden operation "${upper}". Only read-only SELECT or WITH statements are allowed.`
            );
        }

        // Per-dialect checks
        if (dialectName === 'postgres' || dialectName === 'postgresql') {
            if (POSTGRES_FORBIDDEN.has(upper)) {
                throw new ReadOnlyValidationError(
                    `Forbidden operation "${upper}". Only read-only SELECT or WITH statements are allowed.`
                );
            }
        } else if (dialectName === 'mysql' || dialectName === 'mariadb') {
            if (MYSQL_FORBIDDEN.has(upper)) {
                throw new ReadOnlyValidationError(
                    `Forbidden operation "${upper}". Only read-only SELECT or WITH statements are allowed.`
                );
            }
            if (upper === 'SET' && i + 1 < tokens.length) {
                const nextUpper = tokens[i + 1].toUpperCase();
                if (nextUpper !== 'TRANSACTION' && nextUpper !== 'SESSION' && nextUpper !== 'STATEMENT') {
                    throw new ReadOnlyValidationError(
                        `Forbidden operation "SET ${nextUpper}". Only read-only SELECT or WITH statements are allowed.`
                    );
                }
            }
        } else if (dialectName === 'mssql' || dialectName === 'sqlserver') {
            if (MSSQL_FORBIDDEN.has(upper)) {
                throw new ReadOnlyValidationError(
                    `Forbidden operation "${upper}". Only read-only SELECT or WITH statements are allowed.`
                );
            }
            if (upper.startsWith('XP_') || upper.startsWith('SP_')) {
                throw new ReadOnlyValidationError(
                    `Forbidden operation "${upper}". Stored procedure calls are not allowed.`
                );
            }
        }
    }
}

/**
 * Replace content inside single-quoted strings, quoted identifiers, and
 * comments with spaces so that keywords or semicolons inside them are ignored.
 */
function stripCommentsAndLiterals(sql: string): string {
    let result = '';
    let i = 0;
    const n = sql.length;

    while (i < n) {
        const char = sql[i];

        // 1. Single-quoted string literal: '...'
        if (char === "'") {
            result += ' ';
            i++;
            while (i < n) {
                if (sql[i] === "'") {
                    result += ' ';
                    if (i + 1 < n && sql[i + 1] === "'") {
                        result += ' ';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    result += ' ';
                    i++;
                }
            }
            continue;
        }

        // 2. Double-quoted identifier: "..."
        if (char === '"') {
            result += ' ';
            i++;
            while (i < n) {
                if (sql[i] === '"') {
                    result += ' ';
                    if (i + 1 < n && sql[i + 1] === '"') {
                        result += ' ';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    result += ' ';
                    i++;
                }
            }
            continue;
        }

        // 3. Backtick identifier: `...`
        if (char === '`') {
            result += ' ';
            i++;
            while (i < n) {
                if (sql[i] === '`') {
                    result += ' ';
                    if (i + 1 < n && sql[i + 1] === '`') {
                        result += ' ';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    result += ' ';
                    i++;
                }
            }
            continue;
        }

        // 4. Bracketed identifier: [...] (MSSQL)
        if (char === '[') {
            result += ' ';
            i++;
            while (i < n) {
                if (sql[i] === ']') {
                    result += ' ';
                    if (i + 1 < n && sql[i + 1] === ']') {
                        result += ' ';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    result += ' ';
                    i++;
                }
            }
            continue;
        }

        // 5. Line comment: -- ... \n
        if (char === '-' && i + 1 < n && sql[i + 1] === '-') {
            result += '  ';
            i += 2;
            while (i < n && sql[i] !== '\n') {
                result += ' ';
                i++;
            }
            if (i < n && sql[i] === '\n') {
                result += '\n';
                i++;
            }
            continue;
        }

        // 6. Block comment: /* ... */
        if (char === '/' && i + 1 < n && sql[i + 1] === '*') {
            result += '  ';
            i += 2;
            while (i < n) {
                if (sql[i] === '*' && i + 1 < n && sql[i + 1] === '/') {
                    result += '  ';
                    i += 2;
                    break;
                }
                result += ' ';
                i++;
            }
            continue;
        }

        result += char;
        i++;
    }

    return result;
}
