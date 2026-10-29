import 'server-only';
import { rmSync, existsSync } from 'node:fs';
import path from 'node:path';
import { count, eq, inArray } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { dataSources, queries, users, schemaCache, type DataSource, dataStoreTables } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import { csvSourceConfigSchema, type CreateDataSourceInput, type DataSourceType } from '@src/lib/schemas';
import { ConflictError, NotFoundError, type SchemaSnapshot } from '@src/lib/connectors/types';
import { createConnector } from '@src/lib/connectors/factory';
import { invalidateConnector } from '@src/lib/connectors/manager';
import { getManagedDirForSource } from '@src/lib/connectors/storage';
import { getConnectorDefinition } from '@src/lib/connectors/registry';
import { toPublicConfig, mergeStoredSecrets, encryptSecretFields } from '@src/lib/connectors/secrets';
import { importCsvToDatabase } from './csv-import';
import { CSV_DIR } from '@src/lib/db/paths';
import type { PolicyUser } from '@src/lib/auth/policy';
import { executeDbQuery } from '@src/lib/data-store/sync-engine';
import { quoteIdent } from '@src/lib/data-store/types-mapping';

// ---------------------------------------------------------------------------
// Public shape — never includes raw secrets
// ---------------------------------------------------------------------------

export interface DataSourcePublic {
    id: string;
    ownerId?: string;
    owner?: { id: string; name: string | null; email: string; avatarUrl?: string | null };
    name: string;
    type: string;
    slug?: string | null;
    status?: 'unknown' | 'ok' | 'error';
    lastTestedAt?: Date | null;
    lastError?: string | null;
    serverVersion?: string | null;
    queryCount?: number;
    tableCount?: number | null;
    config?: Record<string, unknown>;
    createdAt: Date | null;
    updatedAt: Date | null;
}

function parseConfigField(config: unknown): Record<string, unknown> {
    if (typeof config === 'object' && config !== null) {
        return config as Record<string, unknown>;
    }
    if (typeof config === 'string') {
        try {
            return JSON.parse(config) as Record<string, unknown>;
        } catch {
            return {};
        }
    }
    return {};
}

function parseSnapshotField(snapshot: unknown): SchemaSnapshot {
    if (typeof snapshot === 'object' && snapshot !== null) {
        return snapshot as SchemaSnapshot;
    }
    if (typeof snapshot === 'string') {
        try {
            return JSON.parse(snapshot) as SchemaSnapshot;
        } catch {
            return { tables: [], schemas: [] };
        }
    }
    return { tables: [], schemas: [] };
}

async function getDefaultOwnerId(): Promise<string | null> {
    const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1);
    if (admin) return admin.id;
    const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
    if (anyUser) return anyUser.id;
    return null;
}

