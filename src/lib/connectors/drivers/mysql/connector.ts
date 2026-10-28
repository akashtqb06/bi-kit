import mysql from 'mysql2/promise';
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
import type { MysqlConfig } from './definition';

function mapMysqlType(dataType: string): ColumnDataType {
    const dt = (dataType || '').toLowerCase();
    if (
        dt.includes('int') ||
        dt.includes('decimal') ||
        dt.includes('numeric') ||
        dt.includes('float') ||
        dt.includes('double') ||
        dt.includes('real')
    ) {
        return 'number';
    }
    if (dt === 'bit' || dt === 'boolean' || dt === 'bool') {
        return 'boolean';
    }
    if (dt.includes('date') || dt.includes('time') || dt.includes('year')) {
        return 'date';
    }
    if (dt.includes('json')) {
        return 'json';
    }
    if (dt.includes('blob') || dt.includes('binary')) {
        return 'binary';
    }
    return 'text';
}

function parseConnectionUrl(urlStr: string): Partial<MysqlConfig> {
    try {
        const parsed = new URL(urlStr);
        return {
            host: parsed.hostname,
            port: parsed.port ? parseInt(parsed.port, 10) : 3306,
            database: parsed.pathname.replace(/^\//, ''),
            username: decodeURIComponent(parsed.username),
            password: decodeURIComponent(parsed.password),
        };
    } catch {
        return {};
    }
}

export class MysqlConnector implements Connector {
    private pool: mysql.Pool;
    private host: string;
    private port: number;
    private database: string;
    private sslMode: string;
    private queryTimeoutMs: number;
    private isMariaDb: boolean | null = null;

    constructor(config: MysqlConfig, _ctx?: ConnectorContext) {
        let merged = { ...config };
        if (config.connectionUrl) {
            merged = { ...merged, ...parseConnectionUrl(config.connectionUrl) };
        }

        this.host = merged.host;
        this.port = merged.port || 3306;
        this.database = merged.database;
        this.sslMode = merged.ssl || 'disable';
        this.queryTimeoutMs = merged.queryTimeoutMs || 30000;

        let sslConfig: mysql.SslOptions | undefined = undefined;
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

        this.pool = mysql.createPool({
            host: this.host,
            port: this.port,
            database: this.database,
            user: merged.username,
            password: merged.password,
            connectionLimit: 5,
            waitForConnections: true,
            connectTimeout: merged.connectTimeoutMs || 10000,
            dateStrings: false,
            decimalNumbers: true,
            supportBigNumbers: true,
            bigNumberStrings: true,
            timezone: 'Z',
            ssl: sslConfig,
        });
    }

    private mapError(err: unknown): Error {
        if (err instanceof ConnectorError) return err;
        const msg = err instanceof Error ? err.message : String(err);
        const code = (err as Record<string, unknown>)?.code as string | undefined;

        let mapped = msg;
        let mappedCode = 'DB_ERROR';

        if (code === 'ER_ACCESS_DENIED_ERROR') {
            mapped = 'Authentication failed: invalid username or password.';
            mappedCode = 'AUTH_FAILED';
        } else if (code === 'ECONNREFUSED' || code === 'ENOTFOUND' || code === 'EHOSTUNREACH') {
            mapped = `Host "${this.host}:${this.port}" is unreachable or refused the connection.`;
            mappedCode = 'HOST_UNREACHABLE';
        } else if (code === 'PROTOCOL_SEQUENCE_TIMEOUT' || msg.includes('timeout')) {
            mapped = 'Query execution timed out.';
            mappedCode = 'QUERY_TIMEOUT';
        } else if (code === 'ER_TABLEACCESS_DENIED_ERROR') {
            mapped = `Permission denied: ${msg}`;
            mappedCode = 'PERMISSION_DENIED';
        } else if (code === 'ER_PARSE_ERROR' || code === 'ER_SYNTAX_ERROR') {
            mapped = `SQL syntax error: ${msg}`;
            mappedCode = 'SYNTAX_ERROR';
        }

        return new ConnectorError(redactSecrets(mapped), mappedCode, err);
    }

    async test(): Promise<TestResult> {
        await assertHostAllowed(this.host, this.port);
        const start = Date.now();
        const conn = await this.pool.getConnection().catch((e) => {
            throw this.mapError(e);
        });

        try {
            const [rows] = (await conn.query('SELECT VERSION() AS version')) as unknown as [
                Array<{ version: string }>,
                unknown,
            ];
            const versionStr = rows[0]?.version || 'MySQL';
            this.isMariaDb = versionStr.toLowerCase().includes('mariadb');
            const latencyMs = Math.max(1, Date.now() - start);

            const warnings: string[] = [];
            const isLoopback = this.host === 'localhost' || this.host === '127.0.0.1' || this.host === '::1';
            if (this.sslMode === 'disable' && !isLoopback) {
                warnings.push('Connection is not encrypted. We strongly recommend enabling SSL/TLS in production.');
            }
            warnings.push('For security, ensure the database user has read-only permissions (GRANT SELECT only).');

            return {
                ok: true,
                latencyMs,
                serverVersion: versionStr,
                message: 'Connected to MySQL / MariaDB database successfully.',
                warnings,
            };
        } catch (err) {
            throw this.mapError(err);
        } finally {
            conn.release();
        }
    }

    async introspect(_opts?: { schemas?: string[]; signal?: AbortSignal }): Promise<SchemaSnapshot> {
        await assertHostAllowed(this.host, this.port);
        const conn = await this.pool.getConnection().catch((e) => {
            throw this.mapError(e);
        });

        try {
            // 1. Fetch tables and views
            const [tableRows] = (await conn.query(
                `SELECT TABLE_NAME, TABLE_TYPE, TABLE_ROWS 
                 FROM information_schema.tables 
                 WHERE TABLE_SCHEMA = ? 
                 ORDER BY TABLE_NAME`,
                [this.database]
            )) as unknown as [Array<{ TABLE_NAME: string; TABLE_TYPE: string; TABLE_ROWS: number }>, unknown];

            // 2. Fetch columns
            const [colRows] = (await conn.query(
                `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, IS_NULLABLE, COLUMN_KEY 
                 FROM information_schema.columns 
                 WHERE TABLE_SCHEMA = ? 
                 ORDER BY TABLE_NAME, ORDINAL_POSITION`,
                [this.database]
            )) as unknown as [
                Array<{
                    TABLE_NAME: string;
                    COLUMN_NAME: string;
                    DATA_TYPE: string;
                    IS_NULLABLE: string;
                    COLUMN_KEY: string;
                }>,
                unknown,
            ];

            const colMap = new Map<string, ColumnSnapshot[]>();
            for (const col of colRows) {
                if (!colMap.has(col.TABLE_NAME)) colMap.set(col.TABLE_NAME, []);
                colMap.get(col.TABLE_NAME)!.push({
                    name: col.COLUMN_NAME,
                    type: mapMysqlType(col.DATA_TYPE),
                    nativeType: col.DATA_TYPE,
                    nullable: col.IS_NULLABLE === 'YES',
                    isPrimaryKey: col.COLUMN_KEY === 'PRI',
                });
            }

            const tables: TableSnapshot[] = tableRows.map((t) => ({
                name: t.TABLE_NAME,
                kind: t.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
                rowCountEstimate: t.TABLE_ROWS !== null ? Number(t.TABLE_ROWS) : undefined,
                columns: colMap.get(t.TABLE_NAME) || [],
            }));

            return { schemas: [this.database], tables };
        } catch (err) {
            throw this.mapError(err);
        } finally {
            conn.release();
        }
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'sql') {
            throw new ConnectorError('MySQL connector only supports SQL queries.', 'UNSUPPORTED_REQUEST');
        }

        await assertHostAllowed(this.host, this.port);
        validateReadOnly(request.sql, 'mysql');

        const limit = Math.min(10000, opts?.limit ?? 1000);
        const timeoutMs = opts?.timeoutMs ?? this.queryTimeoutMs;
        const fetchLimit = limit + 1;

        const conn = await this.pool.getConnection().catch((e) => {
            throw this.mapError(e);
        });

        const start = Date.now();
        let aborted = false;

        const onAbort = () => {
            aborted = true;
            try {
                conn.destroy();
            } catch {
                // ignore
            }
        };

        if (opts?.signal) {
            opts.signal.addEventListener('abort', onAbort, { once: true });
        }

        try {
            await conn.query('START TRANSACTION READ ONLY');

            let querySql = request.sql.trim().replace(/;+$/, '');
            const hasLimit = /\bLIMIT\s+\d+/i.test(querySql);

            // Apply query timeout hint
            if (this.isMariaDb) {
                const timeoutSec = Math.max(1, Math.ceil(timeoutMs / 1000));
                querySql = `SET STATEMENT max_statement_time = ${timeoutSec} FOR ${querySql}`;
            } else {
                // MySQL 8+ optimizer hint
                querySql = querySql.replace(/^SELECT\b/i, `SELECT /*+ MAX_EXECUTION_TIME(${timeoutMs}) */`);
            }

            if (!hasLimit) {
                querySql = `SELECT * FROM (${querySql}) AS __capped LIMIT ${fetchLimit}`;
            }

            const [rawRows, fields] = (await conn.query({
                sql: querySql,
                values: request.params || [],
                rowsAsArray: true,
            })) as unknown as [unknown[][], Array<{ name: string }>];

            await conn.query('COMMIT');

            const columns = fields ? fields.map((f) => f.name) : [];
            let rows = rawRows as unknown[][];
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
                await conn.query('ROLLBACK');
            } catch {
                // ignore
            }
            if (aborted) {
                throw new ConnectorError('Query execution was aborted.', 'QUERY_ABORTED');
            }
            throw this.mapError(err);
        } finally {
            if (opts?.signal) {
                opts.signal.removeEventListener('abort', onAbort);
            }
            conn.release();
        }
    }

    async close(): Promise<void> {
        try {
            await this.pool.end();
        } catch {
            // best-effort
        }
    }
}
