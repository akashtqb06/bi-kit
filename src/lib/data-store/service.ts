import 'server-only';
import { and, desc, eq, ilike, or } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
    dataStoreTables,
    dataStoreSyncs,
    type DataStoreTable,
    type DataStoreSync,
} from '@src/lib/db/schema/data-store';
import { dataSources, queries, auditLog, type DataSource } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import { executeDbQuery, syncTable } from './sync-engine';
import { sanitizeIdent, quoteIdent } from './types-mapping';
import type { CreateDataStoreTablesInput, UpdateTableSettingsInput } from './types';
import { NotFoundError } from '@src/lib/connectors/types';

export async function getOrCreateDatastoreSource(userId: string): Promise<DataSource> {
    const [existing] = await db
        .select()
        .from(dataSources)
        .where(
            and(
                eq(dataSources.ownerId, userId),
                eq(dataSources.type, 'datastore')
            )
        )
        .limit(1);

    if (existing) return existing;

    const [created] = await db
        .insert(dataSources)
        .values({
            id: newId(),
            ownerId: userId,
            name: 'Data Store',
            slug: `datastore-${userId}`,
            type: 'datastore',
            config: { isBuiltin: true, userId },
            status: 'ok',
        })
        .returning();

    return created;
}


export function getStoreSchemaName(userId: string): string {
    const safeUser = userId.replace(/[^a-zA-Z0-9_]/g, '_');
    return `store_${safeUser}`;
}

export async function listStoreTables(
    userId: string,
    filters?: { dataSourceId?: string; search?: string }
): Promise<(DataStoreTable & { dataSourceName?: string; queryName?: string })[]> {
    const conditions = [eq(dataStoreTables.ownerId, userId)];

    if (filters?.dataSourceId && filters.dataSourceId !== '__all__') {
        conditions.push(eq(dataStoreTables.dataSourceId, filters.dataSourceId));
    }

    if (filters?.search && filters.search.trim() !== '') {
        const pattern = `%${filters.search.trim()}%`;
        conditions.push(
            or(
                ilike(dataStoreTables.storeTable, pattern),
                ilike(dataStoreTables.sourceTable, pattern)
            )!
        );
    }

    const rows = await db
        .select({
            table: dataStoreTables,
            dataSourceName: dataSources.name,
            queryName: queries.name,
        })
        .from(dataStoreTables)
        .leftJoin(dataSources, eq(dataStoreTables.dataSourceId, dataSources.id))
        .leftJoin(queries, eq(dataStoreTables.queryId, queries.id))
        .where(and(...conditions))
        .orderBy(desc(dataStoreTables.createdAt));

    return rows.map((r) => ({
        ...r.table,
        dataSourceName: r.dataSourceName ?? undefined,
        queryName: r.queryName ?? undefined,
    }));
}

export async function getStoreTable(
    userId: string,
    tableId: string
): Promise<DataStoreTable> {
    const [row] = await db
        .select()
        .from(dataStoreTables)
        .where(and(eq(dataStoreTables.id, tableId), eq(dataStoreTables.ownerId, userId)))
        .limit(1);

    if (!row) {
        throw new NotFoundError(`Data store table ${tableId} not found`);
    }
    return row;
}

export async function createStoreTables(
    userId: string,
    input: CreateDataStoreTablesInput
): Promise<DataStoreTable[]> {
    const [ds] = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.id, input.dataSourceId))
        .limit(1);

    if (!ds) {
        throw new NotFoundError(`Data source ${input.dataSourceId} not found`);
    }

    const storeSchema = getStoreSchemaName(userId);
    const created: DataStoreTable[] = [];

    // Ensure schema exists
    await executeDbQuery(`CREATE SCHEMA IF NOT EXISTS ${quoteIdent(storeSchema)}`);

    for (const item of input.tables) {
        let storeTableName = sanitizeIdent(item.sourceTable);

        // Check collision in this user's schema
        const [existing] = await db
            .select()
            .from(dataStoreTables)
            .where(
                and(
                    eq(dataStoreTables.storeSchema, storeSchema),
                    eq(dataStoreTables.storeTable, storeTableName)
                )
            )
            .limit(1);

        if (existing) {
            // Collision: prefix with short data source slug
            const prefix = sanitizeIdent(ds.slug || ds.name).slice(0, 10);
            storeTableName = `${prefix}_${storeTableName}`;
        }

        const [newRow] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: userId,
                dataSourceId: ds.id,
                kind: 'table',
                sourceTable: item.sourceTable,
                storeSchema,
                storeTable: storeTableName,
                schedule: item.schedule || 'manual',
                syncMode: item.syncMode || 'full',
                cursorColumn: item.cursorColumn || null,
                status: 'pending',
            })
            .returning();

        created.push(newRow);

        // Log audit
        await db.insert(auditLog).values({
            userId,
            action: 'datastore:create_table',
            dataSourceId: ds.id,
            host: null,
        });
    }

    return created;
}