function toPublic(row: DataSource, queryCount = 0, tableCount: number | null = null): DataSourcePublic {
    let publicConfig: Record<string, unknown> = {};
    try {
        const rawConfig = parseConfigField(row.config);
        const def = getConnectorDefinition(row.type);
        publicConfig = toPublicConfig(def, rawConfig);
    } catch {
        // ignore
    }

    const hasConfig = Object.keys(publicConfig).length > 0;

    return {
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        type: row.type,
        slug: row.slug,
        status: (row.status as 'unknown' | 'ok' | 'error') || 'unknown',
        lastTestedAt: row.lastTestedAt,
        lastError: row.lastError,
        serverVersion: row.serverVersion,
        queryCount,
        tableCount,
        ...(hasConfig ? { config: publicConfig } : {}),
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listDataSources(user?: PolicyUser): Promise<DataSourcePublic[]> {
    let queryBuilder = db
        .select({
            id: dataSources.id,
            ownerId: dataSources.ownerId,
            name: dataSources.name,
            slug: dataSources.slug,
            type: dataSources.type,
            config: dataSources.config,
            status: dataSources.status,
            lastTestedAt: dataSources.lastTestedAt,
            lastError: dataSources.lastError,
            serverVersion: dataSources.serverVersion,
            createdAt: dataSources.createdAt,
            updatedAt: dataSources.updatedAt,
            ownerName: users.name,
            ownerEmail: users.email,
            ownerAvatarUrl: users.avatarUrl,
            queryCount: count(queries.id),
        })
        .from(dataSources)
        .leftJoin(users, eq(dataSources.ownerId, users.id))
        .leftJoin(queries, eq(queries.dataSourceId, dataSources.id));

    if (user && user.role !== 'admin') {
        queryBuilder = queryBuilder.where(eq(dataSources.ownerId, user.id)) as typeof queryBuilder;
    }

    const rows = await queryBuilder.groupBy(dataSources.id, users.id);

    // Check schema cache for table counts
    const allCaches = await db.select().from(schemaCache);
    const cacheMap = new Map<string, number>();
    for (const c of allCaches) {
        try {
            const snap = parseSnapshotField(c.snapshot);
            cacheMap.set(c.dataSourceId, snap.tables?.length ?? 0);
        } catch {
            // ignore
        }
    }

    return rows.map((row) => {
        let tableCount: number | null = cacheMap.get(row.id) ?? null;

        if (tableCount === null && (row.type === 'sqlite' || row.type === 'csv')) {
            try {
                const connector = createConnector(row as unknown as DataSource);
                try {
                    tableCount = connector.getTables ? (connector.getTables() as unknown as string[]).length : null;
                } finally {
                    connector.close?.();
                }
            } catch {
                tableCount = null;
            }
        }

        let publicConfig: Record<string, unknown> = {};
        try {
            const rawConfig = parseConfigField(row.config);
            const def = getConnectorDefinition(row.type);
            publicConfig = toPublicConfig(def, rawConfig);
        } catch {
            // ignore
        }

        return {
            id: row.id,
            ownerId: row.ownerId,
            owner: row.ownerId
                ? {
                      id: row.ownerId,
                      name: row.ownerName,
                      email: row.ownerEmail ?? '',
                      avatarUrl: row.ownerAvatarUrl,
                  }
                : undefined,
            name: row.name,
            type: row.type as DataSourceType,
            status: (row.status as 'unknown' | 'ok' | 'error') || 'unknown',
            lastTestedAt: row.lastTestedAt,
            lastError: row.lastError,
            serverVersion: row.serverVersion,
            queryCount: Number(row.queryCount ?? 0),
            tableCount,
            ...(Object.keys(publicConfig).length > 0 ? { config: publicConfig } : {}),
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    });
}

export async function getDataSource(id: string): Promise<DataSource> {
    const [row] = await db.select().from(dataSources).where(eq(dataSources.id, id)).limit(1);
    if (!row) {
        throw new NotFoundError(`Data source "${id}" not found.`);
    }
    return row;
}

export async function getDataSourcePublic(id: string): Promise<DataSourcePublic> {
    const row = await getDataSource(id);
    const [queryCountResult] = await db
        .select({ count: count() })
        .from(queries)
        .where(eq(queries.dataSourceId, id));

    const cached = await getCachedSchema(id);
    let tableCount: number | null = cached?.tables?.length ?? null;

    if (tableCount === null && (row.type === 'sqlite' || row.type === 'csv')) {
        try {
            const connector = createConnector(row as unknown as DataSource);
            try {
                tableCount = connector.getTables ? (connector.getTables() as unknown as string[]).length : null;
            } finally {
                connector.close?.();
            }
        } catch {
            tableCount = null;
        }
    }
    return toPublic(row, queryCountResult?.count ?? 0, tableCount);
}

export async function createDataSource(
    input: CreateDataSourceInput & { ownerId?: string | null; slug?: string; status?: 'unknown' | 'ok' | 'error' },
    ownerId?: string | null
): Promise<DataSourcePublic> {
    const configObj = parseConfigField(input.config);
    const finalOwnerId = ownerId ?? input.ownerId ?? (await getDefaultOwnerId());
    const insertedId = newId();

    await db.insert(dataSources)
        .values({
            id: insertedId,
            ownerId: finalOwnerId!,
            name: input.name,
            slug: input.slug,
            type: input.type,
            config: configObj,
            status: input.status || 'unknown',
        });

    const row = await getDataSource(insertedId);
    return toPublic(row);
}

export async function createCsvDataSource(
    input: { name: string; csvText: string; originalFileName: string; ownerId?: string; slug?: string },
    ownerId?: string
): Promise<{
    source: DataSourcePublic;
    rowCount: number;
}> {
    const id = newId();
    const finalOwnerId = ownerId ?? input.ownerId ?? (await getDefaultOwnerId());
    const config = importCsvToDatabase(input.csvText, id, input.originalFileName);
    try {
        await db.insert(dataSources)
            .values({
                id,
                ownerId: finalOwnerId!,
                name: input.name,
                slug: input.slug,
                type: 'csv',
                config: config as Record<string, unknown>,
            });
    } catch (error) {
        removeCsvDatabase(config.dbPath || config.managedPath || '');
        throw error;
    }
    return { source: await getDataSourcePublic(id), rowCount: config.rowCount ?? 0 };
}

export async function replaceCsvDataSource(
    id: string,
    input: { name: string; csvText: string; originalFileName: string }
): Promise<{ source: DataSourcePublic; rowCount: number }> {
    const existing = await getDataSource(id);
    if (existing.type !== 'csv') {
        throw new Error('Only CSV data sources can have their file replaced.');
    }

    const currentConfig = csvSourceConfigSchema.parse(parseConfigField(existing.config));
    const config = importCsvToDatabase(input.csvText, id, input.originalFileName, currentConfig.dbPath);
    await db.update(dataSources)
        .set({ name: input.name, config: config as Record<string, unknown>, updatedAt: new Date() })
        .where(eq(dataSources.id, id));

    void invalidateConnector(id);
    return { source: await getDataSourcePublic(id), rowCount: config.rowCount ?? 0 };
}

function removeCsvDatabase(dbPath: string): void {
    const absolutePath = path.resolve(process.cwd(), dbPath);
    const csvDirectory = path.resolve(CSV_DIR) + path.sep;
    if (absolutePath.startsWith(csvDirectory)) {
        for (const suffix of ['', '-wal', '-shm']) {
            rmSync(`${absolutePath}${suffix}`, { force: true });
        }
    }
}

export interface UpdateDataSourceInput {
    name?: string;
    config?: Record<string, unknown>;
}

export async function updateDataSource(id: string, input: UpdateDataSourceInput): Promise<DataSourcePublic> {
    const existing = await getDataSource(id); // throws NotFoundError if missing

    const updates: Partial<typeof dataSources.$inferInsert> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.config !== undefined) {
        const def = getConnectorDefinition(existing.type);
        const storedConfig = parseConfigField(existing.config);
        let mergedConfig = mergeStoredSecrets(def, input.config, storedConfig);
        if (def) {
            mergedConfig = encryptSecretFields(def, mergedConfig);
        }
        updates.config = mergedConfig;
        updates.status = 'unknown';
    }
    updates.updatedAt = new Date();

    await db.update(dataSources).set(updates).where(eq(dataSources.id, id));
    void invalidateConnector(id);
    return await getDataSourcePublic(id);
}

export async function updateDataSourceStatus(
    id: string,
    statusData: {
        status: 'unknown' | 'ok' | 'error';
        lastTestedAt?: Date;
        serverVersion?: string | null;
        lastError?: string | null;
    }
): Promise<void> {
    await db.update(dataSources)
        .set({
            status: statusData.status,
            lastTestedAt: statusData.lastTestedAt ?? new Date(),
            serverVersion: statusData.serverVersion,
            lastError: statusData.lastError,
            updatedAt: new Date(),
        })
        .where(eq(dataSources.id, id));
}

export async function getCachedSchema(dataSourceId: string): Promise<SchemaSnapshot | null> {
    const [row] = await db.select().from(schemaCache).where(eq(schemaCache.dataSourceId, dataSourceId)).limit(1);
    if (!row) return null;
    try {
        return parseSnapshotField(row.snapshot);
    } catch {
        return null;
    }
}

export async function getCachedSchemaWithMeta(dataSourceId: string): Promise<{ snapshot: SchemaSnapshot; fetchedAt: Date } | null> {
    const [row] = await db.select().from(schemaCache).where(eq(schemaCache.dataSourceId, dataSourceId)).limit(1);
    if (!row) return null;
    try {
        const snapshot = parseSnapshotField(row.snapshot);
        return { snapshot, fetchedAt: row.fetchedAt };
    } catch {
        return null;
    }
}

export async function setCachedSchema(dataSourceId: string, snapshot: SchemaSnapshot): Promise<void> {
    await db.insert(schemaCache)
        .values({
            dataSourceId,
            snapshot,
            fetchedAt: new Date(),
        })
        .onConflictDoUpdate({
            target: schemaCache.dataSourceId,
            set: {
                snapshot,
                fetchedAt: new Date(),
            },
        });
}

export async function getDependentQueries(id: string): Promise<{ id: string; name: string }[]> {
    return await db
        .select({ id: queries.id, name: queries.name })
        .from(queries)
        .where(eq(queries.dataSourceId, id));
}

export async function deleteDataSource(id: string): Promise<void> {
    const source = await getDataSource(id);

    const dependentQueries = await getDependentQueries(id);
    if (dependentQueries.length > 0) {
        const queryNames = dependentQueries.map(({ name }) => `"${name}"`).join(', ');
        const count = dependentQueries.length;
        throw new ConflictError(
            `Cannot delete data source: ${count} dependent ${count === 1 ? 'query uses' : 'queries use'} it (${queryNames}). Delete or reassign ${count === 1 ? 'this query' : 'these queries'} first.`
        );
    }

    if (source.type === 'csv') {
        try {
            const config = parseConfigField(source.config) as Record<string, string>;
            if (config.dbPath) removeCsvDatabase(config.dbPath);
        } catch {
            // ignore
        }
    }

    // Clean up managed storage files if existing
    const managedDir = getManagedDirForSource(id);
    if (existsSync(managedDir)) {
        try {
            rmSync(managedDir, { recursive: true, force: true });
        } catch {
            // ignore
        }
    }

    // Clean up associated data store tables
    try {
        const storeTbls = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.dataSourceId, id));
        for (const st of storeTbls) {
            try {
                await executeDbQuery(
                    `DROP TABLE IF EXISTS ${quoteIdent(st.storeSchema)}.${quoteIdent(st.storeTable)} CASCADE`
                );
            } catch {}
        }
        await db.delete(dataStoreTables).where(eq(dataStoreTables.dataSourceId, id));
    } catch {
        // ignore
    }

    await db.delete(dataSources).where(eq(dataSources.id, id));
    void invalidateConnector(id);
}

