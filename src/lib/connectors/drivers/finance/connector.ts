import {
    type Connector,
    type ConnectorContext,
    type QueryRequest,
    type QueryExecutionOptions,
    type QueryResult,
    type SchemaSnapshot,
    type TestResult,
    ConnectorError,
} from '../../types';
import { getDb, getPool, getPgliteInstance, isPglite } from '@src/lib/db/client';
import { dataSources } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
    FINANCE_VIRTUAL_TABLE_NAMES,
    getFinanceCatalogSnapshot,
} from '@src/lib/finance/virtual-tables/catalog';
import { getVirtualTableTemplate } from '@src/lib/finance/virtual-tables/templates';
import type { FinanceConfig } from './definition';

export class FinanceConnector implements Connector {
    private config: FinanceConfig;
    private ctx?: ConnectorContext;
    private resolvedUserId?: string;

    constructor(config: FinanceConfig, ctx?: ConnectorContext) {
        this.config = config;
        this.ctx = ctx;
        if (config.userId) {
            this.resolvedUserId = config.userId;
        }
    }

    private async getUserId(): Promise<string> {
        if (this.resolvedUserId) {
            return this.resolvedUserId;
        }

        if (this.ctx?.dataSourceId) {
            const db = getDb();
            const [ds] = await db
                .select({ ownerId: dataSources.ownerId })
                .from(dataSources)
                .where(eq(dataSources.id, this.ctx.dataSourceId))
                .limit(1);

            if (ds?.ownerId) {
                this.resolvedUserId = ds.ownerId;
                return this.resolvedUserId;
            }
        }

        throw new ConnectorError(
            'Cannot execute finance query without an authenticated user ID.',
            'UNAUTHORIZED_FINANCE_ACCESS'
        );
    }

    async test(): Promise<TestResult> {
        const start = Date.now();
        try {
            await this.executeQuery('SELECT 1 AS ok', []);
            return {
                ok: true,
                latencyMs: Date.now() - start,
                serverVersion: 'PostgreSQL (Personal Finance)',
            };
        } catch (err) {
            return {
                ok: false,
                latencyMs: Date.now() - start,
                message: err instanceof Error ? err.message : 'Database connectivity check failed',
            };
        }
    }

    async introspect(): Promise<SchemaSnapshot> {
        return getFinanceCatalogSnapshot();
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'sql') {
            throw new ConnectorError(
                'Only SQL queries are supported by the finance connector.',
                'INVALID_QUERY_KIND'
            );
        }

        const userId = await this.getUserId();
        const rawSql = request.sql.trim().replace(/;+$/, '');
        const rawParams = request.params ?? [];

        // Validate security: reject queries trying to access physical fin_* tables or system catalogs
        this.validateQuerySafety(rawSql);

        // Prepare scoped SQL with virtual table CTEs
        const { sql, params } = this.scopeQuery(rawSql, rawParams, userId);

        const limit = opts?.limit ?? 1000;
        const start = Date.now();

        const queryResult = await this.executeQuery(sql, params, opts?.timeoutMs);
        const durationMs = Date.now() - start;

        const columns = queryResult.fields.map((f) => f.name);
        let rows = queryResult.rows.map((row) => columns.map((col) => row[col]));

        let truncated = false;

        if (rows.length > limit) {
            rows = rows.slice(0, limit);
            truncated = true;
        }

