import type { z } from 'zod';
export * from './errors';

// ---------------------------------------------------------------------------
// Field & Capability Metadata
// ---------------------------------------------------------------------------

export type FieldKind = 'text' | 'number' | 'password' | 'select' | 'boolean' | 'textarea' | 'file';

export interface SelectOption {
    label: string;
    value: string | number;
}

export interface FieldSpec {
    name: string;
    label: string;
    kind: FieldKind;
    placeholder?: string;
    default?: unknown;
    required?: boolean;
    secret?: boolean;
    advanced?: boolean;
    helpText?: string;
    showIf?: Record<string, unknown>;
    options?: SelectOption[];
}

export type ConnectorOperation = 'filter' | 'join' | 'mutate' | 'summarize' | 'select' | 'order' | 'limit';

export interface ConnectorCapabilities {
    rawQuery: 'sql' | 'mongo-pipeline' | null;
    dialect?: string;
    operations: ConnectorOperation[];
    supportsSchemas: boolean;
    supportsViews: boolean;
}

// ---------------------------------------------------------------------------
// Connector Definition
// ---------------------------------------------------------------------------

export type ConnectorCategory = 'sql' | 'nosql' | 'file';

export interface ConnectorContext {
    dataSourceId?: string;
    dataDir?: string;
}

export interface ConnectorDefinition<TConfig = Record<string, unknown>> {
    type: string;
    label: string;
    category: ConnectorCategory;
    description: string;
    icon: string; // lucide icon name, e.g. 'Database', 'FileSpreadsheet'
    configSchema: z.ZodType<TConfig>;
    fields: FieldSpec[];
    capabilities: ConnectorCapabilities;
    create(config: TConfig, ctx?: ConnectorContext): Connector;
}

export interface PublicConnectorDefinition {
    type: string;
    label: string;
    category: ConnectorCategory;
    description: string;
    icon: string;
    fields: FieldSpec[];
    capabilities: ConnectorCapabilities;
    allowed?: boolean;
}

// ---------------------------------------------------------------------------
// Introspection & Snapshot Types
// ---------------------------------------------------------------------------

export type ColumnDataType = 'text' | 'number' | 'date' | 'boolean' | 'json' | 'binary' | 'id';

export interface ColumnSnapshot {
    name: string;
    type: ColumnDataType;
    nativeType: string;
    nullable?: boolean;
    isPrimaryKey?: boolean;
}

export interface TableSnapshot {
    name: string;
    schema?: string;
    kind: 'table' | 'view' | 'collection';
    rowCountEstimate?: number;
    columns: ColumnSnapshot[];
}

export interface SchemaSnapshot {
    schemas?: string[];
    tables: TableSnapshot[];
    fetchedAt?: string;
}

// ---------------------------------------------------------------------------
// Query Request & Result
// ---------------------------------------------------------------------------

export type QueryRequest =
    | { kind: 'sql'; sql: string; params?: unknown[] }
    | { kind: 'mongo'; collection: string; pipeline: unknown[] };

export interface QueryExecutionOptions {
    limit?: number;
    offset?: number;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface QueryResult {
    columns: string[];
    rows: unknown[][];
    rowCount: number;
    truncated: boolean;
    durationMs: number;
}

export interface TestResult {
    ok: boolean;
    latencyMs: number;
    serverVersion?: string;
    message?: string;
    warnings?: string[];
}

// ---------------------------------------------------------------------------
// Primary Connector Interface
// ---------------------------------------------------------------------------

export interface Connector {
    test(): Promise<TestResult>;
    introspect(opts?: { schemas?: string[]; sampleSize?: number; signal?: AbortSignal }): Promise<SchemaSnapshot>;
    run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult>;
    close(): Promise<void>;

    // Backward-compatibility methods for existing tests/callers:
    testConnection?(): void | Promise<void>;
    getSchema?(): SchemaInfo | Promise<SchemaInfo>;
    getTables?(): string[] | Promise<string[]>;
    getColumns?(table: string): ColumnInfo[] | Promise<ColumnInfo[]>;
    execute?(sql: string, params: SqlParam[], options: ExecuteOptions): Promise<QueryResult>;
}

// ---------------------------------------------------------------------------
// Legacy / Compatibility Types (used across existing query-engine & tests)
// ---------------------------------------------------------------------------

export type SqlParam = string | number | bigint | Buffer | null;

export interface ColumnInfo {
    name: string;
    type: string;
    nullable: boolean;
}

export interface TableSchema {
    name: string;
    schema?: string;
    kind?: 'table' | 'view' | 'collection';
    rowCountEstimate?: number;
    columns: ColumnInfo[];
}

export interface SchemaInfo {
    tables: TableSchema[];
}

export interface ExecuteOptions {
    limit: number;
    timeoutMs: number;
}
