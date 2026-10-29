import 'server-only';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
    dataStoreTables,
    dataStoreSyncs,
    type DataStoreTable,
    type DataStoreColumnMeta,
} from '@src/lib/db/schema/data-store';
import { dataSources, queries } from '@src/lib/db/schema';
import { createConnector } from '@src/lib/connectors/factory';
import { runQuery } from '@src/lib/connectors/manager';
import { getDialect } from '@src/lib/connectors/dialects';
import { getPool, getPgliteInstance, isPglite } from '@src/lib/db/client';
import { assertUserCanSync, assertRowCountLimit } from './quotas';
import { sanitizeIdent, quoteIdent, normalizeColumnSnapshots } from './types-mapping';
import type { TableSyncResult } from './types';
import { auditLog } from '@src/lib/db/schema';

// In-process lock registry and abort controllers
const activeSyncLocks = new Set<string>();
const activeAbortControllers = new Map<string, AbortController>();

const BATCH_SIZE = 5000;
const STATEMENT_TIMEOUT_MS = 60000;

export function isSyncInProgress(tableId: string): boolean {
    return activeSyncLocks.has(tableId);
}

export function cancelSync(tableId: string): boolean {
    const controller = activeAbortControllers.get(tableId);
    if (controller) {
        controller.abort();
        return true;
    }
    return false;
}

/**
 * Execute a query directly on the application's PostgreSQL (or PGlite) database.
 */
export async function executeDbQuery(
    sqlText: string,
    params: unknown[] = []
): Promise<{ rows: Record<string, unknown>[]; rowCount: number }> {
    if (isPglite()) {
        const pglite = getPgliteInstance();
        if (!pglite) throw new Error('PGlite database is not initialized');
        const res = await pglite.query(sqlText, params);
        return {
            rows: (res.rows ?? []) as Record<string, unknown>[],
            rowCount: res.rows?.length ?? 0,
        };
    } else {
        const pool = getPool();
        if (!pool) throw new Error('PostgreSQL pool is not initialized');
        const res = await pool.query(sqlText, params);
        return {
            rows: (res.rows ?? []) as Record<string, unknown>[],
            rowCount: res.rowCount ?? 0,
        };
    }
}

/**
 * Execute a transactional sequence of DDL statements.
 */
async function executeTransaction(statements: { sql: string; params?: unknown[] }[]): Promise<void> {
    if (isPglite()) {
        const pglite = getPgliteInstance();
        if (!pglite) throw new Error('PGlite database is not initialized');
        await pglite.query('BEGIN');
        try {
            for (const stmt of statements) {
                await pglite.query(stmt.sql, stmt.params ?? []);
            }
            await pglite.query('COMMIT');
        } catch (err) {
            await pglite.query('ROLLBACK');
            throw err;
        }
    } else {
        const pool = getPool();
        if (!pool) throw new Error('PostgreSQL pool is not initialized');
        const client = await pool.connect();
        try {
            await client.query('BEGIN');
            for (const stmt of statements) {
                await client.query(stmt.sql, stmt.params ?? []);
            }
            await client.query('COMMIT');
        } catch (err) {
            await client.query('ROLLBACK');
            throw err;
        } finally {
            client.release();
        }
    }
}

/**
 * Main table synchronization engine.
 */
