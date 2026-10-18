import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import Papa from 'papaparse';
import {
    type Connector,
    type ColumnInfo,
    type SchemaInfo,
    type QueryResult,
    type SqlParam,
    type ExecuteOptions,
    ConnectorError,
} from './types';
import { SqliteConnector } from './sqlite-connector';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Sanitize CSV column name to a valid SQL identifier */
function sanitizeColName(name: string): string {
    return name.replace(/[^a-zA-Z0-9_]/g, '_').replace(/^(\d)/, '_$1') || '_col';
}

/** Infer SQLite column affinity from sample values */
function inferColType(samples: string[]): 'INTEGER' | 'REAL' | 'TEXT' {
    const nonEmpty = samples.filter((s) => s !== '' && s !== null && s !== undefined);
    if (nonEmpty.length === 0) return 'TEXT';

    const isInt = nonEmpty.every((v) => /^-?\d+$/.test(v.trim()));
    if (isInt) return 'INTEGER';

    const isReal = nonEmpty.every((v) => /^-?\d+(\.\d+)?([eE][+-]?\d+)?$/.test(v.trim()));
    if (isReal) return 'REAL';

    return 'TEXT';
}

/** Quote a SQLite identifier safely */
function quoteIdent(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
}

// ---------------------------------------------------------------------------
// CsvConnector
// ---------------------------------------------------------------------------

export class CsvConnector implements Connector {
    private readonly csvPath: string;
    private readonly cacheDbPath: string;
    private readonly tableName: string;
    private delegate: SqliteConnector | null = null;

    constructor(csvPath: string, cacheDbPath: string) {
        this.csvPath = csvPath;
        this.cacheDbPath = cacheDbPath;
        // Derive table name from CSV basename: "my data.csv" → "my_data"
        const base = path.basename(csvPath, path.extname(csvPath));
        this.tableName = sanitizeColName(base) || 'csv_data';
    }

    // ---------------------------------------------------------------------------
    // Cache build
    // ---------------------------------------------------------------------------

    buildCache(): void {
        if (!fs.existsSync(this.csvPath)) {
            throw new ConnectorError('CSV file not found. Check that the path is correct.', 'FILE_NOT_FOUND');
        }

        let content: string;
        try {
            content = fs.readFileSync(this.csvPath, 'utf-8');
        } catch {
            throw new ConnectorError('Could not read CSV file.', 'READ_FAILED');
        }

        const result = Papa.parse<string[]>(content, {
            header: false,
            skipEmptyLines: true,
        });

        if (result.errors.length > 0 && result.data.length === 0) {
            throw new ConnectorError('CSV parsing failed: ' + result.errors[0]?.message, 'PARSE_FAILED');
        }

        const allRows = result.data as string[][];
        if (allRows.length < 1) {
            throw new ConnectorError('CSV file is empty.', 'EMPTY_FILE');
        }

        const rawHeaders = allRows[0];
        const dataRows = allRows.slice(1);

        // Sanitize column names (dedup if needed)
        const seen = new Map<string, number>();
        const headers = rawHeaders.map((h) => {
            const name = sanitizeColName(String(h));
            const count = seen.get(name) ?? 0;
            seen.set(name, count + 1);
            return count === 0 ? name : `${name}_${count}`;
        });

        // Infer types from first 100 data rows
        const sampleRows = dataRows.slice(0, 100);
        const colTypes = headers.map((_, idx) => inferColType(sampleRows.map((r) => r[idx] ?? '')));

        // Ensure cache directory exists
        const cacheDir = path.dirname(this.cacheDbPath);
        if (!fs.existsSync(cacheDir)) {
            fs.mkdirSync(cacheDir, { recursive: true });
        }

        // Open (or recreate) the cache DB in read-write mode
        const cacheDb = new Database(this.cacheDbPath);

        try {
            cacheDb.pragma('journal_mode = WAL');

            // Drop and recreate table
            cacheDb.exec(`DROP TABLE IF EXISTS ${quoteIdent(this.tableName)}`);

            const colDefs = headers.map((h, i) => `${quoteIdent(h)} ${colTypes[i]}`).join(', ');
            cacheDb.exec(`CREATE TABLE ${quoteIdent(this.tableName)} (${colDefs})`);

            // Insert all rows in a single transaction
            const placeholders = headers.map(() => '?').join(', ');
            const insertStmt = cacheDb.prepare(`INSERT INTO ${quoteIdent(this.tableName)} VALUES (${placeholders})`);

            const insertAll = cacheDb.transaction((rows: string[][]) => {
                for (const row of rows) {
                    // Pad/trim row to match header count
                    const values: (string | null)[] = headers.map((_, i) => row[i] ?? null);
                    insertStmt.run(...(values as unknown[]));
                }
            });

            insertAll(dataRows);
        } finally {
            cacheDb.close();
        }
    }

    // ---------------------------------------------------------------------------
    // Cache-check helper: builds cache if needed, returns read-only connector
    // ---------------------------------------------------------------------------

    private ensureDelegate(): SqliteConnector {
        if (!this.delegate) {
            if (!fs.existsSync(this.cacheDbPath)) {
                this.buildCache();
            }
            this.delegate = new SqliteConnector(this.cacheDbPath);
        }
        return this.delegate;
    }

    // ---------------------------------------------------------------------------
    // Connector interface
    // ---------------------------------------------------------------------------

    testConnection(): void {
        // Validate CSV is readable and parseable
        if (!fs.existsSync(this.csvPath)) {
            throw new ConnectorError('CSV file not found. Check that the path is correct.', 'FILE_NOT_FOUND');
        }

        let content: string;
        try {
            content = fs.readFileSync(this.csvPath, 'utf-8');
        } catch {
            throw new ConnectorError('Could not read CSV file.', 'READ_FAILED');
        }

        // Parse first 5 rows to validate structure
        const result = Papa.parse<string[]>(content, {
            header: false,
            skipEmptyLines: true,
            preview: 6, // header + 5 data rows
        });

        if (result.data.length < 1) {
            throw new ConnectorError('CSV file is empty.', 'EMPTY_FILE');
        }

        const headers = (result.data[0] as string[]).filter(Boolean);
        if (headers.length === 0) {
            throw new ConnectorError('CSV file has no columns.', 'NO_COLUMNS');
        }
    }

    getTables(): string[] {
        return this.ensureDelegate().getTables();
    }

    getColumns(table: string): ColumnInfo[] {
        return this.ensureDelegate().getColumns(table);
    }

    getSchema(): SchemaInfo {
        return this.ensureDelegate().getSchema();
    }

    execute(sql: string, params: SqlParam[], options: ExecuteOptions): Promise<QueryResult> {
        return this.ensureDelegate().execute(sql, params, options);
    }

    close(): void {
        if (this.delegate) {
            this.delegate.close();
            this.delegate = null;
        }
    }
}