export async function updateStoreTableSettings(
    userId: string,
    tableId: string,
    settings: UpdateTableSettingsInput
): Promise<DataStoreTable> {
    const table = await getStoreTable(userId, tableId);

    const updatePayload: Partial<typeof dataStoreTables.$inferInsert> = {
        updatedAt: new Date(),
    };

    if (settings.schedule !== undefined) updatePayload.schedule = settings.schedule;
    if (settings.syncMode !== undefined) updatePayload.syncMode = settings.syncMode;
    if (settings.cursorColumn !== undefined) updatePayload.cursorColumn = settings.cursorColumn;
    if (settings.indexedColumns !== undefined) updatePayload.indexedColumns = settings.indexedColumns;
    if (settings.includedColumns !== undefined) updatePayload.includedColumns = settings.includedColumns;

    if (settings.storeTable && settings.storeTable !== table.storeTable) {
        const newName = sanitizeIdent(settings.storeTable);
        // Rename physical table if it exists
        try {
            await executeDbQuery(
                `ALTER TABLE ${quoteIdent(table.storeSchema)}.${quoteIdent(table.storeTable)} RENAME TO ${quoteIdent(newName)}`
            );
        } catch {
            // table might not be synced yet
        }
        updatePayload.storeTable = newName;
    }

    const [updated] = await db
        .update(dataStoreTables)
        .set(updatePayload)
        .where(and(eq(dataStoreTables.id, tableId), eq(dataStoreTables.ownerId, userId)))
        .returning();

    // Log audit
    await db.insert(auditLog).values({
        userId,
        action: 'datastore:update_settings',
        dataSourceId: table.dataSourceId ?? null,
        host: null,
    });

    return updated;
}

export async function deleteStoreTable(
    userId: string,
    tableId: string
): Promise<void> {
    const table = await getStoreTable(userId, tableId);

    // Drop physical table in schema
    try {
        await executeDbQuery(
            `DROP TABLE IF EXISTS ${quoteIdent(table.storeSchema)}.${quoteIdent(table.storeTable)} CASCADE`
        );
    } catch {
        // ignore
    }

    // Delete record from data_store_tables (cascades to syncs)
    await db
        .delete(dataStoreTables)
        .where(and(eq(dataStoreTables.id, tableId), eq(dataStoreTables.ownerId, userId)));

    // Log audit
    await db.insert(auditLog).values({
        userId,
        action: 'datastore:delete',
        dataSourceId: table.dataSourceId ?? null,
        host: null,
    });
}

export async function previewStoreTable(
    userId: string,
    tableId: string,
    limit = 100
): Promise<{ columns: { name: string; type: string }[]; rows: unknown[][] }> {
    const table = await getStoreTable(userId, tableId);

    if (table.status !== 'synced') {
        return {
            columns: table.columns.map((c) => ({ name: c.name, type: c.type })),
            rows: [],
        };
    }

    const colNames = table.columns.map((c) => quoteIdent(c.name)).join(', ');
    const sql = `
        SELECT ${colNames || '*'}
        FROM ${quoteIdent(table.storeSchema)}.${quoteIdent(table.storeTable)}
        LIMIT ${limit}
    `;

    const res = await executeDbQuery(sql);
    const colList = table.columns.length > 0
        ? table.columns.map((c) => ({ name: c.name, type: c.type }))
        : Object.keys(res.rows[0] || {}).map((name) => ({ name, type: 'text' }));

    const rows = res.rows.map((row) => colList.map((col) => row[col.name]));

    return { columns: colList, rows };
}

