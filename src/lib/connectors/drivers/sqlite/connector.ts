import Database from 'better-sqlite3';
import { Worker } from 'node:worker_threads';
import fs from 'node:fs';
import path from 'node:path';
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
    type SchemaInfo,
    type ColumnInfo,
    type SqlParam,
    type ExecuteOptions,
    ConnectorError,
} from '../../types';
import { normalizeQueryResult } from '../../normalize';
import { resolveManagedPath, resolveLocalServerPath, SQLITE_MAGIC_HEADER } from '../../storage';
import { validateReadOnly, ReadOnlyValidationError } from '@src/lib/query-engine/validate-readonly';
import type { SqliteConfig } from './definition';

function quoteIdent(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
}

function mapSqliteType(nativeType: string): ColumnDataType {
    const upper = (nativeType || 'TEXT').toUpperCase();
    if (upper.includes('INT')) return 'number';
    if (upper.includes('REAL') || upper.includes('FLOA') || upper.includes('DOUB') || upper.includes('NUM')) return 'number';
    if (upper.includes('BOOL')) return 'boolean';
    if (upper.includes('DATE') || upper.includes('TIME')) return 'date';
    if (upper.includes('BLOB')) return 'binary';
    if (upper.includes('JSON')) return 'json';
    return 'text';
}

const queryWorkerSource = `
const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const startedAt = Date.now();
let db;

try {
  db = new Database(workerData.filePath, { readonly: true, fileMustExist: true });
  db.pragma('query_only = ON');

  const statement = db.prepare(workerData.sql);
  if (!statement.reader || !statement.readonly) {
    throw Object.assign(new Error(), { code: "NOT_READONLY" });
  }

  const columns = statement.columns().map((column) => column.name);
  const rows = [];
  let truncated = false;
  const iterator = statement.raw().iterate(...workerData.params);
  while (true) {
    const next = iterator.next();
    if (next.done) break;
    if (rows.length === workerData.limit) {
      truncated = true;
      break;
    }
    rows.push(next.value);
  }

  parentPort.postMessage({
    ok: true,
    result: {
      columns,
      rows,
      rowCount: rows.length,
      truncated,
      durationMs: Math.max(1, Date.now() - startedAt),
    },
  });
} catch (error) {
  parentPort.postMessage({
    ok: false,
    code: error && error.code === "NOT_READONLY" ? "NOT_READONLY" : (error && error.code ? error.code : "EXEC_FAILED"),
    message: error && error.code === "NOT_READONLY"
      ? "Only read-only SELECT statements are permitted."
      : (error && error.message ? error.message : "Query execution failed."),
  });
} finally {
  if (db) db.close();
}
`;

export class SqliteConnector implements Connector {
    public readonly filePath: string;
    private db: Database.Database | null = null;

    constructor(config: SqliteConfig | string, _ctx?: ConnectorContext) {
        if (typeof config === 'string') {
            // Legacy / direct path construction
            this.filePath = this.resolvePath(config);
        } else if (config.serverPath) {
            this.filePath = resolveLocalServerPath(config.serverPath);
        } else {
            const rawPath = config.managedPath || config.path;
            if (!rawPath) {
                throw new ConnectorError('SQLite configuration is missing database path.', 'INVALID_CONFIG');
            }
            this.filePath = this.resolvePath(rawPath);
        }

        // Verify SQLite format 3 header
        this.verifyHeader(this.filePath);

        // Open local connection for introspection & fast checks
        try {
            this.db = new Database(this.filePath, { readonly: true, fileMustExist: true });
            this.db.pragma('query_only = ON');
        } catch {
            throw new ConnectorError(
                'Could not open SQLite database file.',
                'OPEN_FAILED'
            );
        }
    }

    private resolvePath(target: string): string {
        try {
            return resolveManagedPath(target);
        } catch {
            // If absolute path or legacy path
            const resolved = path.resolve(process.cwd(), target);
            if (!fs.existsSync(resolved)) {
                throw new ConnectorError('Data source file was not found.', 'SOURCE_NOT_FOUND');
            }
            return resolved;
        }
    }

    private verifyHeader(filePath: string): void {
        if (!fs.existsSync(filePath)) {
            throw new ConnectorError('Data source file was not found.', 'SOURCE_NOT_FOUND');
        }
        const fd = fs.openSync(filePath, 'r');
        try {
            const header = Buffer.alloc(16);
            fs.readSync(fd, header, 0, 16, 0);
            if (!header.subarray(0, 16).equals(SQLITE_MAGIC_HEADER)) {
                throw new ConnectorError(
                    'Invalid SQLite file format. File does not contain standard SQLite header.',
                    'INVALID_SQLITE_HEADER'
                );
            }
        } finally {
            fs.closeSync(fd);
        }
    }

    async test(): Promise<TestResult> {
        const start = Date.now();
        if (!this.db) {
            throw new ConnectorError('Database is not open.', 'CLOSED');
        }
        try {
            this.db.prepare('SELECT 1').get();
            const versionRow = this.db.prepare('SELECT sqlite_version() AS version').get() as { version: string } | undefined;
            const quickCheck = this.db.prepare('PRAGMA quick_check').get() as Record<string, unknown> | undefined;
            const checkVal = Object.values(quickCheck || {})[0];
            const warnings: string[] = [];
            if (checkVal !== 'ok') {
                warnings.push(`Integrity check warning: ${String(checkVal)}`);
            }
            return {
                ok: true,
                latencyMs: Math.max(1, Date.now() - start),
                serverVersion: versionRow?.version || 'SQLite 3',
                message: 'Connected and verified SQLite database.',
                warnings,
            };
        } catch (err) {
            throw new ConnectorError(
                `Connection test failed: ${err instanceof Error ? err.message : 'Unknown error'}`,
                'TEST_FAILED'
            );
        }
    }

