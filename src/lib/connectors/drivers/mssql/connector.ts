import mssql from 'mssql';
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
import type { MssqlConfig } from './definition';

function mapMssqlType(dataType: string): ColumnDataType {
    const dt = (dataType || '').toLowerCase();
    if (
        dt.includes('int') ||
        dt.includes('decimal') ||
        dt.includes('numeric') ||
        dt.includes('float') ||
        dt.includes('real') ||
        dt.includes('money')
    ) {
        return 'number';
    }
    if (dt === 'bit') {
        return 'boolean';
    }
    if (dt.includes('date') || dt.includes('time')) {
        return 'date';
    }
    if (dt.includes('binary') || dt === 'image') {
        return 'binary';
    }
    if (dt === 'uniqueidentifier') {
        return 'id';
    }
    return 'text';
}

function parseConnectionUrl(urlStr: string): Partial<MssqlConfig> {
    try {
        const parsed = new URL(urlStr);
        return {
            host: parsed.hostname,
            port: parsed.port ? parseInt(parsed.port, 10) : 1433,
            database: parsed.searchParams.get('database') || parsed.pathname.replace(/^\//, ''),
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
            trustServerCertificate: parsed.searchParams.get('trustServerCertificate') === 'true',
        };
    } catch {
        return {};
    }
}

export class MssqlConnector implements Connector {
    private pool: mssql.ConnectionPool;
    private host: string;
    private port: number;
    private database: string;
    private schemas: string[];
    private trustServerCert: boolean;
    private queryTimeoutMs: number;
    private connectPromise: Promise<mssql.ConnectionPool> | null = null;

    constructor(config: MssqlConfig, _ctx?: ConnectorContext) {
        let merged = { ...config };
        if (config.connectionUrl) {
            merged = { ...merged, ...parseConnectionUrl(config.connectionUrl) };
        }

        this.host = merged.host;
        this.port = merged.port || 1433;
        this.database = merged.database;
        this.schemas = merged.schemas || ['dbo'];
        this.trustServerCert = Boolean(merged.trustServerCertificate);
        this.queryTimeoutMs = merged.queryTimeoutMs || 30000;

        const sqlConfig: mssql.config = {
            server: this.host,
            port: this.port,
            database: this.database,
            user: merged.username,
            password: merged.password,
            pool: {
                max: 5,
                min: 0,
                idleTimeoutMillis: 30000,
            },
            connectionTimeout: merged.connectTimeoutMs || 10000,
            requestTimeout: merged.queryTimeoutMs || 30000,
            options: {
                instanceName: merged.instanceName || undefined,
                encrypt: merged.encrypt ?? true,
                trustServerCertificate: this.trustServerCert,
                appName: 'bi-kit',
            },
        };

        this.pool = new mssql.ConnectionPool(sqlConfig);
    }

    private async ensureConnected(): Promise<mssql.ConnectionPool> {
        if (this.pool.connected) return this.pool;
        if (!this.connectPromise) {
            this.connectPromise = this.pool.connect().catch((e) => {
                this.connectPromise = null;
                throw this.mapError(e);
            });
        }
        return this.connectPromise;
    }

    private mapError(err: unknown): Error {
        if (err instanceof ConnectorError) return err;
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as Record<string, unknown>)?.code as string | undefined;

        let mapped = msg;
        let mappedCode = 'DB_ERROR';

        if (code === 'ELOGIN' || msg.includes('Login failed')) {
            mapped = 'Authentication failed: invalid SQL Server username or password.';
            mappedCode = 'AUTH_FAILED';
        } else if (code === 'ETIMEOUT' || msg.includes('timeout')) {
            mapped = 'Query execution timed out.';
            mappedCode = 'QUERY_TIMEOUT';
        } else if (code === 'ESOCKET' || code === 'ECONNREFUSED' || msg.includes('Failed to connect')) {
            mapped = `Host "${this.host}:${this.port}" is unreachable or refused the connection.`;
            mappedCode = 'HOST_UNREACHABLE';
        } else if (msg.includes('permission was denied')) {
            mapped = `Permission denied: ${msg}`;
            mappedCode = 'PERMISSION_DENIED';
        }

        return new ConnectorError(redactSecrets(mapped), mappedCode, err);
    }

    async test(): Promise<TestResult> {
        await assertHostAllowed(this.host, this.port);
        const start = Date.now();
        const pool = await this.ensureConnected();

        try {
            const req = pool.request();
            const res = await req.query('SELECT @@VERSION AS version');
            const latencyMs = Math.max(1, Date.now() - start);
            const versionStr = res.recordset[0]?.version || 'SQL Server';

            const warnings: string[] = [];
            if (this.trustServerCert) {
                warnings.push('trustServerCertificate is enabled; TLS certificate validation is bypassed.');
            }
            warnings.push('For security, ensure the SQL Server login belongs to the db_datareader database role.');

            return {
                ok: true,
                latencyMs,
                serverVersion: versionStr.split('\n')[0],
                message: 'Connected to Microsoft SQL Server successfully.',
                warnings,
            };
        } catch (err) {
            throw this.mapError(err);
        }
    }

    async introspect(opts?: { schemas?: string[]; signal?: AbortSignal }): Promise<SchemaSnapshot> {
        await assertHostAllowed(this.host, this.port);
        const schemas = opts?.schemas || this.schemas;
        const pool = await this.ensureConnected();

        try {
            const req = pool.request();
            schemas.forEach((schema, idx) => {
                req.input(`schema_${idx}`, schema);
            });
            const schemaPlaceholders = schemas.map((_, idx) => `@schema_${idx}`).join(', ');

            // 1. Fetch tables and views
            const tableSql = `
                SELECT 
                    t.TABLE_SCHEMA, 
                    t.TABLE_NAME, 
                    t.TABLE_TYPE,
                    COALESCE(p.row_count_estimate, 0) AS row_count_estimate
                FROM INFORMATION_SCHEMA.TABLES t
                LEFT JOIN (
                    SELECT 
                        s.name AS schema_name, 
                        tbl.name AS table_name, 
                        SUM(p.row_count) AS row_count_estimate
                    FROM sys.tables tbl
                    JOIN sys.schemas s ON s.schema_id = tbl.schema_id
                    JOIN sys.dm_db_partition_stats p ON tbl.object_id = p.object_id
                    WHERE p.index_id IN (0, 1)
                    GROUP BY s.name, tbl.name
                ) p ON p.schema_name = t.TABLE_SCHEMA AND p.table_name = t.TABLE_NAME
                WHERE t.TABLE_SCHEMA IN (${schemaPlaceholders})
                ORDER BY t.TABLE_SCHEMA, t.TABLE_NAME;
            `;
            const tableRes = await req.query(tableSql);

            // 2. Fetch columns
            const colSql = `
                SELECT 
                    TABLE_SCHEMA, 
                    TABLE_NAME, 
                    COLUMN_NAME, 
                    DATA_TYPE, 
                    IS_NULLABLE, 
                    ORDINAL_POSITION
                FROM INFORMATION_SCHEMA.COLUMNS
                WHERE TABLE_SCHEMA IN (${schemaPlaceholders})
                ORDER BY TABLE_SCHEMA, TABLE_NAME, ORDINAL_POSITION;
            `;
            const colRes = await req.query(colSql);

            // 3. Fetch primary keys
            const pkSql = `
                SELECT 
                    kcu.TABLE_SCHEMA, 
                    kcu.TABLE_NAME, 
                    kcu.COLUMN_NAME
                FROM INFORMATION_SCHEMA.TABLE_CONSTRAINTS tc
                JOIN INFORMATION_SCHEMA.KEY_COLUMN_USAGE kcu
                    ON tc.CONSTRAINT_NAME = kcu.CONSTRAINT_NAME 
                    AND tc.TABLE_SCHEMA = kcu.TABLE_SCHEMA
                WHERE tc.CONSTRAINT_TYPE = 'PRIMARY KEY'
                    AND tc.TABLE_SCHEMA IN (${schemaPlaceholders});
            `;
            const pkRes = await req.query(pkSql);

            const pkSet = new Set(
                pkRes.recordset.map((r) => `${r.TABLE_SCHEMA}.${r.TABLE_NAME}.${r.COLUMN_NAME}`)
            );

            const colMap = new Map<string, ColumnSnapshot[]>();
            for (const col of colRes.recordset) {
                const key = `${col.TABLE_SCHEMA}.${col.TABLE_NAME}`;
                if (!colMap.has(key)) colMap.set(key, []);
                colMap.get(key)!.push({
                    name: col.COLUMN_NAME,
                    type: mapMssqlType(col.DATA_TYPE),
                    nativeType: col.DATA_TYPE,
                    nullable: col.IS_NULLABLE === 'YES',
                    isPrimaryKey: pkSet.has(`${key}.${col.COLUMN_NAME}`),
                });
            }

            const tables: TableSnapshot[] = tableRes.recordset.map((t) => {
                const key = `${t.TABLE_SCHEMA}.${t.TABLE_NAME}`;
                const rawEstimate = Number(t.row_count_estimate);
                return {
                    name: t.TABLE_NAME,
                    schema: t.TABLE_SCHEMA,
                    kind: t.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
                    rowCountEstimate: rawEstimate >= 0 ? rawEstimate : undefined,
                    columns: colMap.get(key) || [],
                };
            });

            return { schemas, tables };
        } catch (err) {
            throw this.mapError(err);
        }
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'sql') {
            throw new ConnectorError('SQL Server connector only supports SQL queries.', 'UNSUPPORTED_REQUEST');
        }

        await assertHostAllowed(this.host, this.port);
        validateReadOnly(request.sql, 'mssql');

        const limit = Math.min(10000, opts?.limit ?? 1000);
        const timeoutMs = opts?.timeoutMs ?? this.queryTimeoutMs;
        const fetchLimit = limit + 1;

        const pool = await this.ensureConnected();
        const start = Date.now();
        const req = pool.request();
        (req as unknown as { timeout: number }).timeout = timeoutMs;

        // Abort support
        if (opts?.signal) {
            opts.signal.addEventListener(
                'abort',
                () => {
                    req.cancel();
                },
                { once: true }
            );
        }

        // Bind parameters: @p1, @p2...
        const params = request.params || [];
        params.forEach((param, idx) => {
            req.input(`p${idx + 1}`, param);
        });

        let querySql = request.sql.trim().replace(/;+$/, '');
        const hasTop = /\bTOP\b/i.test(querySql);
        const hasOffset = /\bFETCH\s+NEXT\b/i.test(querySql);

        if (!hasTop && !hasOffset) {
            querySql = `SELECT TOP ${fetchLimit} * FROM (${querySql}) AS __capped`;
        }

        try {
            const res = await req.query(querySql);
            const columns = Object.keys(res.recordset.columns || {});

            let rows: unknown[][] = res.recordset.map((record) =>
                columns.map((colName) => record[colName])
            );

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
            if (opts?.signal?.aborted) {
                throw new ConnectorError('Query execution was aborted.', 'QUERY_ABORTED');
            }
            throw this.mapError(err);
        }
    }

    async close(): Promise<void> {
        try {
            await this.pool.close();
        } catch {
            // best-effort
        }
    }
}
