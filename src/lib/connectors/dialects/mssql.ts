import type { SqlDialect, DateGrain, CastType, DialectAggFn } from './types';

export class MssqlDialect implements SqlDialect {
    readonly name = 'mssql';
    readonly supportsOrderByInCte = false;

    quoteIdent(name: string): string {
        return '[' + name.replace(/\]/g, ']]') + ']';
    }

    placeholder(index: number): string {
        return `@p${index}`;
    }

    stringLiteral(value: string): string {
        return "N'" + value.replace(/'/g, "''") + "'";
    }

    paginate(sql: string, limit: number, offset: number): string {
        let clean = sql.trim().replace(/;+$/, '');
        // SQL Server OFFSET ... FETCH NEXT strictly requires an ORDER BY clause.
        // If there is no ORDER BY in the outer query, append ORDER BY (SELECT NULL).
        const hasOrderBy = /\bORDER\s+BY\b/i.test(clean);
        if (!hasOrderBy) {
            clean += ' ORDER BY (SELECT NULL)';
        }
        return `${clean} OFFSET ${offset} ROWS FETCH NEXT ${limit} ROWS ONLY`;
    }

    dateTruncExpr(col: string, grain: DateGrain | string): string {
        switch (grain) {
            case 'year':
                return `DATEADD(year, DATEDIFF(year, 0, ${col}), 0)`;
            case 'quarter':
                return `CONCAT(YEAR(${col}), '-Q', DATEPART(quarter, ${col}))`;
            case 'month':
                return `DATEADD(month, DATEDIFF(month, 0, ${col}), 0)`;
            case 'week':
                return `DATEADD(week, DATEDIFF(week, 0, ${col}), 0)`;
            case 'day':
                return `DATEADD(day, DATEDIFF(day, 0, ${col}), 0)`;
            case 'hour':
                return `DATEADD(hour, DATEDIFF(hour, 0, ${col}), 0)`;
            default:
                return `DATEADD(day, DATEDIFF(day, 0, ${col}), 0)`;
        }
    }

    castExpr(col: string, type: CastType): string {
        switch (type) {
            case 'text':
                return `CAST(${col} AS NVARCHAR(MAX))`;
            case 'integer':
                return `CAST(${col} AS BIGINT)`;
            case 'decimal':
                return `CAST(${col} AS DECIMAL(38,10))`;
            case 'datetime':
                return `CAST(${col} AS DATETIME2)`;
        }
    }

    concatExpr(parts: string[]): string {
        return `CONCAT(${parts.join(', ')})`;
    }

    containsExpr(col: string, paramPlaceholder: string): string {
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

export const mssqlDialect = new MssqlDialect();
