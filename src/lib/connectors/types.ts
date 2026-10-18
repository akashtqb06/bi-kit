// ---------------------------------------------------------------------------
// Connector interface — all data source adapters implement this contract
// ---------------------------------------------------------------------------

export type SqlParam = string | number | bigint | Buffer | null;

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

export interface TableSchema {
    name: string;
    columns: ColumnInfo[];
}

export interface SchemaInfo {
    tables: TableSchema[];
}

export interface QueryResult {
    columns: string[];
    rows: SqlParam[][];
    rowCount: number;
    truncated: boolean;
    executionTimeMs: number;
}

export interface ExecuteOptions {
    limit: number;
    timeoutMs: number;
}

export interface Connector {
    /** Verify the source is reachable and readable; throws ConnectorError on failure */
    testConnection(): void;
    /** Return schema info (all tables + columns) */
    getSchema(): SchemaInfo;
    /** Return list of table names */
    getTables(): string[];
    /** Return column metadata for a single table */
    getColumns(table: string): ColumnInfo[];
    /** Execute a read-only SELECT query with row/timeout limits */
    execute(sql: string, params: SqlParam[], options: ExecuteOptions): Promise<QueryResult>;
    /** Release the underlying DB handle */
    close(): void;
}

// ---------------------------------------------------------------------------
// Error types
// ---------------------------------------------------------------------------

export class ConnectorError extends Error {
    constructor(
        message: string,
        public readonly code?: string
    ) {
        super(message);
        this.name = 'ConnectorError';
    }
}

export class NotFoundError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'NotFoundError';
    }
}

export class ConflictError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'ConflictError';
    }
}