export async function getSyncHistory(
    tableId: string,
    limit = 20
): Promise<DataStoreSync[]> {
    return db
        .select()
        .from(dataStoreSyncs)
        .where(eq(dataStoreSyncs.tableId, tableId))
        .orderBy(desc(dataStoreSyncs.startedAt))
        .limit(limit);
}

/**
 * Checks whether any tables with status 'synced' are missing their physical PostgreSQL relation (e.g. after a restore).
 */
export async function checkNeedsResync(userId: string): Promise<boolean> {
    const tables = await db
        .select()
        .from(dataStoreTables)
        .where(and(eq(dataStoreTables.ownerId, userId), eq(dataStoreTables.status, 'synced')));

    for (const tbl of tables) {
        try {
            const checkSql = `SELECT to_regclass($1) AS reg`;
            const res = await executeDbQuery(checkSql, [`"${tbl.storeSchema}"."${tbl.storeTable}"`]);
            if (!res.rows[0]?.reg) {
                return true;
            }
        } catch {
            return true;
        }
    }
    return false;
}

export async function resyncAll(userId: string): Promise<void> {
    const tables = await db
        .select()
        .from(dataStoreTables)
        .where(eq(dataStoreTables.ownerId, userId));

    for (const tbl of tables) {
        void syncTable(tbl.id, { triggeredBy: 'resync_all', forceFull: true });
    }
}

/**
 * Materializes an existing query into a store table.
 */
export async function materializeQuery(
    userId: string,
    queryId: string
): Promise<DataStoreTable> {
    const [q] = await db
        .select()
        .from(queries)
        .where(eq(queries.id, queryId))
        .limit(1);

    if (!q) throw new NotFoundError(`Query ${queryId} not found`);

    const storeSchema = getStoreSchemaName(userId);
    const safeSlug = sanitizeIdent(q.name || 'query');
    const storeTable = `query_${safeSlug}`;

    // Upsert into data_store_tables
    const [existing] = await db
        .select()
        .from(dataStoreTables)
        .where(
            and(
                eq(dataStoreTables.ownerId, userId),
                eq(dataStoreTables.queryId, queryId),
                eq(dataStoreTables.kind, 'query')
            )
        )
        .limit(1);

    let tableRecord: DataStoreTable;
    if (existing) {
        const [updated] = await db
            .update(dataStoreTables)
            .set({
                storeTable,
                sourceTable: q.name,
                dataSourceId: q.dataSourceId,
                updatedAt: new Date(),
            })
            .where(eq(dataStoreTables.id, existing.id))
            .returning();
        tableRecord = updated;
    } else {
        const [created] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: userId,
                queryId,
                dataSourceId: q.dataSourceId,
                kind: 'query',
                sourceTable: q.name,
                storeSchema,
                storeTable,
                schedule: 'manual',
                syncMode: 'full',
                status: 'pending',
            })
            .returning();
        tableRecord = created;
    }

    // Run synchronization in background / await
    await syncTable(tableRecord.id, { triggeredBy: 'query_materialize', forceFull: true });

    return getStoreTable(userId, tableRecord.id);
}

/**
 * Drops the materialized table for a query.
 */
export async function dropMaterializedQuery(
    userId: string,
    queryId: string
): Promise<void> {
    const [existing] = await db
        .select()
        .from(dataStoreTables)
        .where(
            and(
                eq(dataStoreTables.ownerId, userId),
                eq(dataStoreTables.queryId, queryId),
                eq(dataStoreTables.kind, 'query')
            )
        )
        .limit(1);

    if (existing) {
        await deleteStoreTable(userId, existing.id);
    }
}

/**
 * Get materialized query info if enabled.
 */
export async function getMaterializedQueryInfo(
    queryId: string
): Promise<DataStoreTable | null> {
    const [existing] = await db
        .select()
        .from(dataStoreTables)
        .where(
            and(
                eq(dataStoreTables.queryId, queryId),
                eq(dataStoreTables.kind, 'query')
            )
        )
        .limit(1);

    return existing ?? null;
}