    async introspect(_opts?: { schemas?: string[]; signal?: AbortSignal }): Promise<SchemaSnapshot> {
        if (!this.db) {
            throw new ConnectorError('Database is not open.', 'CLOSED');
        }

        try {
            const tableRows = this.db
                .prepare(
                    `SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`
                )
                .all() as { name: string; type: string }[];

            const tables: TableSnapshot[] = tableRows.map((t) => {
                const colRows = this.db!
                    .prepare(`PRAGMA table_info(${quoteIdent(t.name)})`)
                    .all() as { cid: number; name: string; type: string; notnull: number; pk: number }[];

                const columns: ColumnSnapshot[] = colRows.map((c) => ({
                    name: c.name,
                    type: mapSqliteType(c.type),
                    nativeType: c.type || 'TEXT',
                    nullable: c.notnull === 0,
                    isPrimaryKey: c.pk > 0,
                }));

                // Row count estimate from sqlite_stat1 if available, otherwise undefined
                let rowCountEstimate: number | undefined;
                try {
                    const countRow = this.db!.prepare(`SELECT count(*) AS total FROM ${quoteIdent(t.name)}`).get() as { total: number } | undefined;
                    rowCountEstimate = countRow?.total;
                } catch {
                    // best effort
                }

                return {
                    name: t.name,
                    kind: t.type === 'view' ? 'view' : 'table',
                    rowCountEstimate,
                    columns,
                };
            });

            return { tables };
        } catch (err) {
            throw new ConnectorError(`Failed to introspect SQLite database: ${err instanceof Error ? err.message : ''}`, 'INTROSPECT_FAILED');
        }
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'sql') {
            throw new ConnectorError('SQLite connector only supports SQL queries.', 'UNSUPPORTED_REQUEST');
        }

        validateReadOnly(request.sql, 'sqlite');

        const limit = Math.min(10000, opts?.limit ?? 1000);
        const timeoutMs = opts?.timeoutMs ?? 10000;
        const params = (request.params || []) as SqlParam[];

        const rawResult = await new Promise<QueryResult>((resolve, reject) => {
            const worker = new Worker(queryWorkerSource, {
                eval: true,
                workerData: {
                    filePath: this.filePath,
                    sql: request.sql,
                    params,
                    limit,
                },
            });

            let settled = false;

            if (opts?.signal) {
                opts.signal.addEventListener('abort', () => {
                    if (settled) return;
                    settled = true;
                    void worker.terminate();
                    reject(new ConnectorError('Query was aborted.', 'QUERY_ABORTED'));
                });
            }

            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                void worker.terminate();
                reject(new ConnectorError('Query timed out.', 'QUERY_TIMEOUT'));
            }, timeoutMs);

            worker.once('message', (response: { ok: boolean; result?: QueryResult; code?: string; message?: string }) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                void worker.terminate();
                if (response.ok && response.result) {
                    resolve(response.result);
                } else {
                    reject(
                        new ConnectorError(
                            response.message ?? 'Query execution failed.',
                            response.code ?? 'EXEC_FAILED'
                        )
                    );
                }
            });

            worker.once('error', (err) => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(new ConnectorError(err.message || 'Query execution failed.', 'EXEC_FAILED'));
            });

            worker.once('exit', (code) => {
                if (settled || code === 0) return;
                settled = true;
                clearTimeout(timeout);
                reject(new ConnectorError('Query execution failed.', 'EXEC_FAILED'));
            });
        });

        return normalizeQueryResult(rawResult);
    }

    async close(): Promise<void> {
        if (this.db) {
            try {
                this.db.close();
            } catch {
                // ignore
            }
            this.db = null;
        }
    }

    // -----------------------------------------------------------------------
    // Backward-compatible methods
    // -----------------------------------------------------------------------

    testConnection(): void {
        if (!this.db) throw new ConnectorError('Database not open', 'CLOSED');
        try {
            this.db.prepare('SELECT 1').get();
        } catch {
            throw new ConnectorError('Connection test failed.', 'TEST_FAILED');
        }
    }

    getTables(): string[] {
        if (!this.db) throw new ConnectorError('Database not open', 'CLOSED');
        const rows = this.db
            .prepare(`SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`)
            .all() as { name: string }[];
        return rows.map((r) => r.name);
    }

    getColumns(table: string): ColumnInfo[] {
        if (!this.db) throw new ConnectorError('Database not open', 'CLOSED');
        const tables = this.getTables();
        if (!tables.includes(table)) {
            throw new ConnectorError(`Table "${table}" not found in this data source.`, 'TABLE_NOT_FOUND');
        }
        const rows = this.db.prepare(`PRAGMA table_info(${quoteIdent(table)})`).all() as {
            name: string;
            type: string;
            notnull: number;
        }[];
        return rows.map((r) => ({
            name: r.name,
            type: r.type || 'TEXT',
            nullable: r.notnull === 0,
        }));
    }

    getSchema(): SchemaInfo {
        const tableNames = this.getTables();
        const tables = tableNames.map((name) => ({
            name,
            columns: this.getColumns(name),
        }));
        return { tables };
    }

    async execute(sql: string, params: SqlParam[], options: ExecuteOptions): Promise<QueryResult> {
        try {
            return await this.run({ kind: 'sql', sql, params }, { limit: options.limit, timeoutMs: options.timeoutMs });
        } catch (err: unknown) {
            if (err instanceof ReadOnlyValidationError && err.message.includes('Multiple statements')) {
                throw new ConnectorError(err.message, 'EXEC_FAILED');
            }
            throw err;
        }
    }
}