export interface BulkDeleteDataSourcesResult {
    deleted: string[];
    blocked: { id: string; name: string; queryCount: number }[];
}

export async function bulkDeleteDataSources(ids: string[], user?: PolicyUser): Promise<BulkDeleteDataSourcesResult> {
    if (ids.length === 0) {
        return { deleted: [], blocked: [] };
    }

    return await db.transaction(async (tx) => {
        let sources = await tx.select().from(dataSources).where(inArray(dataSources.id, ids));
        if (user && user.role !== 'admin') {
            sources = sources.filter((s) => s.ownerId === user.id);
        }
        const sourceMap = new Map(sources.map((s) => [s.id, s]));

        const dependentQueries = await tx
            .select({
                id: queries.id,
                dataSourceId: queries.dataSourceId,
            })
            .from(queries)
            .where(inArray(queries.dataSourceId, ids));

        const queryCountBySourceId = new Map<string, number>();
        for (const q of dependentQueries) {
            if (q.dataSourceId) {
                queryCountBySourceId.set(q.dataSourceId, (queryCountBySourceId.get(q.dataSourceId) ?? 0) + 1);
            }
        }

        const deleted: string[] = [];
        const blocked: { id: string; name: string; queryCount: number }[] = [];

        for (const id of ids) {
            const source = sourceMap.get(id);
            if (!source) continue;

            const count = queryCountBySourceId.get(id) ?? 0;
            if (count > 0) {
                blocked.push({
                    id,
                    name: source.name,
                    queryCount: count,
                });
            } else {
                if (source.type === 'csv') {
                    try {
                        const config = parseConfigField(source.config) as Record<string, string>;
                        if (config.dbPath) removeCsvDatabase(config.dbPath);
                    } catch {
                        // ignore file deletion errors
                    }
                }
                const managedDir = getManagedDirForSource(id);
                if (existsSync(managedDir)) {
                    try {
                        rmSync(managedDir, { recursive: true, force: true });
                    } catch {
                        // ignore
                    }
                }
                await tx.delete(dataSources).where(eq(dataSources.id, id));
                void invalidateConnector(id);
                deleted.push(id);
            }
        }

        return { deleted, blocked };
    });
}
