import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataSource } from '@src/lib/data-sources/service';
import { createConnector } from '@src/lib/connectors/factory';
import { compile, CompileError } from '@src/lib/query-engine/compiler';
import { validateReadOnlyShape, ReadOnlyValidationError } from '@src/lib/query-engine/validate-readonly';
import { handleApiError, apiError } from '@src/app/api/utils';
import { ConnectorError, type SqlParam } from '@src/lib/connectors/types';

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const ROW_CAP = 1_000;
const TIMEOUT_MS = 10_000;

// ---------------------------------------------------------------------------
// Request schema
// ---------------------------------------------------------------------------

const runQuerySchema = z.object({
    dataSourceId: z.string().min(1),
    mode: z.enum(['builder', 'sql']),
    definition: z.unknown().optional(), // builder mode: raw definition object
    sql: z.string().optional(), // sql mode: raw SQL string
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(1000).optional(),
});

// ---------------------------------------------------------------------------
// Response types
// ---------------------------------------------------------------------------

interface ColumnMeta {
    name: string;
    type: string;
}

interface RunQuerySuccess {
    data: {
        columns: ColumnMeta[];
        rows: SqlParam[][];
        rowCount: number;
        totalRows?: number;
        page?: number;
        pageSize?: number;
        truncated: boolean;
        durationMs: number;
        sql: string;
    };
}

// ---------------------------------------------------------------------------
// POST /api/queries/run
// ---------------------------------------------------------------------------

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const body: unknown = await req.json();
        const input = runQuerySchema.parse(body);

        // Load the data source (validates it exists, no config exposed)
        const source = getDataSource(input.dataSourceId);

        let finalSql: string;
        let params: unknown[] = [];

        if (input.mode === 'builder') {
            if (input.definition === undefined || input.definition === null) {
                return apiError('Builder mode requires a definition.', 400);
            }

            // Get schema for compiler validation
            const connector = createConnector(source);
            let schema;
            try {
                schema = connector.getSchema();
            } finally {
                connector.close();
            }

            // Compile definition → SQL
            let compiled;
            try {
                compiled = compile(input.definition, { schema });
            } catch (err) {
                if (err instanceof CompileError) {
                    console.error('[Compile error]', err.message);
                    return apiError(`Compile error: ${err.message}`, 400);
                }
                throw err;
            }

            finalSql = compiled.sql;
            params = compiled.params;
        } else {
            // sql mode
            if (!input.sql || input.sql.trim() === '') {
                return apiError('SQL mode requires a non-empty sql string.', 400);
            }

            try {
                validateReadOnlyShape(input.sql);
            } catch (err) {
                if (err instanceof ReadOnlyValidationError) {
                    console.error('[SQL validation error]', err.message);
                    return apiError(err.message, 400);
                }
                throw err;
            }

            finalSql = input.sql.trim().replace(/;+$/, '');
            params = [];
        }

        // Execute via connector
        const connector = createConnector(source);
        let resultColumns: string[];
        let resultRows: SqlParam[][];
        let rowCount: number;
        let totalRows: number;
        let truncated = false;
        let durationMs: number;

        try {
            if (input.page !== undefined) {
                const page = Math.max(1, input.page);
                const pageSize = Math.min(1000, Math.max(1, input.pageSize ?? 100));
                const offset = (page - 1) * pageSize;
                const cleanSql = finalSql.trim().replace(/;+$/, '');

                let countSql: string;
                let pageSql: string;
                let countParams: SqlParam[];
                let pageParams: SqlParam[];

                if (input.mode === 'sql') {
                    countSql = `SELECT COUNT(*) AS total FROM (${cleanSql}) AS __count_wrapper`;
                    pageSql = `SELECT * FROM (${cleanSql}) AS __page_wrapper LIMIT ${pageSize} OFFSET ${offset}`;
                    countParams = [];
                    pageParams = [];
                } else {
                    countSql = `SELECT COUNT(*) AS total FROM (${cleanSql}) AS __count_wrapper`;
                    pageSql = `SELECT * FROM (${cleanSql}) AS __page_wrapper LIMIT ? OFFSET ?`;
                    countParams = params as SqlParam[];
                    pageParams = [...(params as SqlParam[]), pageSize, offset];
                }

                const countResult = await connector.execute(countSql, countParams, {
                    limit: 1,
                    timeoutMs: TIMEOUT_MS,
                });
                totalRows = Number(countResult.rows[0]?.[0] ?? 0);

                const pageResult = await connector.execute(pageSql, pageParams, {
                    limit: pageSize,
                    timeoutMs: TIMEOUT_MS,
                });

                resultColumns = pageResult.columns;
                resultRows = pageResult.rows;
                rowCount = pageResult.rowCount;
                truncated = pageResult.truncated;
                durationMs = countResult.executionTimeMs + pageResult.executionTimeMs;
            } else {
                const result = await connector.execute(finalSql, params as SqlParam[], {
                    limit: ROW_CAP,
                    timeoutMs: TIMEOUT_MS,
                });
                resultColumns = result.columns;
                resultRows = result.rows;
                rowCount = result.rowCount;
                totalRows = result.rowCount;
                truncated = result.truncated;
                durationMs = result.executionTimeMs;
            }
        } finally {
            connector.close();
        }

        // Build column metadata — types come from the first row values (runtime heuristic)
        // since SQLite doesn't give us typed column info from arbitrary queries
        const columns: ColumnMeta[] = resultColumns.map((name, idx) => {
            const sample = resultRows[0]?.[idx];
            let type = 'text';
            if (typeof sample === 'number' || typeof sample === 'bigint') {
                type = Number.isInteger(Number(sample)) ? 'integer' : 'real';
            } else if (sample instanceof Buffer) {
                type = 'blob';
            }
            return { name, type };
        });

        const response: RunQuerySuccess = {
            data: {
                columns,
                rows: resultRows,
                rowCount,
                totalRows,
                page: input.page,
                pageSize: input.pageSize,
                truncated,
                durationMs,
                sql: finalSql,
            },
        };

        return NextResponse.json(response);
    } catch (err) {
        if (err instanceof ConnectorError && err.code === 'QUERY_TIMEOUT') {
            return apiError('Query exceeded its time limit.', 504);
        }
        if (err instanceof ConnectorError) {
            console.error('[SQLite query error]', err.message);
            return apiError(err.message, 400);
        }
        if (err instanceof ReadOnlyValidationError) {
            console.error('[SQL validation error]', err.message);
            return apiError(err.message, 400);
        }
        return handleApiError(err);
    }
}
