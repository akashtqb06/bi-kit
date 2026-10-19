import 'server-only';
import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import Papa from 'papaparse';
import type { CsvSourceConfig } from '@src/lib/schemas';
import { CSV_DIR } from '@src/lib/db/paths';
import { inferCsvColumnType, sanitizeColumnNames, sanitizeTableName } from './csv-utils';

function quoteIdentifier(identifier: string): string {
    return `"${identifier.replace(/"/g, '""')}"`;
}

export class CsvImportError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'CsvImportError';
    }
}

export function importCsvToDatabase(
    csvText: string,
    sourceId: string,
    originalFileName: string,
    existingDbPath?: string
): CsvSourceConfig {
    const parsed = Papa.parse<Record<string, string>>(csvText, {
        header: true,
        skipEmptyLines: true,
        dynamicTyping: false,
    });
    const parseError = parsed.errors.find((error) => error.code !== 'UndetectableDelimiter');
    if (parseError) {
        throw new CsvImportError(`Could not parse CSV: ${parseError.message}`);
    }

    const rawHeaders = parsed.meta.fields ?? [];
    if (rawHeaders.length === 0) throw new CsvImportError('The CSV must include a header row.');
    if (parsed.data.length === 0) throw new CsvImportError('The CSV must include at least one data row.');

    const headers = sanitizeColumnNames(rawHeaders);
    const tableName = sanitizeTableName(originalFileName);
    const rows = parsed.data;
    const columnTypes = headers.map((_, index) =>
        inferCsvColumnType(rows.slice(0, 1000).map((row) => row[rawHeaders[index] ?? ''] ?? ''))
    );
    const absoluteDbPath = existingDbPath
        ? path.resolve(process.cwd(), existingDbPath)
        : path.join(CSV_DIR, `${sourceId}.db`);
    const allowedDirectory = path.resolve(CSV_DIR) + path.sep;
    if (!absoluteDbPath.startsWith(allowedDirectory)) {
        throw new Error('CSV database path is invalid.');
    }
    fs.mkdirSync(path.dirname(absoluteDbPath), { recursive: true });

    const database = new Database(absoluteDbPath);
    try {
        const columnsSql = headers
            .map((header, index) => {
                const type = columnTypes[index];
                const affinity =
                    type === 'integer' ? 'INTEGER' : type === 'real' ? 'REAL' : type === 'date' ? 'DATE' : 'TEXT';
                return `${quoteIdentifier(header)} ${affinity}`;
            })
            .join(', ');
        const batchSize = Math.max(1, Math.floor(900 / headers.length));
        const importRows = database.transaction(() => {
            if (existingDbPath) {
                const existingTables = database
                    .prepare("SELECT name FROM sqlite_master WHERE type = 'table' AND name NOT LIKE 'sqlite_%'")
                    .all() as { name: string }[];
                for (const table of existingTables) {
                    database.exec(`DROP TABLE ${quoteIdentifier(table.name)}`);
                }
            }
            database.exec(`DROP TABLE IF EXISTS ${quoteIdentifier(tableName)}`);
            database.exec(`CREATE TABLE ${quoteIdentifier(tableName)} (${columnsSql})`);

            for (let offset = 0; offset < rows.length; offset += batchSize) {
                const batch = rows.slice(offset, offset + batchSize);
                const valuesSql = batch.map(() => `(${headers.map(() => '?').join(', ')})`).join(', ');
                const statement = database.prepare(
                    `INSERT INTO ${quoteIdentifier(tableName)} (${headers.map(quoteIdentifier).join(', ')}) VALUES ${valuesSql}`
                );
                const values = batch.flatMap((row) =>
                    rawHeaders.map((rawHeader, index) => {
                        const value = row[rawHeader] ?? '';
                        if (value === '') return null;
                        if (columnTypes[index] === 'integer' || columnTypes[index] === 'real') {
                            return Number(value);
                        }
                        return value;
                    })
                );
                statement.run(...values);
            }
        });
        importRows();
    } finally {
        database.close();
    }

    return {
        dbPath: path.relative(process.cwd(), absoluteDbPath),
        tableName,
        originalFileName,
        rowCount: rows.length,
    };
}
