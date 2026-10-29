import 'server-only';
import {
    type Connector,
    type ConnectorContext,
    type ColumnDataType,
    type QueryRequest,
    type QueryExecutionOptions,
    type QueryResult,
    type SchemaSnapshot,
    type TestResult,
    ConnectorError,
} from '../../types';
import { getDb, getPool, getPgliteInstance, isPglite } from '@src/lib/db/client';
import { dataSources } from '@src/lib/db/schema';
import { dataStoreTables } from '@src/lib/db/schema/data-store';
import { eq, and } from 'drizzle-orm';
import type { DatastoreConfig } from './definition';
import { quoteIdent } from '@src/lib/data-store/types-mapping';

export class DatastoreConnector implements Connector {
    private config: DatastoreConfig;
    private ctx?: ConnectorContext;
    private resolvedUserId?: string;

    constructor(config: DatastoreConfig, ctx?: ConnectorContext) {
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
            'Cannot execute Data Store query without an authenticated user context.',
            'UNAUTHORIZED_DATASTORE_ACCESS'
        );
    }

    async test(): Promise<TestResult> {
        const start = Date.now();
        try {
            await this.executeQuery('SELECT 1 AS ok', []);
            return {
                ok: true,
                latencyMs: Date.now() - start,
                serverVersion: 'PostgreSQL (Data Store)',
            };
        } catch (err) {
            return {
                ok: false,
                latencyMs: Date.now() - start,
                message: err instanceof Error ? err.message : 'Data Store connection check failed',
            };
        }
    }

    async introspect(): Promise<SchemaSnapshot> {
        const userId = await this.getUserId();
        const db = getDb();

        const userTables = await db
            .select()
            .from(dataStoreTables)
            .where(
                and(
                    eq(dataStoreTables.ownerId, userId),
                    eq(dataStoreTables.status, 'synced')
                )
            );

        return {
            tables: userTables.map((t) => ({
                name: t.storeTable,
                kind: 'table' as const,
                columns: t.columns.map((c) => ({
                    name: c.name,
                    type: (c.type as ColumnDataType) || 'text',
                    nativeType: c.nativeType,
                    nullable: c.nullable ?? true,
                    isPrimaryKey: c.isPk ?? false,
                })),
            })),
            schemas: [],
        };
    }

    async run(request: QueryRequest, opts?: QueryExecutionOptions): Promise<QueryResult> {
        if (request.kind !== 'sql') {
            throw new ConnectorError(
                'Only SQL queries are supported by the Data Store connector.',
                'INVALID_QUERY_KIND'
            );
        }

        const userId = await this.getUserId();
        const rawSql = request.sql.trim().replace(/;+$/, '');
        const rawParams = request.params ?? [];

        // Validate security: reject queries trying to execute mutations
        this.validateQuerySafety(rawSql);

        // Scope and qualify query strictly using verified tables from the user's catalog
        const { sql, params } = await this.scopeQuery(rawSql, rawParams, userId);

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
                'Mutation queries are not permitted on the Data Store.',
                'READONLY_VIOLATION'
            );
        }

        // Reject attempts to access system schemas or internal tables directly
        const forbiddenPatterns = [
            /\bpg_catalog\b/i,
            /\binformation_schema\b/i,
            /\bpg_\w+\b/i,
            /\busers\b/i,
            /\bsessions\b/i,
            /\bdata_sources\b/i,
            /\bfin_\w+\b/i,
            /\bstore_[a-zA-Z0-9_]+\b/i, // cannot specify raw store_ schemas directly in SQL
        ];

        for (const pattern of forbiddenPatterns) {
            if (pattern.test(lower)) {
                throw new ConnectorError(
                    'Direct access to internal persistence tables or schemas is forbidden.',
                    'ACCESS_DENIED'
                );
            }
        }
    }

    private async scopeQuery(
        sql: string,
        params: unknown[],
        userId: string
    ): Promise<{ sql: string; params: unknown[] }> {
        const db = getDb();
        const userTables = await db
            .select()
            .from(dataStoreTables)
            .where(
                and(
                    eq(dataStoreTables.ownerId, userId),
                    eq(dataStoreTables.status, 'synced')
                )
            );

        if (userTables.length === 0) {
            throw new ConnectorError(
                'No synchronized Data Store tables available for querying.',
                'NO_TABLES'
            );
        }

        // Match table names referenced in query
        let rewrittenSql = sql;
        let matchedAny = false;

        for (const tbl of userTables) {
            const tableRegex = new RegExp(`(?:"${tbl.storeTable}"|\\b${tbl.storeTable}\\b)`, 'gi');
            if (tableRegex.test(rewrittenSql)) {
                matchedAny = true;
                const qualifiedName = `${quoteIdent(tbl.storeSchema)}.${quoteIdent(tbl.storeTable)}`;
                rewrittenSql = rewrittenSql.replace(tableRegex, qualifiedName);
            }
        }

        if (!matchedAny) {
            throw new ConnectorError(
                'Data Store query must reference a table from your Data Store catalog.',
                'INVALID_TABLE'
            );
        }

        return { sql: rewrittenSql, params };
    }

    private async executeQuery(
        sql: string,
        params: unknown[],
        timeoutMs = 30000
    ): Promise<{ fields: { name: string }[]; rows: Record<string, unknown>[] }> {
        const timeoutPromise = new Promise<never>((_, reject) => {
            const timer = setTimeout(() => {
                reject(new ConnectorError('Query execution timed out.', 'QUERY_TIMEOUT'));
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

