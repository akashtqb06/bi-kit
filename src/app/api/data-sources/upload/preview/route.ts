import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import Papa from 'papaparse';
import ExcelJS from 'exceljs';
import Database from 'better-sqlite3';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, apiError } from '@src/app/api/utils';
import {
    createTempUploadDir,
    validateFileSignature,
    FILE_MAX_BYTES,
    FILE_MAX_MB,
    cleanupExpiredTempUploads,
} from '@src/lib/connectors/storage';
import { ConnectorError } from '@src/lib/connectors/errors';
import { inferCsvColumnType, sanitizeColumnNames } from '@src/lib/data-sources/csv-utils';

export async function POST(req: Request): Promise<NextResponse> {
    try {
        await requireUserApi();
        cleanupExpiredTempUploads();

        const formData = await req.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return apiError('No file was provided in the upload request.', 400);
        }

        if (file.size === 0) {
            return apiError('The uploaded file is empty.', 400);
        }

        if (file.size > FILE_MAX_BYTES) {
            return apiError(`The file exceeds the maximum limit of ${FILE_MAX_MB} MB.`, 400);
        }

        const fileName = file.name;
        const ext = path.extname(fileName).toLowerCase();

        let type: 'sqlite' | 'excel' | 'csv';
        if (ext === '.xlsx' || ext === '.xlsm') {
            type = 'excel';
        } else if (ext === '.xls') {
            return apiError('Legacy .xls format is not supported. Please save your file as .xlsx or .xlsm.', 400);
        } else if (ext === '.db' || ext === '.sqlite' || ext === '.sqlite3') {
            type = 'sqlite';
        } else if (ext === '.csv' || ext === '.txt') {
            type = 'csv';
        } else {
            return apiError(`Unsupported file extension: ${ext}. Allowed: .xlsx, .xlsm, .csv, .db, .sqlite.`, 400);
        }

        // Save to temporary upload directory
        const { token, dir } = createTempUploadDir();
        const tempFilePath = path.join(dir, `upload${ext}`);

        const arrayBuffer = await file.arrayBuffer();
        const buffer = Buffer.from(arrayBuffer);
        fs.writeFileSync(tempFilePath, buffer);

        // Validate file signature / magic bytes
        try {
            validateFileSignature(tempFilePath, type);
        } catch (err) {
            fs.rmSync(dir, { recursive: true, force: true });
            throw err;
        }

        let previewData: unknown = {};

        if (type === 'excel') {
            const workbook = new ExcelJS.Workbook();
            await workbook.xlsx.readFile(tempFilePath);
            const sheets = workbook.worksheets.map((sheet) => {
                const isHidden = sheet.state === 'hidden' || sheet.state === 'veryHidden';
                let headerRowNumber = 1;
                sheet.eachRow((row, rowNumber) => {
                    if (headerRowNumber === 1 && row.values && (row.values as unknown[]).length > 0) {
                        headerRowNumber = rowNumber;
                    }
                });

                const sampleHeaders: string[] = [];
                const sampleRows: unknown[][] = [];

                const headerRow = sheet.getRow(headerRowNumber);
                headerRow.eachCell({ includeEmpty: false }, (cell) => {
                    sampleHeaders.push(String(cell.value || ''));
                });

                sheet.eachRow({ includeEmpty: false }, (row, rowNumber) => {
                    if (rowNumber > headerRowNumber && sampleRows.length < 5) {
                        const rowVals: unknown[] = [];
                        row.eachCell({ includeEmpty: true }, (c) => {
                            rowVals.push(c.value);
                        });
                        sampleRows.push(rowVals);
                    }
                });

                return {
                    name: sheet.name,
                    hidden: isHidden,
                    rowCountEstimate: Math.max(0, sheet.rowCount - 1),
                    headers: sampleHeaders,
                    sampleRows,
                };
            });

            previewData = { sheets };
        } else if (type === 'csv') {
            let text = buffer.toString('utf8');
            // Strip BOM if present
            if (text.charCodeAt(0) === 0xfeff) {
                text = text.slice(1);
            }

            const parsed = Papa.parse<Record<string, string>>(text.slice(0, 50000), {
                header: true,
                skipEmptyLines: true,
            });

            const rawHeaders = parsed.meta.fields ?? [];
            const sanitizedHeaders = sanitizeColumnNames(rawHeaders);
            const rows = parsed.data.slice(0, 5);

            const columns = sanitizedHeaders.map((header, index) => ({
                name: header,
                type: inferCsvColumnType(rows.map((r) => r[rawHeaders[index] ?? ''] ?? '')),
            }));

            previewData = {
                delimiter: parsed.meta.delimiter,
                columns,
                sampleRows: rows.map((row) => rawHeaders.map((h) => row[h] ?? '')),
            };
        } else if (type === 'sqlite') {
            const db = new Database(tempFilePath, { readonly: true, fileMustExist: true });
            try {
                const quickCheck = db.prepare('PRAGMA quick_check').get() as Record<string, unknown> | undefined;
                const checkVal = Object.values(quickCheck || {})[0];
                if (checkVal !== 'ok') {
                    throw new ConnectorError(`SQLite integrity check failed: ${String(checkVal)}`, 'CORRUPTED_SQLITE');
                }
                const tables = db
                    .prepare(`SELECT name, type FROM sqlite_master WHERE type IN ('table', 'view') AND name NOT LIKE 'sqlite_%' ORDER BY name`)
                    .all() as { name: string; type: string }[];
                previewData = { tables };
            } finally {
                db.close();
            }
        }

        // Store metadata alongside upload for finalization
        fs.writeFileSync(
            path.join(dir, 'meta.json'),
            JSON.stringify({
                type,
                fileName,
                size: file.size,
                ext,
                previewData,
                uploadedAt: new Date().toISOString(),
            })
        );

        return NextResponse.json({
            data: {
                previewToken: token,
                type,
                fileName,
                size: file.size,
                preview: previewData,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}
