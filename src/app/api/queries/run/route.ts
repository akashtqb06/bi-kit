import { NextResponse } from 'next/server';
import { z } from 'zod';
import { getDataSource, getCachedSchema, setCachedSchema } from '@src/lib/data-sources/service';
import { getConnector, runQuery } from '@src/lib/connectors/manager';
import { getDialect } from '@src/lib/connectors/dialects';
import { compile, CompileError } from '@src/lib/query-engine/compiler';
import { compileToPipeline } from '@src/lib/query-engine/mongo/compiler';
import { validateMongoPipeline } from '@src/lib/query-engine/mongo/validate-pipeline';
import { validateReadOnly, ReadOnlyValidationError } from '@src/lib/query-engine/validate-readonly';
import { handleApiError, apiError } from '@src/app/api/utils';
import { ConnectorError } from '@src/lib/connectors/types';
import type { QueryDefinition } from '@src/lib/query-engine/definition';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';

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
    mode: z.enum(['builder', 'sql', 'pipeline']),
    definition: z.unknown().optional(),
    sql: z.string().optional(),
    collection: z.string().optional(),
    pipeline: z.union([z.string(), z.array(z.unknown())]).optional(),
    page: z.number().int().positive().optional(),
    pageSize: z.number().int().positive().max(1000).optional(),
    refresh: z.boolean().optional(),
});

interface ColumnMeta {
    name: string;
    type: string;
}

