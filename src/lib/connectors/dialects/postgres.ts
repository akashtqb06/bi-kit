import type { SqlDialect, DateGrain, CastType, DialectAggFn } from './types';

export class PostgresDialect implements SqlDialect {
    readonly name = 'postgres';
    readonly supportsOrderByInCte = true;

    quoteIdent(name: string): string {
        return '"' + name.replace(/"/g, '""') + '"';
    }

    placeholder(index: number): string {
        return `$${index}`;
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
                return `date_trunc('year', ${col})`;
            case 'quarter':
                return `date_trunc('quarter', ${col})`;
            case 'month':
                return `date_trunc('month', ${col})`;
            case 'week':
                return `date_trunc('week', ${col})`;
            case 'day':
                return `date_trunc('day', ${col})`;
            case 'hour':
                return `date_trunc('hour', ${col})`;
            default:
                return `date_trunc('day', ${col})`;
        }
    }

    castExpr(col: string, type: CastType): string {
        switch (type) {
            case 'text':
                return `CAST(${col} AS text)`;
            case 'integer':
                return `CAST(${col} AS integer)`;
            case 'decimal':
                return `CAST(${col} AS numeric)`;
            case 'datetime':
                return `CAST(${col} AS timestamp)`;
        }
    }

    concatExpr(parts: string[]): string {
        return parts.join(' || ');
    }

    containsExpr(col: string, paramPlaceholder: string, caseInsensitive = true): string {
        return caseInsensitive ? `${col} ILIKE ${paramPlaceholder}` : `${col} LIKE ${paramPlaceholder}`;
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
        return value ? 'TRUE' : 'FALSE';
    }
}

export const postgresDialect = new PostgresDialect();
