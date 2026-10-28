import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { ConnectorError } from '../../errors';

export const EXCEL_MAX_ROWS = parseInt(process.env.EXCEL_MAX_ROWS || '500000', 10);
export const EXCEL_MAX_SHEETS = 50;

export interface SheetConfig {
    name: string;
    tableName?: string;
    include?: boolean;
    headerRow?: number;
    firstDataRow?: number;
}

export interface ExcelImportOptions {
    includeHiddenSheets?: boolean;
    sheets?: SheetConfig[];
    columnOverrides?: Record<string, Record<string, string>>; // sheet -> col -> type
}

export interface SheetImportResult {
    sheetName: string;
    tableName: string;
    rowCount: number;
    columnCount: number;
    columns: { name: string; type: string }[];
}

export interface ExcelImportResult {
    sheets: SheetImportResult[];
    totalRows: number;
}

function sanitizeIdentifier(name: string): string {
    const clean = name
        .trim()
        .replace(/[^A-Za-z0-9_]+/g, '_')
        .replace(/^_+|_+$/g, '');
    const valid = clean.match(/^[A-Za-z_]/) ? clean : `t_${clean}`;
    return (valid || 'table').toLowerCase().slice(0, 60);
}

function quoteIdent(name: string): string {
    return '"' + name.replace(/"/g, '""') + '"';
}

function extractCellValue(cell: ExcelJS.Cell, is1904 = false): unknown {
    if (cell.value === null || cell.value === undefined) {
        return null;
    }

    // Merged cell secondary references
    if (cell.isMerged && cell.master && cell !== cell.master) {
        return extractCellValue(cell.master, is1904);
    }

    const val = cell.value;

    if (val !== null && typeof val === 'object') {
        const obj = val as unknown as Record<string, unknown>;
        // Excel formula object { formula, result }
        if ('result' in obj) {
            const resultVal = obj.result;
            if (resultVal === null || resultVal === undefined) return null;
            if (resultVal !== null && typeof resultVal === 'object' && 'error' in (resultVal as Record<string, unknown>)) {
                return null; // Excel error cell like #N/A, #REF!
            }
            return normalizeCellPrimitive(resultVal, cell, is1904);
        }

        // Excel error cell
        if ('error' in obj) {
            return null;
        }

        // Rich text object { richText: [...] }
        if ('richText' in obj && Array.isArray(obj.richText)) {
            const rt = obj.richText as Array<{ text?: string }>;
            return rt.map((part) => part.text || '').join('');
        }

        // Hyperlink object { text, hyperlink }
        if ('hyperlink' in obj) {
            const hl = obj as { text?: string; hyperlink?: string };
            return hl.text || hl.hyperlink || null;
        }
    }

    return normalizeCellPrimitive(val, cell, is1904);
}

function normalizeCellPrimitive(val: unknown, cell: ExcelJS.Cell, is1904: boolean): unknown {
    if (val === null || val === undefined) return null;

    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val.toISOString();
    }

    if (typeof val === 'boolean') {
        return val ? 1 : 0;
    }

    if (typeof val === 'number') {
        // If the cell is explicitly formatted as a date in Excel
        if (cell.type === ExcelJS.ValueType.Date || isDateNumberFormat(cell.numFmt)) {
            const date = excelSerialToDate(val, is1904);
            if (date) return date.toISOString();
        }
        return Number.isFinite(val) ? val : null;
    }

    const str = String(val).trim();
    return str === '' ? null : str;
}

function isDateNumberFormat(numFmt?: string): boolean {
    if (!numFmt) return false;
    const lower = numFmt.toLowerCase();
    return (
        lower.includes('yy') ||
        lower.includes('mm') ||
        lower.includes('dd') ||
        lower.includes('hh:') ||
        lower.includes(':ss')
    );
}

