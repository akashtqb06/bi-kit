import { sql } from 'drizzle-orm';
import { index, integer, primaryKey, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';
import { newId } from './id';

export const users = sqliteTable('users', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newId()),
    email: text('email').notNull().unique(),
    name: text('name').notNull(),
    passwordHash: text('password_hash').notNull(),
    role: text('role').notNull().default('member'),
    status: text('status').notNull().default('active'),
    avatarUrl: text('avatar_url'),
    createdAt: integer('created_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    updatedAt: integer('updated_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
    lastLoginAt: integer('last_login_at', { mode: 'timestamp' }),
});

export const sessions = sqliteTable(
    'sessions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull().unique(),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        expiresAt: integer('expires_at', { mode: 'timestamp' }).notNull(),
        lastUsedAt: integer('last_used_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
    },
    (table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const loginAttempts = sqliteTable(
    'login_attempts',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        key: text('key').notNull(),
        attemptedAt: integer('attempted_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        success: integer('success', { mode: 'boolean' }).notNull().default(false),
    },
    (table) => [index('login_attempts_key_attempted_at_idx').on(table.key, table.attemptedAt)]
);

export const appSettings = sqliteTable('app_settings', {
    key: text('key').primaryKey(),
    value: text('value', { mode: 'json' }).notNull().$type<unknown>(),
});

export const auditLog = sqliteTable('audit_log', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newId()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    dataSourceId: text('data_source_id'),
    host: text('host'),
    at: integer('at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
});

export const dataSources = sqliteTable(
    'data_sources',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        ownerId: text('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        slug: text('slug').unique(),
        type: text('type').notNull(),
        config: text('config').notNull(), // JSON — encrypted secrets where applicable
        status: text('status', { enum: ['unknown', 'ok', 'error'] })
            .notNull()
            .default('unknown'),
        lastTestedAt: integer('last_tested_at', { mode: 'timestamp' }),
        lastError: text('last_error'),
        serverVersion: text('server_version'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [index('data_sources_owner_id_idx').on(table.ownerId)]
);

export const schemaCache = sqliteTable('schema_cache', {
    dataSourceId: text('data_source_id')
        .primaryKey()
        .references(() => dataSources.id, { onDelete: 'cascade' }),
    snapshot: text('snapshot').notNull(), // JSON SchemaSnapshot
    fetchedAt: integer('fetched_at', { mode: 'timestamp' })
        .notNull()
        .default(sql`(unixepoch())`),
});

export const workbooks = sqliteTable(
    'workbooks',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        ownerId: text('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        slug: text('slug').unique(),
        description: text('description').notNull().default(''),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [index('workbooks_owner_id_idx').on(table.ownerId)]
);

export const folders = sqliteTable(
    'folders',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        workbookId: text('workbook_id')
            .notNull()
            .references(() => workbooks.id, { onDelete: 'cascade' }),
        kind: text('kind', { enum: ['query', 'chart', 'dashboard'] }).notNull(),
        name: text('name').notNull(),
        parentId: text('parent_id'),
        position: integer('position').notNull().default(0),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index('folders_workbook_id_kind_idx').on(table.workbookId, table.kind),
        uniqueIndex('folders_workbook_id_kind_name_idx').on(table.workbookId, table.kind, table.name),
    ]
);

export const queries = sqliteTable(
    'queries',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        workbookId: text('workbook_id')
            .notNull()
            .references(() => workbooks.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        dataSourceId: text('data_source_id')
            .notNull()
            .references(() => dataSources.id, { onDelete: 'cascade' }),
        mode: text('mode', { enum: ['builder', 'sql', 'pipeline'] })
            .notNull()
            .default('sql'),
        definition: text('definition').notNull().default('[]'), // JSON builder steps
        sql: text('sql').notNull().default(''),
        folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        createdBy: text('created_by'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index('queries_workbook_id_idx').on(table.workbookId),
        index('queries_data_source_id_idx').on(table.dataSourceId),
        index('queries_folder_id_idx').on(table.folderId),
    ]
);

export const charts = sqliteTable(
    'charts',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        workbookId: text('workbook_id')
            .notNull()
            .references(() => workbooks.id, { onDelete: 'cascade' }),
        queryId: text('query_id')
            .notNull()
            .references(() => queries.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        type: text('type', {
            enum: ['bar', 'line', 'row', 'donut', 'pie', 'area', 'number', 'table'],
        }).notNull(),
        config: text('config').notNull().default('{}'), // JSON — validated via json-helpers
        folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        createdBy: text('created_by'),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index('charts_workbook_id_idx').on(table.workbookId),
        index('charts_query_id_idx').on(table.queryId),
        index('charts_folder_id_idx').on(table.folderId),
    ]
);

export const dashboards = sqliteTable(
    'dashboards',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        workbookId: text('workbook_id')
            .notNull()
            .references(() => workbooks.id, { onDelete: 'cascade' }),
        ownerId: text('owner_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        slug: text('slug').unique(),
        layout: text('layout').notNull().default('[]'), // JSON react-grid-layout items
        filters: text('filters').notNull().default('[]'), // JSON dashboard filters
        autoRefresh: text('auto_refresh').notNull().default('off'),
        folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        createdBy: text('created_by')
            .references(() => users.id, { onDelete: 'set null' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
        updatedAt: integer('updated_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        index('dashboards_owner_id_idx').on(table.ownerId),
        index('dashboards_workbook_id_idx').on(table.workbookId),
        index('dashboards_folder_id_idx').on(table.folderId),
    ]
);

export const dashboardFavorites = sqliteTable(
    'dashboard_favorites',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        dashboardId: text('dashboard_id')
            .notNull()
            .references(() => dashboards.id, { onDelete: 'cascade' }),
        createdAt: integer('created_at', { mode: 'timestamp' })
            .notNull()
            .default(sql`(unixepoch())`),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.dashboardId] }),
        index('dashboard_favorites_user_id_idx').on(table.userId),
        index('dashboard_favorites_dashboard_id_idx').on(table.dashboardId),
    ]
);

export const dashboardViews = sqliteTable(
    'dashboard_views',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        dashboardId: text('dashboard_id')
            .notNull()
            .references(() => dashboards.id, { onDelete: 'cascade' }),
        viewCount: integer('view_count').notNull().default(0),
        lastViewedAt: integer('last_viewed_at', { mode: 'timestamp' }),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.dashboardId] }),
        index('dashboard_views_user_id_idx').on(table.userId),
        index('dashboard_views_dashboard_id_idx').on(table.dashboardId),
    ]
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------
export type DataSource = typeof dataSources.$inferSelect;
export type InsertDataSource = typeof dataSources.$inferInsert;
export type SchemaCache = typeof schemaCache.$inferSelect;
export type InsertSchemaCache = typeof schemaCache.$inferInsert;
export type Workbook = typeof workbooks.$inferSelect;
export type InsertWorkbook = typeof workbooks.$inferInsert;
export type Folder = typeof folders.$inferSelect;
export type InsertFolder = typeof folders.$inferInsert;
export type Query = typeof queries.$inferSelect;
export type InsertQuery = typeof queries.$inferInsert;
export type Chart = typeof charts.$inferSelect;
export type InsertChart = typeof charts.$inferInsert;
export type Dashboard = typeof dashboards.$inferSelect;
export type InsertDashboard = typeof dashboards.$inferInsert;
export type DashboardFavorite = typeof dashboardFavorites.$inferSelect;
export type InsertDashboardFavorite = typeof dashboardFavorites.$inferInsert;
export type DashboardView = typeof dashboardViews.$inferSelect;
export type InsertDashboardView = typeof dashboardViews.$inferInsert;
export type User = typeof users.$inferSelect;
export type InsertUser = typeof users.$inferInsert;
export type Session = typeof sessions.$inferSelect;
export type InsertSession = typeof sessions.$inferInsert;
export type LoginAttempt = typeof loginAttempts.$inferSelect;
export type AppSetting = typeof appSettings.$inferSelect;
export type AuditLogEntry = typeof auditLog.$inferSelect;
export type InsertAuditLogEntry = typeof auditLog.$inferInsert;
