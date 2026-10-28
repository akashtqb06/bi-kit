import type { SqlDialect, DateGrain, CastType, DialectAggFn } from './types';

export class MysqlDialect implements SqlDialect {
    readonly name = 'mysql';
    readonly supportsOrderByInCte = true;

    quoteIdent(name: string): string {
        return '`' + name.replace(/`/g, '``') + '`';
    }

    placeholder(): string {
        return '?';
    }

    stringLiteral(value: string): string {
        return "'" + value.replace(/\\/g, '\\\\').replace(/'/g, "''") + "'";
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
                return `DATE_FORMAT(${col}, '%Y')`;
            case 'quarter':
                return `CONCAT(YEAR(${col}), '-Q', QUARTER(${col}))`;
            case 'month':
                return `DATE_FORMAT(${col}, '%Y-%m')`;
            case 'week':
                return `DATE_FORMAT(${col}, '%Y-W%v')`;
            case 'day':
                return `DATE_FORMAT(${col}, '%Y-%m-%d')`;
            case 'hour':
                return `DATE_FORMAT(${col}, '%Y-%m-%d %H')`;
            default:
                return `DATE_FORMAT(${col}, '%Y-%m-%d')`;
        }
    }

    castExpr(col: string, type: CastType): string {
        switch (type) {
            case 'text':
                return `CAST(${col} AS CHAR)`;
            case 'integer':
                return `CAST(${col} AS SIGNED)`;
            case 'decimal':
                return `CAST(${col} AS DECIMAL(18,4))`;
            case 'datetime':
                return `CAST(${col} AS DATETIME)`;
        }
    }

    concatExpr(parts: string[]): string {
        return `CONCAT(${parts.join(', ')})`;
    }

    containsExpr(col: string, paramPlaceholder: string, caseInsensitive = true): string {
        return caseInsensitive
            ? `${col} LIKE ${paramPlaceholder} COLLATE utf8mb4_general_ci`
            : `${col} LIKE ${paramPlaceholder} COLLATE utf8mb4_bin`;
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

export const mysqlDialect = new MysqlDialect();
