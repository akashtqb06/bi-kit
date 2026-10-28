import pg from 'pg';
import {
    type Connector,
    type ConnectorContext,
    type QueryRequest,
    type QueryExecutionOptions,
    type QueryResult,
    type SchemaSnapshot,
    type TableSnapshot,
    type ColumnSnapshot,
    type ColumnDataType,
    type TestResult,
    ConnectorError,
} from '../../types';
import { normalizeRows } from '../../normalize';
import { assertHostAllowed } from '../../network-guard';
import { redactSecrets } from '../../secrets';
import { validateReadOnly } from '@src/lib/query-engine/validate-readonly';
import type { PostgresConfig } from './definition';

function mapPgType(dataType: string, udtName: string): ColumnDataType {
    const dt = (dataType || '').toLowerCase();
    const udt = (udtName || '').toLowerCase();

    if (dt.includes('int') || udt.includes('int') || dt.includes('numeric') || dt.includes('float') || dt.includes('double') || dt.includes('real')) {
        return 'number';
    }
    if (dt === 'boolean' || udt === 'bool') {
        return 'boolean';
    }
    if (dt.includes('date') || dt.includes('time') || udt.includes('date') || udt.includes('time') || udt.includes('timestamp')) {
        return 'date';
    }
    if (dt.includes('json') || udt.includes('json')) {
        return 'json';
    }
    if (dt === 'bytea' || udt === 'bytea') {
        return 'binary';
    }
    if (dt === 'uuid' || udt === 'uuid') {
        return 'id';
    }
    return 'text';
}

