export type DateGrain = 'day' | 'week' | 'month' | 'quarter' | 'year';
export type CastType = 'text' | 'integer' | 'decimal' | 'datetime';
export type DialectAggFn = 'count' | 'sum' | 'avg' | 'min' | 'max' | 'count_distinct';

export interface SqlDialect {
    readonly name: string;
    quoteIdent(name: string): string;
    placeholder(index: number): string; // 1-based index (e.g. ? for SQLite/MySQL, $1 for Postgres, @p1 for MSSQL)
    stringLiteral?(value: string): string;
    paginate(sql: string, limit: number, offset: number): string;
    dateTruncExpr(col: string, grain: DateGrain | string): string;
    castExpr(col: string, type: CastType): string;
    concatExpr(parts: string[]): string;
    containsExpr(col: string, paramPlaceholder: string, caseInsensitive?: boolean): string;
    aggregateExpr(fn: DialectAggFn, col: string): string;
    booleanLiteral(value: boolean): string;
    readonly supportsOrderByInCte: boolean;
}
