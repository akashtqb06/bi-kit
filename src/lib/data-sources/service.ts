import { rmSync } from 'node:fs';
import path from 'node:path';
import { count, eq, inArray } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { dataSources, queries, users, type DataSource } from '@src/lib/db/schema';
import { serializeDataSourceConfig } from '@src/lib/db/json-helpers';
import { newId } from '@src/lib/db/id';
import { csvSourceConfigSchema, type CreateDataSourceInput, type DataSourceType } from '@src/lib/schemas';
import { ConflictError, NotFoundError } from '@src/lib/connectors/types';
import { createConnector } from '@src/lib/connectors/factory';
import { importCsvToDatabase } from './csv-import';
import { CSV_DIR } from '@src/lib/db/paths';
import type { PolicyUser } from '@src/lib/auth/policy';

// ---------------------------------------------------------------------------
// Public shape — never includes config (contains file paths)
// ---------------------------------------------------------------------------

export interface DataSourcePublic {
    id: string;
    ownerId?: string;
    owner?: { id: string; name: string | null; email: string; avatarUrl?: string | null };
    name: string;
    type: DataSourceType;
    slug?: string | null;
    queryCount?: number;
    tableCount?: number | null;
    createdAt: Date | null;
    updatedAt: Date | null;
}

function getDefaultOwnerId(): string | null {
    const admin = db.select({ id: users.id }).from(users).where(eq(users.role, 'admin')).limit(1).get();
    if (admin) return admin.id;
    const anyUser = db.select({ id: users.id }).from(users).limit(1).get();
    if (anyUser) return anyUser.id;
    return null;
}