interface RunQuerySuccess {
    data: {
        columns: ColumnMeta[];
        rows: unknown[][];
        rowCount: number;
        totalRows?: number;
        page?: number;
        pageSize?: number;
        truncated: boolean;
        durationMs: number;
        sql: string;
    };
}

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const body: unknown = await req.json();
        const input = runQuerySchema.parse(body);

        const source = getDataSource(input.dataSourceId);
        assertCan(user, 'view', { type: 'data_source', id: source.id, ownerId: source.ownerId });

        // -------------------------------------------------------------------
        // MongoDB Execution Branch
        // -------------------------------------------------------------------
        if (source.type === 'mongodb') {
            let collection: string;
            let pipeline: Record<string, unknown>[];
            let displaySql: string;

            if (input.mode === 'builder') {
                if (input.definition === undefined || input.definition === null) {
                    return apiError('Builder mode requires a definition.', 400);
                }

                let schema = getCachedSchema(source.id);
                if (!schema) {
                    const connector = await getConnector(source);
                    schema = await connector.introspect();
                    setCachedSchema(source.id, schema);
                }

                const schemaInfo = {
                    tables: schema.tables.map((t) => ({
                        name: t.name,
                        columns: t.columns.map((c) => ({
                            name: c.name,
                            type: c.nativeType || 'TEXT',
                            nullable: c.nullable ?? true,
                        })),
                    })),
                };

                let compiled;
                try {
                    compiled = compileToPipeline(
                        input.definition as QueryDefinition,
                        { schema: schemaInfo },
                        source.serverVersion || undefined
                    );
                } catch (err) {
                    if (err instanceof CompileError) {
                        return apiError(`Compile error: ${err.message}`, 400);
                    }
                    throw err;
                }

                collection = compiled.collection;
                pipeline = compiled.pipeline;
                displaySql = `db.${collection}.aggregate(${JSON.stringify(pipeline, null, 2)})`;
            } else {
                // Pipeline mode
                collection = input.collection || '';
                if (!collection && typeof input.definition === 'object' && input.definition) {
                    collection = (input.definition as { source?: { table?: string } }).source?.table || '';
                }
                if (!collection) {
                    return apiError('A target collection must be specified for pipeline mode.', 400);
                }

                let rawPipeline = input.pipeline;
                if (!rawPipeline && input.sql) {
                    rawPipeline = input.sql;
                }

                if (typeof rawPipeline === 'string') {
                    try {
                        pipeline = JSON.parse(rawPipeline);
                    } catch {
                        return apiError('Pipeline must be a valid JSON array.', 400);
                    }
                } else if (Array.isArray(rawPipeline)) {
                    pipeline = rawPipeline as Record<string, unknown>[];
                } else {
                    return apiError('A pipeline array is required for pipeline mode.', 400);
                }

                try {
                    validateMongoPipeline(pipeline);
                } catch (err) {
                    if (err instanceof ReadOnlyValidationError) {
                        return apiError(err.message, 400);
                    }
                    throw err;
                }

                displaySql = `db.${collection}.aggregate(${JSON.stringify(pipeline, null, 2)})`;
            }

            let resultColumns: string[];
            let resultRows: unknown[][];
            let rowCount: number;
            let totalRows: number;
            let truncated = false;
            let durationMs: number;

            if (input.page !== undefined) {
                const page = Math.max(1, input.page);
                const pageSize = Math.min(1000, Math.max(1, input.pageSize ?? 100));
                const offset = (page - 1) * pageSize;

                const countPipeline = [...pipeline, { $count: 'total' }];
                const pagePipeline = [...pipeline, { $skip: offset }, { $limit: pageSize }];

                const countResult = await runQuery(
                    source,
                    { kind: 'mongo', collection, pipeline: countPipeline },
                    { limit: 1, timeoutMs: TIMEOUT_MS, refresh: input.refresh }
                );
                totalRows = Number(countResult.rows[0]?.[0] ?? 0);

                const pageResult = await runQuery(
                    source,
                    { kind: 'mongo', collection, pipeline: pagePipeline },
                    { limit: pageSize, timeoutMs: TIMEOUT_MS, refresh: input.refresh }
                );

                resultColumns = pageResult.columns;
                resultRows = pageResult.rows;
                rowCount = pageResult.rowCount;
                truncated = pageResult.truncated;
                durationMs = countResult.durationMs + pageResult.durationMs;
            } else {
                const result = await runQuery(
                    source,
                    { kind: 'mongo', collection, pipeline },
                    { limit: ROW_CAP, timeoutMs: TIMEOUT_MS, refresh: input.refresh }
                );
                resultColumns = result.columns;
                resultRows = result.rows;
                rowCount = result.rowCount;
                totalRows = result.rowCount;
                truncated = result.truncated;
                durationMs = result.durationMs;
            }

            const columns: ColumnMeta[] = resultColumns.map((name, idx) => {
                const sample = resultRows[0]?.[idx];
                let type = 'text';
                if (typeof sample === 'number' || typeof sample === 'bigint') {
                    type = Number.isInteger(Number(sample)) ? 'integer' : 'real';
                } else if (typeof sample === 'boolean') {
                    type = 'boolean';
                }
                return { name, type };
            });

            return NextResponse.json({
                data: {
                    columns,
                    rows: resultRows,
                    rowCount,
                    totalRows,
                    page: input.page,
                    pageSize: input.pageSize,
                    truncated,
                    durationMs,
                    sql: displaySql,
                },
            });
        }

        const dialect = getDialect(source.type);

        let finalSql: string;
        let params: unknown[] = [];

        if (input.mode === 'builder') {
            if (input.definition === undefined || input.definition === null) {
                return apiError('Builder mode requires a definition.', 400);
            }

            // Get or introspect schema
            let schema = getCachedSchema(source.id);
            if (!schema) {
                const connector = await getConnector(source);
                schema = await connector.introspect();
                setCachedSchema(source.id, schema);
            }

            // Adapt SchemaSnapshot to SchemaInfo if needed
            const schemaInfo = {
                tables: schema.tables.map((t) => ({
                    name: t.name,
                    columns: t.columns.map((c) => ({
                        name: c.name,
                        type: c.nativeType || 'TEXT',
                        nullable: c.nullable ?? true,
                    })),
                })),
            };

            let compiled;
            try {
                compiled = compile(input.definition, { schema: schemaInfo }, dialect);
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
            // SQL mode
            if (!input.sql || input.sql.trim() === '') {
                return apiError('SQL mode requires a non-empty sql string.', 400);
            }

            try {
                validateReadOnly(input.sql, dialect);
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

        let resultColumns: string[];
        let resultRows: unknown[][];
        let rowCount: number;
        let totalRows: number;
        let truncated = false;
        let durationMs: number;

        if (input.page !== undefined) {
            const page = Math.max(1, input.page);
            const pageSize = Math.min(1000, Math.max(1, input.pageSize ?? 100));
            const offset = (page - 1) * pageSize;
            const cleanSql = finalSql.trim().replace(/;+$/, '');

            const countSql = `SELECT COUNT(*) AS total FROM (${cleanSql}) AS __count_wrapper`;
            const pageSql = dialect.paginate(`SELECT * FROM (${cleanSql}) AS __page_wrapper`, pageSize, offset);

            const countResult = await runQuery(
                source,
                { kind: 'sql', sql: countSql, params },
                { limit: 1, timeoutMs: TIMEOUT_MS, refresh: input.refresh }
            );
            totalRows = Number(countResult.rows[0]?.[0] ?? 0);

            const pageResult = await runQuery(
                source,
                { kind: 'sql', sql: pageSql, params },
                { limit: pageSize, timeoutMs: TIMEOUT_MS, refresh: input.refresh }
            );

            resultColumns = pageResult.columns;
            resultRows = pageResult.rows;
            rowCount = pageResult.rowCount;
            truncated = pageResult.truncated;
            durationMs = countResult.durationMs + pageResult.durationMs;
        } else {
            const result = await runQuery(
                source,
                { kind: 'sql', sql: finalSql, params },
                { limit: ROW_CAP, timeoutMs: TIMEOUT_MS, refresh: input.refresh }
            );
            resultColumns = result.columns;
            resultRows = result.rows;
            rowCount = result.rowCount;
            totalRows = result.rowCount;
            truncated = result.truncated;
            durationMs = result.durationMs;
        }

        const columns: ColumnMeta[] = resultColumns.map((name, idx) => {
            const sample = resultRows[0]?.[idx];
            let type = 'text';
            if (typeof sample === 'number' || typeof sample === 'bigint') {
                type = Number.isInteger(Number(sample)) ? 'integer' : 'real';
            } else if (typeof sample === 'boolean') {
                type = 'boolean';
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
            console.error('[Query execution error]', err.message);
            return apiError(err.message, 400);
        }
        if (err instanceof ReadOnlyValidationError) {
            console.error('[SQL validation error]', err.message);
            return apiError(err.message, 400);
        }
        return handleApiError(err);
    }
}
