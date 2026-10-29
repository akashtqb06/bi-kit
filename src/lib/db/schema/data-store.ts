import { sql } from 'drizzle-orm';
import {
    bigint,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { newId } from '../id';
import { users, dataSources, queries } from '../schema';

export type DataStoreKind = 'table' | 'query';
export type DataStoreStatus = 'pending' | 'syncing' | 'synced' | 'error';
export type DataStoreSchedule = 'manual' | 'hourly' | 'daily' | 'weekly';
export type DataStoreSyncMode = 'full' | 'incremental';
export type DataStoreSyncStatus = 'running' | 'success' | 'error' | 'cancelled';

export interface DataStoreColumnMeta {
    name: string;
    type: string; // normalized type: 'string' | 'number' | 'boolean' | 'date' | 'json'
    nativeType: string;
    nullable?: boolean;
    isPk?: boolean;
    isIndexed?: boolean;
    included?: boolean;
}

export const dataStoreTables = pgTable(
    'data_store_tables',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        ownerId: text('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        dataSourceId: text('data_source_id')
            .references(() => dataSources.id, { onDelete: 'set null' }),
        queryId: text('query_id')
            .references(() => queries.id, { onDelete: 'set null' }),
        kind: text('kind', { enum: ['table', 'query'] })
            .notNull()
            .default('table'),
        sourceTable: text('source_table').notNull(),
        storeSchema: text('store_schema').notNull(),
        storeTable: text('store_table').notNull(),
        columns: jsonb('columns')
            .notNull()
            .$type<DataStoreColumnMeta[]>()
            .default(sql`'[]'::jsonb`),
        rowCount: integer('row_count').notNull().default(0),
        sizeBytes: bigint('size_bytes', { mode: 'number' }).notNull().default(0),
        status: text('status', { enum: ['pending', 'syncing', 'synced', 'error'] })
            .notNull()
            .default('pending'),
        lastSyncedAt: timestamp('last_synced_at', { withTimezone: true, mode: 'date' }),
        lastError: text('last_error'),
        schedule: text('schedule', { enum: ['manual', 'hourly', 'daily', 'weekly'] })
            .notNull()
            .default('manual'),
        syncMode: text('sync_mode', { enum: ['full', 'incremental'] })
            .notNull()
            .default('full'),
        cursorColumn: text('cursor_column'),
        lastWatermark: text('last_watermark'),
        indexedColumns: jsonb('indexed_columns')
            .notNull()
            .$type<string[]>()
            .default(sql`'[]'::jsonb`),
        includedColumns: jsonb('included_columns')
            .$type<string[] | null>(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('data_store_tables_owner_id_idx').on(table.ownerId),
        index('data_store_tables_data_source_id_idx').on(table.dataSourceId),
        index('data_store_tables_query_id_idx').on(table.queryId),
        uniqueIndex('data_store_tables_schema_table_idx').on(table.storeSchema, table.storeTable),
    ]
);

export const dataStoreSyncs = pgTable(
    'data_store_syncs',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        tableId: text('table_id')
            .notNull()
            .references(() => dataStoreTables.id, { onDelete: 'cascade' }),
        status: text('status', { enum: ['running', 'success', 'error', 'cancelled'] })
            .notNull(),
        rowsSynced: integer('rows_synced').notNull().default(0),
        startedAt: timestamp('started_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        finishedAt: timestamp('finished_at', { withTimezone: true, mode: 'date' }),
        error: text('error'),
        triggeredBy: text('triggered_by').notNull().default('manual'),
    },
    (table) => [
        index('data_store_syncs_table_id_idx').on(table.tableId),
        index('data_store_syncs_started_at_idx').on(table.startedAt),
    ]
);

export type DataStoreTable = typeof dataStoreTables.$inferSelect;
export type InsertDataStoreTable = typeof dataStoreTables.$inferInsert;
export type DataStoreSync = typeof dataStoreSyncs.$inferSelect;
export type InsertDataStoreSync = typeof dataStoreSyncs.$inferInsert;