function parseConnectionUrl(urlStr: string): Partial<PostgresConfig> {
    try {
        const parsed = new URL(urlStr);
        return {
            host: parsed.hostname,
            port: parsed.port ? parseInt(parsed.port, 10) : 5432,
            database: parsed.pathname.replace(/^\//, ''),
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            ssl: parsed.searchParams.get('sslmode') === 'require' ? 'require' : 'disable',
        };
    } catch {
        return {};
    }
}

export class PostgresConnector implements Connector {
    private pool: pg.Pool;
    private host: string;
    private port: number;
    private database: string;
    private sslMode: string;
    private schemas: string[];
    private queryTimeoutMs: number;
    private connectTimeoutMs: number;

    constructor(config: PostgresConfig, _ctx?: ConnectorContext) {
        let merged = { ...config };
        if (config.connectionUrl) {
            merged = { ...merged, ...parseConnectionUrl(config.connectionUrl) };
        }

        this.host = merged.host;
        this.port = merged.port || 5432;
        this.database = merged.database;
        this.sslMode = merged.ssl || 'disable';
        this.schemas = merged.schemas || ['public'];
        this.queryTimeoutMs = merged.queryTimeoutMs || 30000;
        this.connectTimeoutMs = merged.connectTimeoutMs || 10000;

        let sslConfig: boolean | pg.ConnectionConfig['ssl'] = false;
        if (this.sslMode === 'require') {
            sslConfig = {
                rejectUnauthorized: false,
                ca: merged.caCert || undefined,
            };
        } else if (this.sslMode === 'verify-full') {
            sslConfig = {
                rejectUnauthorized: true,
                ca: merged.caCert || undefined,
            };
        }

        this.pool = new pg.Pool({
            host: this.host,
            port: this.port,
            database: this.database,
            user: merged.username,
            password: merged.password,
            ssl: sslConfig,
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: this.connectTimeoutMs,
            application_name: 'bi-kit',
        });

        // Safe integer & numeric parser for pg-types
        // INT8 (bigint): parse to number when safe, otherwise string
        pg.types.setTypeParser(20, (val: string) => {
            if (val === null) return null;
            const bi = BigInt(val);
            if (bi >= BigInt(Number.MIN_SAFE_INTEGER) && bi <= BigInt(Number.MAX_SAFE_INTEGER)) {
                return Number(bi);
            }
            return val;
        });

        // NUMERIC / DECIMAL: parse as float
        pg.types.setTypeParser(1700, (val: string) => {
            if (val === null) return null;
            const n = parseFloat(val);
            return Number.isFinite(n) ? n : val;
        });
    }

    private mapError(err: unknown): Error {
        if (err instanceof ConnectorError) return err;
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as Record<string, unknown>)?.code as string | undefined;

        let mapped = msg;
        let mappedCode = 'DB_ERROR';

        if (code === '28P01' || code === '28000') {
            mapped = 'Authentication failed: invalid username or password.';
            mappedCode = 'AUTH_FAILED';
        } else if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
            mapped = `Host "${this.host}:${this.port}" is unreachable or refused the connection.`;
            mappedCode = 'HOST_UNREACHABLE';
        } else if (code === '57014' || msg.toLowerCase().includes('statement timeout')) {
            mapped = 'Query exceeded its configured execution time limit.';
            mappedCode = 'QUERY_TIMEOUT';
        } else if (code === '42501') {
            mapped = `Permission denied: ${msg}`;
            mappedCode = 'PERMISSION_DENIED';
        } else if (code === '42601') {
            mapped = `SQL syntax error: ${msg}`;
            mappedCode = 'SYNTAX_ERROR';
        } else if (msg.includes('self signed certificate') || msg.includes('certificate')) {
            mapped = `TLS/SSL certificate error: ${msg}`;
            mappedCode = 'TLS_ERROR';
        }

        const safeMessage = redactSecrets(mapped);
        return new ConnectorError(safeMessage, mappedCode, err);
    }

    async test(): Promise<TestResult> {
        await assertHostAllowed(this.host, this.port);
        const start = Date.now();
        const client = await this.pool.connect().catch((e) => {
            throw this.mapError(e);
        });

        try {
            const res = await client.query('SELECT version() AS version');
            const latencyMs = Math.max(1, Date.now() - start);
            const version = res.rows[0]?.version || 'PostgreSQL';

            const warnings: string[] = [];
            const isLoopback = this.host === 'localhost' || this.host === '127.0.0.1' || this.host === '::1';
            if (this.sslMode === 'disable' && !isLoopback) {
                warnings.push('Connection is not encrypted. We strongly recommend enabling SSL/TLS in production.');
            }
            warnings.push('For security, ensure the database user has read-only permissions (GRANT SELECT only).');

            return {
                ok: true,
                latencyMs,
                serverVersion: version,
                message: 'Connected to PostgreSQL database successfully.',
                warnings,
            };
        } catch (err) {
            throw this.mapError(err);
        } finally {
            client.release();
        }
    }

    async introspect(opts?: { schemas?: string[]; signal?: AbortSignal }): Promise<SchemaSnapshot> {
        await assertHostAllowed(this.host, this.port);
        const schemas = opts?.schemas || this.schemas;
        const client = await this.pool.connect().catch((e) => {
            throw this.mapError(e);
        });

        try {
            // 1. Fetch tables and views
            const tableQuery = `
                SELECT 
                    t.table_schema, 
                    t.table_name, 
                    t.table_type,
                    c.reltuples AS row_count_estimate
                FROM information_schema.tables t
                LEFT JOIN pg_namespace n ON n.nspname = t.table_schema
                LEFT JOIN pg_class c ON c.relnamespace = n.oid AND c.relname = t.table_name
                WHERE t.table_schema = ANY($1::text[])
                ORDER BY t.table_schema, t.table_name;
            `;
            const tableRows = await client.query(tableQuery, [schemas]);

            // 2. Fetch columns
            const colQuery = `
                SELECT 
                    table_schema, 
                    table_name, 
                    column_name, 
                    data_type, 
                    udt_name, 
                    is_nullable, 
                    ordinal_position
                FROM information_schema.columns
                WHERE table_schema = ANY($1::text[])
                ORDER BY table_schema, table_name, ordinal_position;
            `;
            const colRows = await client.query(colQuery, [schemas]);

            // 3. Fetch primary keys
            const pkQuery = `
                SELECT 
                    kcu.table_schema, 
                    kcu.table_name, 
                    kcu.column_name
                FROM information_schema.table_constraints tc
                JOIN information_schema.key_column_usage kcu
                    ON tc.constraint_name = kcu.constraint_name 
                    AND tc.table_schema = kcu.table_schema
                WHERE tc.constraint_type = 'PRIMARY KEY'
                    AND tc.table_schema = ANY($1::text[]);
            `;
            const pkRows = await client.query(pkQuery, [schemas]);

            const pkSet = new Set(
                pkRows.rows.map((r) => `${r.table_schema}.${r.table_name}.${r.column_name}`)
            );

            // Group columns by table
            const colMap = new Map<string, ColumnSnapshot[]>();
            for (const col of colRows.rows) {
                const key = `${col.table_schema}.${col.table_name}`;
                if (!colMap.has(key)) colMap.set(key, []);
                colMap.get(key)!.push({
                    name: col.column_name,
                    type: mapPgType(col.data_type, col.udt_name),
                    nativeType: col.data_type || col.udt_name,
                    nullable: col.is_nullable === 'YES',
                    isPrimaryKey: pkSet.has(`${key}.${col.column_name}`),
                });
            }

            const tables: TableSnapshot[] = tableRows.rows.map((t) => {
                const key = `${t.table_schema}.${t.table_name}`;
                const rawEstimate = Number(t.row_count_estimate);
                return {
                    name: t.table_name,
                    schema: t.table_schema,
                    kind: t.table_type === 'VIEW' ? 'view' : 'table',
                    rowCountEstimate: rawEstimate >= 0 ? Math.round(rawEstimate) : undefined,
                    columns: colMap.get(key) || [],
                };
            });

            return { schemas, tables };
        } catch (err) {
            throw this.mapError(err);
        } finally {
            client.release();
        }
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'sql') {
            throw new ConnectorError('PostgreSQL connector only supports SQL queries.', 'UNSUPPORTED_REQUEST');
        }

        await assertHostAllowed(this.host, this.port);
        validateReadOnly(request.sql, 'postgres');

        const limit = Math.min(10000, opts?.limit ?? 1000);
        const timeoutMs = opts?.timeoutMs ?? this.queryTimeoutMs;
        const fetchLimit = limit + 1; // +1 to detect truncation

        const client = await this.pool.connect().catch((e) => {
            throw this.mapError(e);
        });

        const start = Date.now();
        let aborted = false;

        const onAbort = () => {
            aborted = true;
            // Terminate query backend client
            void (client as unknown as { connection?: { destroy?: () => void } }).connection?.destroy?.();
        };

        if (opts?.signal) {
            opts.signal.addEventListener('abort', onAbort, { once: true });
        }

        try {
            // Read-only transaction sandbox with statement timeout
            await client.query('BEGIN READ ONLY');
            await client.query(`SET LOCAL statement_timeout = ${Math.max(1000, timeoutMs)}`);

            // Execute query with wrapped LIMIT + 1 if not already capped
            let querySql = request.sql.trim().replace(/;+$/, '');
            const hasLimit = /\bLIMIT\s+\d+/i.test(querySql);
            if (!hasLimit) {
                querySql = `SELECT * FROM (${querySql}) AS __capped LIMIT ${fetchLimit}`;
            }

            const res = await client.query({
                text: querySql,
                values: request.params || [],
                rowMode: 'array',
            });

            await client.query('ROLLBACK');

            const columns = res.fields ? res.fields.map((f) => f.name) : [];
            let rows = res.rows as unknown[][];
            let truncated = false;

            if (rows.length > limit) {
                truncated = true;
                rows = rows.slice(0, limit);
            }

            const durationMs = Math.max(1, Date.now() - start);

            return {
                columns,
                rows: normalizeRows(rows),
                rowCount: rows.length,
                truncated,
                durationMs,
            };
        } catch (err) {
            try {
                await client.query('ROLLBACK');
            } catch {
                // ignore rollback failure
            }
            if (aborted) {
                throw new ConnectorError('Query execution was aborted.', 'QUERY_ABORTED');
            }
            throw this.mapError(err);
        } finally {
            if (opts?.signal) {
                opts.signal.removeEventListener('abort', onAbort);
            }
            client.release();
        }
    }

    async close(): Promise<void> {
        try {
            await this.pool.end();
        } catch {
            // best-effort pool termination
        }
    }
}