function excelSerialToDate(serial: number, is1904: boolean): Date | null {
    if (typeof serial !== 'number' || isNaN(serial) || serial < 0) return null;
    // Excel 1900 date system has a leap year bug (day 60 is Feb 29, 1900, which didn't exist)
    const epoch = is1904 ? Date.UTC(1904, 0, 1) : Date.UTC(1899, 11, 30);
    const msPerDay = 86400000;
    const days = is1904 ? serial : serial > 60 ? serial : serial + 1;
    const dateMs = Math.round(epoch + days * msPerDay);
    const d = new Date(dateMs);
    return isNaN(d.getTime()) ? null : d;
}

function inferType(values: unknown[]): string {
    const nonNulls = values.filter((v) => v !== null && v !== undefined && v !== '');
    if (nonNulls.length === 0) return 'TEXT';

    let integerCount = 0;
    let realCount = 0;
    let dateCount = 0;
    let booleanCount = 0;

    for (const v of nonNulls) {
        if (typeof v === 'boolean' || v === 1 || v === 0) {
            booleanCount++;
        }
        if (typeof v === 'number') {
            if (Number.isInteger(v)) integerCount++;
            else realCount++;
        } else if (typeof v === 'string') {
            if (!isNaN(Date.parse(v)) && (v.includes('-') || v.includes('/')) && v.length >= 8) {
                dateCount++;
            } else if (/^-?\d+$/.test(v)) {
                integerCount++;
            } else if (/^-?\d+\.\d+$/.test(v)) {
                realCount++;
            }
        }
    }

    const total = nonNulls.length;
    if (integerCount === total) return 'INTEGER';
    if (integerCount + realCount === total) return 'REAL';
    if (dateCount / total >= 0.8) return 'DATE';
    if (booleanCount === total) return 'INTEGER';
    return 'TEXT';
}