        return {
            columns,
            rows,
            rowCount: rows.length,
            truncated,
            durationMs,
        };
    }

    async close(): Promise<void> {
        // Shared application pool; individual connectors do not close the singleton pool
    }

    private validateQuerySafety(sql: string): void {
        const lower = sql.toLowerCase();

        // Reject mutation statements
        if (/^\s*(insert|update|delete|drop|alter|create|truncate|grant|revoke)\b/i.test(lower)) {
            throw new ConnectorError(
                'Mutation queries are not permitted on the finance data source.',
                'READONLY_VIOLATION'
            );
        }

        // Reject access to internal tables directly
        const forbiddenDirectTables = [
            /\bfin_transactions\b/i,
            /\bfin_accounts\b/i,
            /\bfin_categories\b/i,
            /\bfin_valuations\b/i,
            /\bfin_budgets\b/i,
            /\bfin_recurring_rules\b/i,
            /\busers\b/i,
            /\bdata_sources\b/i,
            /\bpg_catalog\b/i,
            /\binformation_schema\b/i,
        ];

        // Check if the query references internal tables OUTSIDE of virtual table definitions
        for (const pattern of forbiddenDirectTables) {
            if (pattern.test(lower)) {
                // Allowed only if this query was already generated by compileFinanceQuery (has virtual table CTE headers)
                const isGeneratedCte = FINANCE_VIRTUAL_TABLE_NAMES.some((vt) =>
                    lower.includes(`"${vt}" as (`) || lower.includes(`${vt} as (`)
                );
                if (!isGeneratedCte) {
                    throw new ConnectorError(
                        'Direct access to internal persistence tables is forbidden. Use virtual tables.',
                        'ACCESS_DENIED'
                    );
                }
            }
        }
    }

    private scopeQuery(
        sql: string,
        params: unknown[],
        userId: string
    ): { sql: string; params: unknown[] } {
        // If query was already compiled by compileFinanceQuery, it already contains the CTEs and $1 bound
        const hasExistingVirtualCtes = FINANCE_VIRTUAL_TABLE_NAMES.some(
            (vt) => sql.includes(`"${vt}" AS (`) || sql.includes(`${vt} AS (`)
        );

        if (hasExistingVirtualCtes && params[0] === userId) {
            return { sql, params };
        }

        // Find which virtual tables are referenced in the query
        const referenced = FINANCE_VIRTUAL_TABLE_NAMES.filter((vt) => {
            const regex = new RegExp(`(?:"${vt}"|\\b${vt}\\b)`, 'i');
            return regex.test(sql);
        });

        if (referenced.length === 0) {
            throw new ConnectorError(
                'Finance queries must reference at least one virtual table from the catalog.',
                'INVALID_TABLE'
            );
        }

        // Generate CTEs for all referenced virtual tables with $1 as userId
        const ctes = referenced.map((vt) => `"${vt}" AS (\n${getVirtualTableTemplate(vt, '$1')}\n)`);

        // Shift existing parameters $1 -> $2, $2 -> $3, etc.
        const shiftedSql = sql.replace(/\$(\d+)/g, (_match, num) => {
            const nextIdx = parseInt(num, 10) + 1;
            return `$${nextIdx}`;
        });

        // Prepend CTEs into SQL
        let finalSql: string;
        if (/^\s*WITH\s+/i.test(shiftedSql)) {
            finalSql = shiftedSql.replace(/^\s*WITH\s+/i, `WITH ${ctes.join(',\n')},\n`);
        } else {
            finalSql = `WITH ${ctes.join(',\n')}\n${shiftedSql}`;
        }

        const finalParams = [userId, ...params];
        return { sql: finalSql, params: finalParams };
    }

    private async executeQuery(
        sql: string,
        params: unknown[],
        timeoutMs = 30000
    ): Promise<{ fields: { name: string }[]; rows: Record<string, unknown>[] }> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
                reject(new ConnectorError('Query execution timed out.', 'TIMEOUT'));
            }, timeoutMs);
            if (typeof timer.unref === 'function') timer.unref();
        });

        const runPromise = (async () => {
            if (isPglite()) {
                const pglite = getPgliteInstance();
                if (!pglite) {
                    throw new ConnectorError('PGlite instance is not initialized.', 'CONNECTION_ERROR');
                }
                const res = await pglite.query(sql, params);
                return {
                    fields: res.fields.map((f) => ({ name: f.name })),
                    rows: (res.rows ?? []) as Record<string, unknown>[],
                };
            } else {
                const pool = getPool();
                if (!pool) {
                    throw new ConnectorError('PostgreSQL pool is not initialized.', 'CONNECTION_ERROR');
                }
                const res = await pool.query(sql, params);
                return {
                    fields: res.fields.map((f) => ({ name: f.name })),
                    rows: (res.rows ?? []) as Record<string, unknown>[],
                };
            }
        })();

        return Promise.race([runPromise, timeoutPromise]);
    }
}
