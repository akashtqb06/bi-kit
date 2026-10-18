import Database from 'better-sqlite3';
import { Worker } from 'node:worker_threads';
import {
    type Connector,
    type ColumnInfo,
    type SchemaInfo,
    type QueryResult,
    type SqlParam,
    type ExecuteOptions,
    ConnectorError,
} from './types';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Quote a SQLite identifier safely: double any embedded double-quotes */
function quoteIdent(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
}

const queryWorkerSource = `
const { parentPort, workerData } = require("node:worker_threads");
const Database = require("better-sqlite3");
const startedAt = Date.now();
let db;

try {
  db = new Database(workerData.filePath, { readonly: true, fileMustExist: true });
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
      executionTimeMs: Math.max(1, Date.now() - startedAt),
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

interface QueryWorkerResponse {
    ok: boolean;
    result?: QueryResult;
    code?: string;
    message?: string;
}

// ---------------------------------------------------------------------------
// SqliteConnector
// ---------------------------------------------------------------------------

export class SqliteConnector implements Connector {
    private db: Database.Database;

    constructor(filePath: string) {
        try {
            this.db = new Database(filePath, {
                readonly: true,
                fileMustExist: true,
            });
        } catch {
            // Do not include filePath in the thrown message
            throw new ConnectorError(
                'Could not open SQLite file. Check that the path is correct and the file exists.',
                'OPEN_FAILED'
            );
        }
    }

    testConnection(): void {
        try {
            this.db.prepare('SELECT 1').get();
        } catch {
            throw new ConnectorError('Connection test failed: unable to query the database.', 'TEST_FAILED');
        }
    }

    getTables(): string[] {
        try {
            const rows = this.db
                .prepare(
                    `SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%' ORDER BY name`
                )
                .all() as { name: string }[];
            return rows.map((r) => r.name);
        } catch {
            throw new ConnectorError('Failed to list tables.', 'LIST_TABLES_FAILED');
        }
    }

    getColumns(table: string): ColumnInfo[] {
        // Validate table exists first
        const tables = this.getTables();
        if (!tables.includes(table)) {
            throw new ConnectorError(`Table "${table}" not found in this data source.`, 'TABLE_NOT_FOUND');
        }
        try {
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
        } catch {
            throw new ConnectorError(`Failed to get columns for table "${table}".`, 'GET_COLUMNS_FAILED');
        }
    }

    getSchema(): SchemaInfo {
        const tableNames = this.getTables();
        const tables = tableNames.map((name) => ({
            name,
            columns: this.getColumns(name),
        }));
        return { tables };
    }

    execute(sql: string, params: SqlParam[], options: ExecuteOptions): Promise<QueryResult> {
        return new Promise((resolve, reject) => {
            const worker = new Worker(queryWorkerSource, {
                eval: true,
                workerData: {
                    filePath: this.db.name,
                    sql,
                    params,
                    limit: options.limit,
                },
            });
            let settled = false;
            const timeout = setTimeout(() => {
                if (settled) return;
                settled = true;
                void worker.terminate();
                reject(new ConnectorError('Query timed out.', 'QUERY_TIMEOUT'));
            }, options.timeoutMs);

            worker.once('message', (response: QueryWorkerResponse) => {
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

            worker.once('error', () => {
                if (settled) return;
                settled = true;
                clearTimeout(timeout);
                reject(new ConnectorError('Query execution failed.', 'EXEC_FAILED'));
            });

            worker.once('exit', (code) => {
                if (settled || code === 0) return;
                settled = true;
                clearTimeout(timeout);
                reject(new ConnectorError('Query execution failed.', 'EXEC_FAILED'));
            });
        });
    }

    close(): void {
        try {
            this.db.close();
        } catch {
            // best-effort; ignore errors on close
        }
    }
}