export async function importExcelToDatabase(
    sourceFilePath: string,
    targetDbPath: string,
    options?: ExcelImportOptions
): Promise<ExcelImportResult> {
    if (!fs.existsSync(sourceFilePath)) {
        throw new ConnectorError(`Excel source file not found at "${sourceFilePath}".`, 'SOURCE_NOT_FOUND');
    }

    fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
    // Remove target database and WAL/SHM if already existing
    for (const suffix of ['', '-wal', '-shm']) {
        if (fs.existsSync(`${targetDbPath}${suffix}`)) {
            fs.rmSync(`${targetDbPath}${suffix}`, { force: true });
        }
    }

    const workbook = new ExcelJS.Workbook();
    try {
        await workbook.xlsx.readFile(sourceFilePath);
    } catch (err) {
        throw new ConnectorError(
            `Could not read Excel file: ${err instanceof Error ? err.message : 'Invalid format'}`,
            'INVALID_EXCEL_FILE'
        );
    }

    const is1904 = Boolean(workbook.properties?.date1904);
    const db = new Database(targetDbPath);

    const sheetResults: SheetImportResult[] = [];
    const usedTableNames = new Set<string>();
    let totalImportedRows = 0;

    try {
        const worksheets = workbook.worksheets.slice(0, EXCEL_MAX_SHEETS);

        for (const sheet of worksheets) {
            // Check visibility
            const isHidden = sheet.state === 'hidden' || sheet.state === 'veryHidden';
            if (isHidden && !options?.includeHiddenSheets) {
                continue;
            }

            // Custom sheet options if supplied
            const sheetOpt = options?.sheets?.find(
                (s) => s.name.toLowerCase() === sheet.name.toLowerCase()
            );
            if (sheetOpt && sheetOpt.include === false) {
                continue;
            }

            // Deduplicate table names
            const baseTableName = sanitizeIdentifier(sheetOpt?.tableName || sheet.name);
            let tableName = baseTableName;
            let counter = 2;
            while (usedTableNames.has(tableName)) {
                tableName = `${baseTableName}_${counter++}`;
            }
            usedTableNames.add(tableName);

            // Find header row (auto-detect first row with non-empty cells or use option)
            let headerRowNum = sheetOpt?.headerRow;
            if (!headerRowNum) {
                sheet.eachRow((row, rowNumber) => {
                    if (!headerRowNum && row.values && (row.values as unknown[]).length > 0) {
                        headerRowNum = rowNumber;
                    }
                });
            }
            if (!headerRowNum) {
                // Empty sheet
                continue;
            }

            const headerRow = sheet.getRow(headerRowNum);
            const rawHeaders: string[] = [];
            const headerColIndexes: number[] = [];

            headerRow.eachCell({ includeEmpty: false }, (cell, colNumber) => {
                const headerVal = extractCellValue(cell, is1904);
                if (headerVal !== null && headerVal !== undefined && String(headerVal).trim() !== '') {
                    rawHeaders.push(String(headerVal).trim());
                    headerColIndexes.push(colNumber);
                }
            });

            if (rawHeaders.length === 0) {
                continue;
            }

            // Sanitize & deduplicate column names
            const colNames: string[] = [];
            const seenCols = new Set<string>();
            rawHeaders.forEach((raw, i) => {
                let colName = sanitizeIdentifier(raw) || `col_${i + 1}`;
                let colCounter = 2;
                while (seenCols.has(colName)) {
                    colName = `${sanitizeIdentifier(raw)}_${colCounter++}`;
                }
                seenCols.add(colName);
                colNames.push(colName);
            });

            // Read data rows
            const firstDataRow = sheetOpt?.firstDataRow ?? headerRowNum + 1;
            const dataRows: unknown[][] = [];
            let currentDataRow = 0;

            sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                if (rowNumber < firstDataRow) return;
                if (currentDataRow >= EXCEL_MAX_ROWS) return;

                const rowData: unknown[] = [];
                let hasValue = false;

                for (const colIdx of headerColIndexes) {
                    const cell = row.getCell(colIdx);
                    const val = extractCellValue(cell, is1904);
                    if (val !== null && val !== undefined) {
                        hasValue = true;
                    }
                    rowData.push(val);
                }

                if (hasValue) {
                    dataRows.push(rowData);
                    currentDataRow++;
                }
            });

            if (dataRows.length === 0) {
                continue;
            }

            // Infer column types by sampling up to 1000 rows
            const sampleSlice = dataRows.slice(0, 1000);
            const columnTypes = colNames.map((colName, idx) => {
                const override = options?.columnOverrides?.[sheet.name]?.[colName];
                if (override) return override.toUpperCase();
                const colValues = sampleSlice.map((r) => r[idx]);
                return inferType(colValues);
            });

            // Create table
            const createColumnsSql = colNames
                .map((name, idx) => `${quoteIdent(name)} ${columnTypes[idx]}`)
                .join(', ');
            db.exec(`CREATE TABLE ${quoteIdent(tableName)} (${createColumnsSql})`);

            // Insert rows in batches inside a transaction
            const batchSize = Math.max(1, Math.floor(900 / colNames.length));
            const insertStmt = db.prepare(
                `INSERT INTO ${quoteIdent(tableName)} (${colNames.map(quoteIdent).join(', ')}) VALUES (${colNames.map(() => '?').join(', ')})`
            );

            const insertMany = db.transaction((rows: unknown[][]) => {
                for (const row of rows) {
                    insertStmt.run(...row);
                }
            });

            for (let offset = 0; offset < dataRows.length; offset += batchSize) {
                const batch = dataRows.slice(offset, offset + batchSize);
                insertMany(batch);
            }

            totalImportedRows += dataRows.length;
            sheetResults.push({
                sheetName: sheet.name,
                tableName,
                rowCount: dataRows.length,
                columnCount: colNames.length,
                columns: colNames.map((name, i) => ({ name, type: columnTypes[i] })),
            });
        }
    } finally {
        db.close();
    }

    if (sheetResults.length === 0) {
        throw new ConnectorError(
            'The Excel workbook contains no visible sheets with tabular data.',
            'EMPTY_EXCEL_WORKBOOK'
        );
    }

    return {
        sheets: sheetResults,
        totalRows: totalImportedRows,
    };
}
