import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';
import {
    validateFileSignature,
    resolveManagedPath,
    resolveLocalServerPath,
    computeSchemaDiff,
    SQLITE_MAGIC_HEADER,
    ZIP_MAGIC_HEADER,
} from './storage';
import { importExcelToDatabase } from './drivers/excel/importer';
import { ConnectorError } from './errors';
import { DATA_DIR } from '@src/lib/db/paths';

describe('File Connector & Storage Safety', () => {
    let tempDir: string;

    beforeEach(() => {
        tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bikit-files-test-'));
    });

    afterEach(() => {
        try {
            fs.rmSync(tempDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    });

    describe('validateFileSignature', () => {
        it('accepts a file with valid SQLite format 3 header', () => {
            const filePath = path.join(tempDir, 'valid.db');
            const buf = Buffer.alloc(100);
            SQLITE_MAGIC_HEADER.copy(buf, 0);
            fs.writeFileSync(filePath, buf);

            expect(() => validateFileSignature(filePath, 'sqlite')).not.toThrow();
        });

        it('rejects a corrupted or invalid SQLite file', () => {
            const filePath = path.join(tempDir, 'bad.db');
            fs.writeFileSync(filePath, Buffer.from('NOT A SQLITE DATABASE'));

            expect(() => validateFileSignature(filePath, 'sqlite')).toThrow(ConnectorError);
            expect(() => validateFileSignature(filePath, 'sqlite')).toThrow(/Invalid SQLite file format/);
        });

        it('accepts a file with valid XLSX ZIP header', () => {
            const filePath = path.join(tempDir, 'valid.xlsx');
            const buf = Buffer.alloc(100);
            ZIP_MAGIC_HEADER.copy(buf, 0);
            fs.writeFileSync(filePath, buf);

            expect(() => validateFileSignature(filePath, 'excel')).not.toThrow();
        });

        it('rejects legacy .xls OLE binary files with clear advice', () => {
            const filePath = path.join(tempDir, 'legacy.xls');
            const buf = Buffer.alloc(100);
            Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]).copy(buf, 0);
            fs.writeFileSync(filePath, buf);

            expect(() => validateFileSignature(filePath, 'excel')).toThrow(ConnectorError);
            expect(() => validateFileSignature(filePath, 'excel')).toThrow(/Legacy \.xls format is not supported/);
        });
    });

    describe('resolveManagedPath and resolveLocalServerPath', () => {
        it('resolves valid relative paths inside DATA_DIR', () => {
            const rel = 'files/demo-123/data.db';
            const resolved = resolveManagedPath(rel);
            expect(resolved).toBe(path.resolve(DATA_DIR, rel));
        });

        it('rejects path traversal attempts escaping DATA_DIR', () => {
            expect(() => resolveManagedPath('../../etc/passwd')).toThrow(/Path traversal detected/);
            expect(() => resolveManagedPath('/etc/shadow')).toThrow(/Path traversal detected/);
        });

        it('rejects local server paths unless ALLOW_LOCAL_SQLITE_PATHS is true', () => {
            const orig = process.env.ALLOW_LOCAL_SQLITE_PATHS;
            delete process.env.ALLOW_LOCAL_SQLITE_PATHS;
            try {
                expect(() => resolveLocalServerPath('sample.db')).toThrow(/Local filesystem paths are disabled/);
            } finally {
                process.env.ALLOW_LOCAL_SQLITE_PATHS = orig;
            }
        });
    });

    describe('computeSchemaDiff', () => {
        it('detects added, removed, and modified tables and columns', () => {
            const oldSnapshot = {
                tables: [
                    {
                        name: 'orders',
                        kind: 'table' as const,
                        columns: [
                            { name: 'id', type: 'number' as const, nativeType: 'INTEGER' },
                            { name: 'status', type: 'text' as const, nativeType: 'TEXT' },
                            { name: 'amount', type: 'number' as const, nativeType: 'REAL' },
                        ],
                    },
                    {
                        name: 'old_table',
                        kind: 'table' as const,
                        columns: [{ name: 'x', type: 'text' as const, nativeType: 'TEXT' }],
                    },
                ],
            };

            const newSnapshot = {
                tables: [
                    {
                        name: 'orders',
                        kind: 'table' as const,
                        columns: [
                            { name: 'id', type: 'number' as const, nativeType: 'INTEGER' },
                            // 'amount' removed
                            // 'status' changed from text to number
                            { name: 'status', type: 'number' as const, nativeType: 'INTEGER' },
                            // 'created_at' added
                            { name: 'created_at', type: 'date' as const, nativeType: 'TEXT' },
                        ],
                    },
                    {
                        name: 'new_table',
                        kind: 'table' as const,
                        columns: [{ name: 'y', type: 'text' as const, nativeType: 'TEXT' }],
                    },
                ],
            };

            const diff = computeSchemaDiff(oldSnapshot, newSnapshot);
            expect(diff.hasChanges).toBe(true);
            expect(diff.addedTables).toEqual(['new_table']);
            expect(diff.removedTables).toEqual(['old_table']);
            expect(diff.addedColumns).toEqual([{ table: 'orders', column: 'created_at' }]);
            expect(diff.removedColumns).toEqual([{ table: 'orders', column: 'amount' }]);
            expect(diff.retypedColumns).toEqual([
                { table: 'orders', column: 'status', oldType: 'text', newType: 'number' },
            ]);
        });
    });

    describe('Excel Workbook Import with ExcelJS', () => {
        it('imports Excel workbook with formulas, merged cells, and hidden sheet toggle', async () => {
            const excelFilePath = path.join(tempDir, 'sales.xlsx');
            const targetDbPath = path.join(tempDir, 'data.db');

            // Build a workbook using ExcelJS
            const wb = new ExcelJS.Workbook();

            // Sheet 1: Sales
            const wsSales = wb.addWorksheet('Sales Data');
            wsSales.addRow(['Region', 'Rep', 'Units', 'Unit_Price', 'Total']);
            wsSales.addRow(['North', 'Alice', 10, 25.5, { formula: 'C2*D2', result: 255.0 }]);
            wsSales.addRow(['South', 'Bob', 5, 50.0, { formula: 'C3*D3', result: 250.0 }]);

            // Sheet 2: Hidden sheet
            const wsHidden = wb.addWorksheet('Internal Notes');
            wsHidden.state = 'hidden';
            wsHidden.addRow(['Note_Id', 'Comment']);
            wsHidden.addRow([1, 'Confidential note']);

            await wb.xlsx.writeFile(excelFilePath);

            // Import with hidden sheets excluded by default
            const result1 = await importExcelToDatabase(excelFilePath, targetDbPath);
            expect(result1.sheets.length).toBe(1);
            expect(result1.sheets[0].tableName).toBe('sales_data');
            expect(result1.sheets[0].rowCount).toBe(2);

            // Query imported SQLite database to verify data and formula result extraction
            const db = new Database(targetDbPath, { readonly: true });
            const rows = db.prepare('SELECT * FROM "sales_data" ORDER BY "units" DESC').all() as Record<string, unknown>[];
            db.close();

            expect(rows.length).toBe(2);
            expect(rows[0].rep).toBe('Alice');
            expect(rows[0].total).toBe(255);
            expect(rows[1].rep).toBe('Bob');
            expect(rows[1].total).toBe(250);
        });
    });
});
