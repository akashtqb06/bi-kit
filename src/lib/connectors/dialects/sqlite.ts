import type { SqlDialect, DateGrain, CastType, DialectAggFn } from './types';

export class SqliteDialect implements SqlDialect {
    readonly name = 'sqlite';
    readonly supportsOrderByInCte = true;

    quoteIdent(name: string): string {
        return '"' + name.replace(/"/g, '""') + '"';
    }

    placeholder(): string {
        return '?';
    }

    stringLiteral(value: string): string {
        return "'" + value.replace(/'/g, "''") + "'";
    }

    paginate(sql: string, limit: number, offset: number): string {
        const clean = sql.trim().replace(/;+$/, '');
        if (offset > 0) {
            return `${clean} LIMIT ${limit} OFFSET ${offset}`;
        }
        return `${clean} LIMIT ${limit}`;
    }

    dateTruncExpr(col: string, grain: DateGrain | string): string {
        switch (grain) {
            case 'year':
                return `strftime('%Y', ${col})`;
            case 'quarter':
                return `(strftime('%Y', ${col}) || '-Q' || ((CAST(strftime('%m', ${col}) AS INTEGER) + 2) / 3))`;
            case 'month':
                return `strftime('%Y-%m', ${col})`;
            case 'week':
                return `strftime('%Y-W%W', ${col})`;
            case 'day':
                return `strftime('%Y-%m-%d', ${col})`;
            case 'hour':
                return `strftime('%Y-%m-%d %H', ${col})`;
            default:
                return `strftime('%Y-%m-%d', ${col})`;
        }
    }

    castExpr(col: string, type: CastType): string {
        switch (type) {
            case 'text':
                return `CAST(${col} AS TEXT)`;
            case 'integer':
                return `CAST(${col} AS INTEGER)`;
            case 'decimal':
                return `CAST(${col} AS REAL)`;
            case 'datetime':
                return `datetime(${col})`;
        }
    }

    concatExpr(parts: string[]): string {
        return parts.join(' || ');
    }

    containsExpr(col: string, paramPlaceholder: string): string {
        // SQLite LIKE is case-insensitive for ASCII characters by default
        return `${col} LIKE ${paramPlaceholder}`;
    }

    aggregateExpr(fn: DialectAggFn, col: string): string {
        switch (fn) {
            case 'count':
                return `COUNT(${col})`;
            case 'sum':
                return `SUM(${col})`;
            case 'avg':
                return `AVG(${col})`;
            case 'min':
                return `MIN(${col})`;
            case 'max':
                return `MAX(${col})`;
            case 'count_distinct':
                return `COUNT(DISTINCT ${col})`;
        }
    }

    booleanLiteral(value: boolean): string {
        return value ? '1' : '0';
    }
}

export const sqliteDialect = new SqliteDialect();
