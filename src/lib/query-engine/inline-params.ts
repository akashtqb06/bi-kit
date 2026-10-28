import type { SqlDialect } from '@src/lib/connectors/dialects/types';

// ---------------------------------------------------------------------------
// inlineParams
//
// Tokenizes SQL and safely inlines bound parameters as escaped SQL literals.
// Skips parameters inside single-quoted strings, quoted identifiers, and comments.
// Supports ?, $1..$n (PostgreSQL), and @p1..@pn (MSSQL).
// ---------------------------------------------------------------------------

export function inlineParams(sql: string, params: unknown[], dialect?: SqlDialect | string): string {
    if (!params || params.length === 0) {
        return sql;
    }

    const dialectName = typeof dialect === 'string' ? dialect.toLowerCase() : dialect?.name?.toLowerCase() || 'sqlite';
    let paramIndex = 0;
    let result = '';
    let i = 0;
    const n = sql.length;

    while (i < n) {
        const char = sql[i];

        // 1. Single-quoted string literal: '...' (with '' escape)
        if (char === "'") {
            let str = "'";
            i++;
            while (i < n) {
                if (sql[i] === "'") {
                    str += "'";
                    if (i + 1 < n && sql[i + 1] === "'") {
                        str += "'";
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    str += sql[i];
                    i++;
                }
            }
            result += str;
            continue;
        }

        // 2. Double-quoted identifier: "..." (with "" escape)
        if (char === '"') {
            let id = '"';
            i++;
            while (i < n) {
                if (sql[i] === '"') {
                    id += '"';
                    if (i + 1 < n && sql[i + 1] === '"') {
                        id += '"';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    id += sql[i];
                    i++;
                }
            }
            result += id;
            continue;
        }

        // 3. Backtick identifier: `...`
        if (char === '`') {
            let id = '`';
            i++;
            while (i < n) {
                if (sql[i] === '`') {
                    id += '`';
                    if (i + 1 < n && sql[i + 1] === '`') {
                        id += '`';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    id += sql[i];
                    i++;
                }
            }
            result += id;
            continue;
        }

        // 4. Bracketed identifier: [...] (MSSQL)
        if (char === '[') {
            let id = '[';
            i++;
            while (i < n) {
                if (sql[i] === ']') {
                    id += ']';
                    if (i + 1 < n && sql[i + 1] === ']') {
                        id += ']';
                        i += 2;
                    } else {
                        i++;
                        break;
                    }
                } else {
                    id += sql[i];
                    i++;
                }
            }
            result += id;
            continue;
        }

        // 5. Line comment: -- ... \n
        if (char === '-' && i + 1 < n && sql[i + 1] === '-') {
            let comment = '--';
            i += 2;
            while (i < n && sql[i] !== '\n') {
                comment += sql[i];
                i++;
            }
            result += comment;
            continue;
        }

        // 6. Block comment: /* ... */
        if (char === '/' && i + 1 < n && sql[i + 1] === '*') {
            let comment = '/*';
            i += 2;
            while (i < n) {
                if (sql[i] === '*' && i + 1 < n && sql[i + 1] === '/') {
                    comment += '*/';
                    i += 2;
                    break;
                }
                comment += sql[i];
                i++;
            }
            result += comment;
            continue;
        }

        // 7. Postgres placeholder: $1, $2...
        if (char === '$' && (dialectName === 'postgres' || dialectName === 'postgresql') && i + 1 < n && /[0-9]/.test(sql[i + 1])) {
            let phDigits = '';
            let j = i + 1;
            while (j < n && /[0-9]/.test(sql[j])) {
                phDigits += sql[j];
                j++;
            }
            const idx = parseInt(phDigits, 10) - 1;
            if (idx >= 0 && idx < params.length) {
                result += formatSqlLiteral(params[idx]);
            } else {
                result += `$${phDigits}`;
            }
            i = j;
            continue;
        }

        // 8. MSSQL placeholder: @p1, @p2...
        if (char === '@' && (dialectName === 'mssql' || dialectName === 'sqlserver') && sql.slice(i, i + 2).toLowerCase() === '@p' && i + 2 < n && /[0-9]/.test(sql[i + 2])) {
            let phDigits = '';
            let j = i + 2;
            while (j < n && /[0-9]/.test(sql[j])) {
                phDigits += sql[j];
                j++;
            }
            const idx = parseInt(phDigits, 10) - 1;
            if (idx >= 0 && idx < params.length) {
                result += formatSqlLiteral(params[idx]);
            } else {
                result += `@p${phDigits}`;
            }
            i = j;
            continue;
        }

        // 9. Standard positional placeholder: ?
        if (char === '?') {
            if (paramIndex < params.length) {
                const val = params[paramIndex++];
                result += formatSqlLiteral(val);
            } else {
                result += '?';
            }
            i++;
            continue;
        }

        // Regular character
        result += char;
        i++;
    }

    return result;
}

function formatSqlLiteral(val: unknown): string {
    if (val === null || val === undefined) {
        return 'NULL';
    }
    if (typeof val === 'number') {
        return Number.isFinite(val) ? String(val) : 'NULL';
    }
    if (typeof val === 'bigint') {
        return val.toString();
    }
    if (typeof val === 'boolean') {
        return val ? '1' : '0';
    }
    if (val instanceof Date) {
        return `'${val.toISOString()}'`;
    }
    if (typeof val === 'string') {
        return `'${val.replace(/'/g, "''")}'`;
    }
    return `'${String(val).replace(/'/g, "''")}'`;
}