export async function syncTable(
    tableId: string,
    options: {
        triggeredBy?: string;
        forceFull?: boolean;
    } = {}
): Promise<TableSyncResult> {
    if (activeSyncLocks.has(tableId)) {
        throw new Error('A synchronization is already running for this table.');
    }

    activeSyncLocks.add(tableId);
    const abortController = new AbortController();
    activeAbortControllers.set(tableId, abortController);
    const signal = abortController.signal;

    const start = Date.now();
    let syncRecordId: string | null = null;
    let tableRecord: DataStoreTable | null = null;

    try {
        // 1. Fetch table metadata
        const [table] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, tableId))
            .limit(1);

        if (!table) {
            throw new Error(`Data store table ${tableId} not found`);
        }
        tableRecord = table;

        // Check user quota before running
        await assertUserCanSync(table.ownerId, table.id);

        // 2. Insert running sync record
        const [syncRow] = await db
            .insert(dataStoreSyncs)
            .values({
                tableId: table.id,
                status: 'running',
                rowsSynced: 0,
                triggeredBy: options.triggeredBy || 'manual',
            })
            .returning();
        syncRecordId = syncRow.id;

        // Update table status to syncing
        await db
            .update(dataStoreTables)
            .set({ status: 'syncing', lastError: null, updatedAt: new Date() })
            .where(eq(dataStoreTables.id, table.id));

        // 3. Ensure store schema exists
        await executeDbQuery(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(table.storeSchema)}`);

        // Check mode: incremental or full
        const isIncremental =
            !options.forceFull &&
            table.syncMode === 'incremental' &&
            Boolean(table.cursorColumn) &&
            table.status === 'synced' &&
            table.kind === 'table';

        let rowsSynced = 0;
        let finalColumns: DataStoreColumnMeta[] = table.columns;
        let newWatermark: string | null = table.lastWatermark;

        if (table.kind === 'query') {
            // Materialize Query Mode
            const res = await syncMaterializedQuery(table, signal);
            rowsSynced = res.rowCount;
            finalColumns = res.columns;
        } else if (isIncremental) {
            // Incremental Sync Mode
            const res = await syncTableIncremental(table, signal, syncRecordId);
            rowsSynced = res.rowsSynced;
            newWatermark = res.watermark;
        } else {
            // Full Sync Mode with atomic staging swap
            const res = await syncTableFull(table, signal, syncRecordId);
            rowsSynced = res.rowsSynced;
            finalColumns = res.columns;
            newWatermark = res.watermark;
        }

        // 4. Compute table size and verify row counts
        const stats = await computeTableStats(table.storeSchema, table.storeTable);
        const actualRowCount = stats.rowCount;
        const actualSizeBytes = stats.sizeBytes;

        assertRowCountLimit(actualRowCount);

        // 5. Update data_store_tables to 'synced'
        await db
            .update(dataStoreTables)
            .set({
                status: 'synced',
                rowCount: actualRowCount,
                sizeBytes: actualSizeBytes,
                columns: finalColumns,
                lastSyncedAt: new Date(),
                lastError: null,
                lastWatermark: newWatermark,
                updatedAt: new Date(),
            })
            .where(eq(dataStoreTables.id, table.id));

        // 6. Update sync history record to 'success'
        if (syncRecordId) {
            await db
                .update(dataStoreSyncs)
                .set({
                    status: 'success',
                    rowsSynced,
                    finishedAt: new Date(),
                })
                .where(eq(dataStoreSyncs.id, syncRecordId));
        }

        // Audit log
        await db.insert(auditLog).values({
            userId: table.ownerId,
            action: 'datastore:sync',
            dataSourceId: table.dataSourceId ?? null,
            host: null,
        });

        return {
            tableId: table.id,
            status: 'success',
            rowsSynced,
            sizeBytes: actualSizeBytes,
            durationMs: Date.now() - start,
        };
    } catch (err: unknown) {
        const errorMsg = err instanceof Error ? err.message : String(err);
        const isCancelled = signal.aborted || errorMsg.includes('aborted');
        const finalStatus = isCancelled ? 'cancelled' : 'error';

        if (tableRecord) {
            await db
                .update(dataStoreTables)
                .set({
                    status: isCancelled ? (tableRecord.status === 'syncing' ? 'pending' : tableRecord.status) : 'error',
                    lastError: errorMsg,
                    updatedAt: new Date(),
                })
                .where(eq(dataStoreTables.id, tableRecord.id));
        }

        if (syncRecordId) {
            await db
                .update(dataStoreSyncs)
                .set({
                    status: finalStatus,
                    error: errorMsg,
                    finishedAt: new Date(),
                })
                .where(eq(dataStoreSyncs.id, syncRecordId));
        }

        return {
            tableId,
            status: finalStatus,
            rowsSynced: 0,
            sizeBytes: 0,
            durationMs: Date.now() - start,
            error: errorMsg,
        };
    } finally {
        activeSyncLocks.delete(tableId);
        activeAbortControllers.delete(tableId);
    }
}

/**
 * Full table sync using staging table and atomic swap.
 */
async function syncTableFull(
    table: DataStoreTable,
    signal: AbortSignal,
    syncRecordId: string | null
): Promise<{ rowsSynced: number; columns: DataStoreColumnMeta[]; watermark: string | null }> {
    if (!table.dataSourceId) {
        throw new Error('Data source is required for table synchronization');
    }

    const [dataSource] = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.id, table.dataSourceId))
        .limit(1);

    if (!dataSource) {
        throw new Error('Source data source not found');
    }

    const connector = createConnector(dataSource);
    const stagingTable = `${table.storeTable}_staging_${Date.now()}`;

    try {
        // Introspect source table columns
        const snapshot = await connector.introspect();
        const sourceTableMeta = snapshot.tables.find(
            (t) => t.name.toLowerCase() === table.sourceTable.toLowerCase()
        );

        if (!sourceTableMeta) {
            throw new Error(`Source table "${table.sourceTable}" not found in data source`);
        }

        const pkCols: string[] =
            (sourceTableMeta as { primaryKey?: string[] }).primaryKey ||
            sourceTableMeta.columns.filter((c) => c.isPrimaryKey).map((c) => c.name);
        const columnsMeta = normalizeColumnSnapshots(sourceTableMeta.columns, pkCols);

        // Filter included columns if configured
        const includedSet = table.includedColumns && table.includedColumns.length > 0
            ? new Set(table.includedColumns.map((c) => c.toLowerCase()))
            : null;

        const activeColumns = includedSet
            ? columnsMeta.filter((c) => includedSet.has(c.name.toLowerCase()))
            : columnsMeta;

        if (activeColumns.length === 0) {
            throw new Error('No columns selected for synchronization');
        }

        // Build CREATE TABLE for staging
        const colDefs = activeColumns.map((col) => {
            const pgType = col.nativeType;
            return `${quoteIdent(col.name)} ${pgType}`;
        });

        const pkConstraint =
            pkCols.length > 0 &&
            pkCols.every((p) => activeColumns.some((c) => c.name.toLowerCase() === p.toLowerCase()))
                ? `, PRIMARY KEY (${pkCols.map((p) => quoteIdent(p)).join(', ')})`
                : '';

        const createStagingSql = `
            CREATE TABLE ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)} (
                ${colDefs.join(',\n')}${pkConstraint}
            )
        `;
        await executeDbQuery(createStagingSql);

        // Read and batch insert
        let offset = 0;
        let totalRows = 0;
        let lastSeenWatermark: string | null = null;
        const sourceDialect = getDialect(dataSource.type);

        const selectCols = activeColumns.map((c) => sourceDialect.quoteIdent(c.name)).join(', ');
        const pkCol = pkCols[0];
        let lastPkValue: unknown = null;

        while (true) {
            if (signal.aborted) throw new Error('Synchronization cancelled by user');

            let querySql: string;
            if (pkCol && lastPkValue !== null && typeof lastPkValue !== 'object') {
                querySql = `SELECT ${selectCols} FROM ${sourceDialect.quoteIdent(table.sourceTable)} WHERE ${sourceDialect.quoteIdent(pkCol)} > ${typeof lastPkValue === 'number' ? lastPkValue : `'${String(lastPkValue)}'`} ORDER BY ${sourceDialect.quoteIdent(pkCol)} ASC LIMIT ${BATCH_SIZE}`;
            } else {
                querySql = sourceDialect.paginate(
                    `SELECT ${selectCols} FROM ${sourceDialect.quoteIdent(table.sourceTable)}`,
                    BATCH_SIZE,
                    offset
                );
            }

            const pageResult = await connector.run({ kind: 'sql', sql: querySql });
            const rows = pageResult.rows;
            if (rows.length === 0) break;

            // Insert into staging table in chunks
            await insertBatchIntoTable(table.storeSchema, stagingTable, activeColumns, rows);

            totalRows += rows.length;
            offset += rows.length;

            if (pkCol) {
                const pkIdx = pageResult.columns.indexOf(pkCol);
                if (pkIdx !== -1 && rows.length > 0) {
                    lastPkValue = rows[rows.length - 1][pkIdx];
                }
            }

            if (table.cursorColumn) {
                const curIdx = pageResult.columns.indexOf(table.cursorColumn);
                if (curIdx !== -1 && rows.length > 0) {
                    const lastVal = rows[rows.length - 1][curIdx];
                    if (lastVal !== undefined && lastVal !== null) {
                        lastSeenWatermark = String(lastVal);
                    }
                }
            }

            // Periodically update progress
            if (syncRecordId) {
                await db
                    .update(dataStoreSyncs)
                    .set({ rowsSynced: totalRows })
                    .where(eq(dataStoreSyncs.id, syncRecordId));
            }

            if (rows.length < BATCH_SIZE) break;
        }

        // Create indexes on staging table for user-marked indexed columns
        const indexStatements: string[] = [];
        const pkSet = new Set(pkCols.map((p) => p.toLowerCase()));

        for (const idxCol of table.indexedColumns || []) {
            const matches = activeColumns.find((c) => c.name.toLowerCase() === idxCol.toLowerCase());
            if (matches && !pkSet.has(matches.name.toLowerCase())) {
                const safeName = sanitizeIdent(`idx_${stagingTable}_${matches.name}`);
                indexStatements.push(
                    `CREATE INDEX ${quoteIdent(safeName)} ON ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)} (${quoteIdent(matches.name)})`
                );
            }
        }

        for (const stmt of indexStatements) {
            await executeDbQuery(stmt);
        }

        // ATOMIC SWAP: drop live table if exists and rename staging table
        await executeTransaction([
            {
                sql: `DROP TABLE IF EXISTS ${quoteIdent(table.storeSchema)}.${quoteIdent(table.storeTable)}`,
            },
            {
                sql: `ALTER TABLE ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)} RENAME TO ${quoteIdent(table.storeTable)}`,
            },
        ]);

        return {
            rowsSynced: totalRows,
            columns: activeColumns,
            watermark: lastSeenWatermark,
        };
    } catch (err) {
        // Drop staging table on failure
        try {
            await executeDbQuery(`DROP TABLE IF EXISTS ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)}`);
        } catch {}
        throw err;
    } finally {
        await connector.close();
    }
}

/**
 * Incremental table sync upserting into the live table.
 */
async function syncTableIncremental(
    table: DataStoreTable,
    signal: AbortSignal,
    syncRecordId: string | null
): Promise<{ rowsSynced: number; watermark: string | null }> {
    if (!table.dataSourceId || !table.cursorColumn) {
        throw new Error('Incremental sync requires dataSourceId and cursorColumn');
    }

    const [dataSource] = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.id, table.dataSourceId))
        .limit(1);

    if (!dataSource) throw new Error('Data source not found');

    const connector = createConnector(dataSource);
    try {
        const sourceDialect = getDialect(dataSource.type);
        const pkColMeta = table.columns.find((c) => c.isPk);
        const pkCol = pkColMeta?.name;

        let lastWatermark = table.lastWatermark;
        let rowsSynced = 0;
        let offset = 0;

        const selectCols = table.columns.map((c) => sourceDialect.quoteIdent(c.name)).join(', ');

        while (true) {
            if (signal.aborted) throw new Error('Synchronization cancelled by user');

            let querySql: string;
            if (lastWatermark) {
                querySql = `SELECT ${selectCols} FROM ${sourceDialect.quoteIdent(table.sourceTable)} WHERE ${sourceDialect.quoteIdent(table.cursorColumn)} > '${lastWatermark}' ORDER BY ${sourceDialect.quoteIdent(table.cursorColumn)} ASC LIMIT ${BATCH_SIZE}`;
            } else {
                querySql = sourceDialect.paginate(
                    `SELECT ${selectCols} FROM ${sourceDialect.quoteIdent(table.sourceTable)} ORDER BY ${sourceDialect.quoteIdent(table.cursorColumn)} ASC`,
                    BATCH_SIZE,
                    offset
                );
            }

            const pageResult = await connector.run({ kind: 'sql', sql: querySql });
            const rows = pageResult.rows;
            if (rows.length === 0) break;

            // Upsert rows into live table
            await upsertBatchIntoTable(table.storeSchema, table.storeTable, table.columns, rows, pkCol);

            rowsSynced += rows.length;
            offset += rows.length;

            const curIdx = pageResult.columns.indexOf(table.cursorColumn);
            if (curIdx !== -1 && rows.length > 0) {
                const lastVal = rows[rows.length - 1][curIdx];
                if (lastVal !== undefined && lastVal !== null) {
                    lastWatermark = String(lastVal);
                }
            }

            if (syncRecordId) {
                await db
                    .update(dataStoreSyncs)
                    .set({ rowsSynced })
                    .where(eq(dataStoreSyncs.id, syncRecordId));
            }

            if (rows.length < BATCH_SIZE) break;
        }

        return { rowsSynced, watermark: lastWatermark };
    } finally {
        await connector.close();
    }
}

/**
 * Materialize an existing query into a store table.
 */
async function syncMaterializedQuery(
    table: DataStoreTable,
    signal: AbortSignal
): Promise<{ rowCount: number; columns: DataStoreColumnMeta[] }> {
    if (!table.queryId) {
        throw new Error('Query ID is required for materialized query');
    }

    const [q] = await db
        .select()
        .from(queries)
        .where(eq(queries.id, table.queryId))
        .limit(1);

    if (!q) throw new Error(`Query ${table.queryId} not found`);

    const [source] = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.id, q.dataSourceId))
        .limit(1);

    if (!source) throw new Error(`Data source for query not found`);

    if (signal.aborted) throw new Error('Synchronization cancelled by user');

    // Execute query via runQuery
    const queryResult = await runQuery(
        source,
        {
            kind: 'sql',
            sql: q.sql,
            params: [],
        },
        { limit: 100000, timeoutMs: STATEMENT_TIMEOUT_MS }
    );

    const resultColumns = queryResult.columns;
    const resultRows = queryResult.rows;

    const columnsMeta: DataStoreColumnMeta[] = resultColumns.map((name, idx) => {
        const sample = resultRows[0]?.[idx];
        let type = 'text';
        if (typeof sample === 'number' || typeof sample === 'bigint') {
            type = Number.isInteger(Number(sample)) ? 'integer' : 'double precision';
        } else if (typeof sample === 'boolean') {
            type = 'boolean';
        }
        return {
            name,
            type,
            nativeType: type,
            nullable: true,
            isPk: false,
            isIndexed: false,
            included: true,
        };
    });

    const stagingTable = `${table.storeTable}_staging_${Date.now()}`;

    try {
        const colDefs = columnsMeta.map((col) => `${quoteIdent(col.name)} ${col.nativeType}`);
        const createSql = `
            CREATE TABLE ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)} (
                ${colDefs.join(',\n')}
            )
        `;
        await executeDbQuery(createSql);

        if (resultRows.length > 0) {
            await insertBatchIntoTable(table.storeSchema, stagingTable, columnsMeta, resultRows);
        }

        // Atomic swap
        await executeTransaction([
            {
                sql: `DROP TABLE IF EXISTS ${quoteIdent(table.storeSchema)}.${quoteIdent(table.storeTable)}`,
            },
            {
                sql: `ALTER TABLE ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)} RENAME TO ${quoteIdent(table.storeTable)}`,
            },
        ]);

        return {
            rowCount: resultRows.length,
            columns: columnsMeta,
        };
    } catch (err) {
        try {
            await executeDbQuery(`DROP TABLE IF EXISTS ${quoteIdent(table.storeSchema)}.${quoteIdent(stagingTable)}`);
        } catch {}
        throw err;
    }
}

/**
 * Batch insert rows using multi-row parametrized INSERT.
 */
async function insertBatchIntoTable(
    schema: string,
    tableName: string,
    columns: DataStoreColumnMeta[],
    rows: unknown[][]
): Promise<void> {
    const CHUNK_SIZE = 500;
    const colNames = columns.map((c) => quoteIdent(c.name)).join(', ');

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const valuePlaceholders: string[] = [];
        const params: unknown[] = [];

        chunk.forEach((row, _rowIdx) => {
            const rowPlaceholders = columns.map((_, colIdx) => {
                params.push(row[colIdx] ?? null);
                return `$${params.length}`;
            });
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        const insertSql = `
            INSERT INTO ${quoteIdent(schema)}.${quoteIdent(tableName)} (${colNames})
            VALUES ${valuePlaceholders.join(', ')}
        `;
        await executeDbQuery(insertSql, params);
    }
}

/**
 * Upsert rows into an existing live table.
 */
async function upsertBatchIntoTable(
    schema: string,
    tableName: string,
    columns: DataStoreColumnMeta[],
    rows: unknown[][],
    pkColName?: string
): Promise<void> {
    if (!pkColName) {
        await insertBatchIntoTable(schema, tableName, columns, rows);
        return;
    }

    const CHUNK_SIZE = 250;
    const colNames = columns.map((c) => quoteIdent(c.name)).join(', ');
    const updateAssignments = columns
        .filter((c) => c.name.toLowerCase() !== pkColName.toLowerCase())
        .map((c) => `${quoteIdent(c.name)} = EXCLUDED.${quoteIdent(c.name)}`)
        .join(', ');

    for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
        const chunk = rows.slice(i, i + CHUNK_SIZE);
        const valuePlaceholders: string[] = [];
        const params: unknown[] = [];

        chunk.forEach((row) => {
            const rowPlaceholders = columns.map((_, colIdx) => {
                params.push(row[colIdx] ?? null);
                return `$${params.length}`;
            });
            valuePlaceholders.push(`(${rowPlaceholders.join(', ')})`);
        });

        const conflictAction = updateAssignments
            ? `DO UPDATE SET ${updateAssignments}`
            : `DO NOTHING`;

        const sql = `
            INSERT INTO ${quoteIdent(schema)}.${quoteIdent(tableName)} (${colNames})
            VALUES ${valuePlaceholders.join(', ')}
            ON CONFLICT (${quoteIdent(pkColName)}) ${conflictAction}
        `;
        await executeDbQuery(sql, params);
    }
}

/**
 * Compute table row count and size in bytes.
 */
export async function computeTableStats(
    schema: string,
    tableName: string
): Promise<{ rowCount: number; sizeBytes: number }> {
    try {
        const countRes = await executeDbQuery(
            `SELECT COUNT(*)::bigint AS count FROM ${quoteIdent(schema)}.${quoteIdent(tableName)}`
        );
        const rowCount = Number(countRes.rows[0]?.count ?? 0);

        let sizeBytes = 0;
        try {
            const sizeRes = await executeDbQuery(
                `SELECT pg_total_relation_size($1) AS size`,
                [`${schema}.${tableName}`]
            );
            sizeBytes = Number(sizeRes.rows[0]?.size ?? 0);
        } catch {
            // PGlite fallback
            sizeBytes = rowCount * 64;
        }

        return { rowCount, sizeBytes };
    } catch {
        return { rowCount: 0, sizeBytes: 0 };
    }
}
