import Database from 'better-sqlite3';

// ---------------------------------------------------------------------------
// validateReadOnly
//
// Used for raw SQL mode. Opens the SQL string against a temporary in-memory
// SQLite and checks that the prepared statement is flagged as a reader.
// This is defense-in-depth atop the readonly connection in SqliteConnector.
//
// Throws a ValidationError if the SQL is not a read-only SELECT/WITH.
// ---------------------------------------------------------------------------

export class ReadOnlyValidationError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ReadOnlyValidationError';
    }
}

/**
 * Validate that `sql` is a single read-only SELECT (or read-only WITH) statement.
 *
 * Strategy:
 * 1. Prepare the statement against an in-memory SQLite to catch syntax errors.
 * 2. Assert `stmt.reader === true` — SQLite marks non-SELECT statements as writers.
 * 3. Reject if the normalized SQL contains multiple statements (bare `;` separator).
 */
export function validateReadOnly(sql: string): void {
    validateReadOnlyShape(sql);

    // Keep the standalone validator useful for syntax and reader-flag checks.
    // Query routes use validateReadOnlyShape and validate against the real source
    // when SqliteConnector prepares and executes the statement.
    let db: Database.Database | undefined;
    try {
        db = new Database(':memory:');
        const stmt = db.prepare(sql);

        if (!stmt.reader || !stmt.readonly) {
            throw new ReadOnlyValidationError(
                'Only read-only SELECT statements are permitted. Write operations are not allowed.'
            );
        }
    } finally {
        db?.close();
    }
}

const FORBIDDEN_KEYWORDS = new Set([
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
]);

export function validateReadOnlyShape(sql: string): void {
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

    for (const token of tokens) {
        const upper = token.toUpperCase();
        if (FORBIDDEN_KEYWORDS.has(upper)) {
            throw new ReadOnlyValidationError(
                `Forbidden operation "${upper}". Only read-only SELECT or WITH statements are allowed.`
            );
        }
    }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

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

        // 4. Line comment: -- ... \n
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

        // 5. Block comment: /* ... */
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