function toPublic(row: DataSource, queryCount = 0, tableCount: number | null = null): DataSourcePublic {
    return {
        id: row.id,
        ownerId: row.ownerId,
        name: row.name,
        type: row.type as DataSourceType,
        slug: row.slug,
        queryCount,
        tableCount,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
    };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export function listDataSources(user?: PolicyUser): DataSourcePublic[] {
    let queryBuilder = db
        .select({
            id: dataSources.id,
            ownerId: dataSources.ownerId,
            name: dataSources.name,
            slug: dataSources.slug,
            type: dataSources.type,
            config: dataSources.config,
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

    const rows = queryBuilder
        .groupBy(dataSources.id, users.id)
        .all();

    return rows.map((row) => {
        let tableCount: number | null = null;
        try {
            const connector = createConnector({
                id: row.id,
                ownerId: row.ownerId,
                name: row.name,
                slug: row.slug,
                type: row.type,
                config: row.config,
                createdAt: row.createdAt,
                updatedAt: row.updatedAt,
            });
            try {
                tableCount = connector.getTables().length;
            } finally {
                connector.close();
            }
        } catch {
            tableCount = null;
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
            queryCount: Number(row.queryCount ?? 0),
            tableCount,
            createdAt: row.createdAt,
            updatedAt: row.updatedAt,
        };
    });
}

export function getDataSource(id: string): DataSource {
    const row = db.select().from(dataSources).where(eq(dataSources.id, id)).get();
    if (!row) {
        throw new NotFoundError(`Data source "${id}" not found.`);
    }
    return row;
}

export function getDataSourcePublic(id: string): DataSourcePublic {
    const row = getDataSource(id);
    const queryCountResult = db
        .select({ count: count() })
        .from(queries)
        .where(eq(queries.dataSourceId, id))
        .get();

    let tableCount: number | null = null;
    try {
        const connector = createConnector(row);
        try {
            tableCount = connector.getTables().length;
        } finally {
            connector.close();
        }
    } catch {
        tableCount = null;
    }
    return toPublic(row, queryCountResult?.count ?? 0, tableCount);
}

export function createDataSource(
    input: CreateDataSourceInput & { ownerId?: string | null; slug?: string },
    ownerId?: string | null
): DataSourcePublic {
    const configJson = serializeDataSourceConfig(input.config);
    const finalOwnerId = ownerId ?? input.ownerId ?? getDefaultOwnerId();
    const insertedId = newId();

    db.insert(dataSources)
        .values({
            id: insertedId,
            ownerId: finalOwnerId!,
            name: input.name,
            slug: input.slug,
            type: input.type,
            config: configJson,
        })
        .run();

    const row = getDataSource(insertedId);
    return toPublic(row);
}

export function createCsvDataSource(
    input: { name: string; csvText: string; originalFileName: string; ownerId?: string; slug?: string },
    ownerId?: string
): {
    source: DataSourcePublic;
    rowCount: number;
} {
    const id = newId();
    const finalOwnerId = ownerId ?? input.ownerId ?? getDefaultOwnerId();
    const config = importCsvToDatabase(input.csvText, id, input.originalFileName);
    try {
        db.insert(dataSources)
            .values({
                id,
                ownerId: finalOwnerId!,
                name: input.name,
                slug: input.slug,
                type: 'csv',
                config: serializeDataSourceConfig(config),
            })
            .run();
    } catch (error) {
        removeCsvDatabase(config.dbPath);
        throw error;
    }
    return { source: getDataSourcePublic(id), rowCount: config.rowCount };
}

export function replaceCsvDataSource(
    id: string,
    input: { name: string; csvText: string; originalFileName: string }
): { source: DataSourcePublic; rowCount: number } {
    const existing = getDataSource(id);
    if (existing.type !== 'csv') {
        throw new Error('Only CSV data sources can have their file replaced.');
    }

    const currentConfig = csvSourceConfigSchema.parse(JSON.parse(existing.config) as unknown);
    const config = importCsvToDatabase(input.csvText, id, input.originalFileName, currentConfig.dbPath);
    db.update(dataSources)
        .set({ name: input.name, config: serializeDataSourceConfig(config), updatedAt: new Date() })
        .where(eq(dataSources.id, id))
        .run();

    return { source: getDataSourcePublic(id), rowCount: config.rowCount };
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
    config?: { path: string };
}

export function updateDataSource(id: string, input: UpdateDataSourceInput): DataSourcePublic {
    const existing = getDataSource(id); // throws NotFoundError if missing

    const updates: Partial<DataSource> = {};
    if (input.name !== undefined) updates.name = input.name;
    if (input.config !== undefined) {
        updates.config = serializeDataSourceConfig({
            ...(JSON.parse(existing.config) as { path: string }),
            ...input.config,
        });
    }
    updates.updatedAt = new Date();

    db.update(dataSources).set(updates).where(eq(dataSources.id, id)).run();
    return getDataSourcePublic(id);
}

export function getDependentQueries(id: string): { id: string; name: string }[] {
    return db
        .select({ id: queries.id, name: queries.name })
        .from(queries)
        .where(eq(queries.dataSourceId, id))
        .all();
}

export function deleteDataSource(id: string): void {
    const source = getDataSource(id);

    const dependentQueries = db.select({ name: queries.name }).from(queries).where(eq(queries.dataSourceId, id)).all();
    if (dependentQueries.length > 0) {
        const queryNames = dependentQueries.map(({ name }) => `"${name}"`).join(', ');
        const count = dependentQueries.length;
        throw new ConflictError(
            `Cannot delete data source: ${count} dependent ${count === 1 ? 'query uses' : 'queries use'} it (${queryNames}). Delete or reassign ${count === 1 ? 'this query' : 'these queries'} first.`
        );
    }

    if (source.type === 'csv') {
        const config = csvSourceConfigSchema.parse(JSON.parse(source.config) as unknown);
        removeCsvDatabase(config.dbPath);
    }

    db.delete(dataSources).where(eq(dataSources.id, id)).run();
}

export interface BulkDeleteDataSourcesResult {
    deleted: string[];
    blocked: { id: string; name: string; queryCount: number }[];
}

export function bulkDeleteDataSources(ids: string[], user?: PolicyUser): BulkDeleteDataSourcesResult {
    if (ids.length === 0) {
        return { deleted: [], blocked: [] };
    }

    return db.transaction(() => {
        let sources = db.select().from(dataSources).where(inArray(dataSources.id, ids)).all();
        if (user && user.role !== 'admin') {
            sources = sources.filter((s) => s.ownerId === user.id);
        }
        const sourceMap = new Map(sources.map((s) => [s.id, s]));

        const dependentQueries = db
            .select({
                id: queries.id,
                dataSourceId: queries.dataSourceId,
            })
            .from(queries)
            .where(inArray(queries.dataSourceId, ids))
            .all();

        const queryCountBySourceId = new Map<string, number>();
        for (const q of dependentQueries) {
            queryCountBySourceId.set(q.dataSourceId, (queryCountBySourceId.get(q.dataSourceId) ?? 0) + 1);
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
                        const config = csvSourceConfigSchema.parse(JSON.parse(source.config) as unknown);
                        removeCsvDatabase(config.dbPath);
                    } catch {
                        // ignore file deletion errors
                    }
                }
                db.delete(dataSources).where(eq(dataSources.id, id)).run();
                deleted.push(id);
            }
        }

        return { deleted, blocked };
    });
}
