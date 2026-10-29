import { sql } from 'drizzle-orm';
import { boolean, index, integer, jsonb, pgTable, primaryKey, text, timestamp, uniqueIndex } from 'drizzle-orm/pg-core';
import { newId } from './id';

export const users = pgTable(
    'users',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        email: text('email').notNull(),
        name: text('name').notNull(),
        passwordHash: text('password_hash').notNull(),
        role: text('role').notNull().default('member'),
        status: text('status').notNull().default('active'),
        avatarUrl: text('avatar_url'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        lastLoginAt: timestamp('last_login_at', { withTimezone: true, mode: 'date' }),
        mustChangePassword: boolean('must_change_password').notNull().default(false),
    },
    (table) => [
        uniqueIndex('users_email_lower_idx').on(sql`lower(${table.email})`),
    ]
);

export const sessions = pgTable(
    'sessions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        tokenHash: text('token_hash').notNull().unique(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }).notNull(),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        ipAddress: text('ip_address'),
        userAgent: text('user_agent'),
    },
    (table) => [index('sessions_user_id_idx').on(table.userId)]
);

export const loginAttempts = pgTable(
    'login_attempts',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        key: text('key').notNull(),
        attemptedAt: timestamp('attempted_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        success: boolean('success').notNull().default(false),
    },
    (table) => [index('login_attempts_key_attempted_at_idx').on(table.key, table.attemptedAt)]
);

export const appSettings = pgTable('app_settings', {
    key: text('key').primaryKey(),
    value: jsonb('value').notNull().$type<unknown>(),
});

export const auditLog = pgTable('audit_log', {
    id: text('id')
        .primaryKey()
        .$defaultFn(() => newId()),
    userId: text('user_id').references(() => users.id, { onDelete: 'set null' }),
    action: text('action').notNull(),
    dataSourceId: text('data_source_id'),
    host: text('host'),
    details: jsonb('details').$type<Record<string, unknown>>(),
    ipAddress: text('ip_address'),
    at: timestamp('at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
});

export const dataSources = pgTable(
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
        config: jsonb('config').notNull().$type<Record<string, unknown>>().default(sql`'{}'::jsonb`), // JSON — encrypted secrets where applicable
        status: text('status', { enum: ['unknown', 'ok', 'error'] })
            .notNull()
            .default('unknown'),
        lastTestedAt: timestamp('last_tested_at', { withTimezone: true, mode: 'date' }),
        lastError: text('last_error'),
        serverVersion: text('server_version'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [index('data_sources_owner_id_idx').on(table.ownerId)]
);

export const schemaCache = pgTable('schema_cache', {
    dataSourceId: text('data_source_id')
        .primaryKey()
        .references(() => dataSources.id, { onDelete: 'cascade' }),
    snapshot: jsonb('snapshot').notNull().$type<unknown>(), // JSON SchemaSnapshot
    fetchedAt: timestamp('fetched_at', { withTimezone: true, mode: 'date' })
        .notNull()
        .defaultNow(),
});

export const workbooks = pgTable(
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
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [index('workbooks_owner_id_idx').on(table.ownerId)]
);

export const folders = pgTable(
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
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('folders_workbook_id_kind_idx').on(table.workbookId, table.kind),
        uniqueIndex('folders_workbook_id_kind_name_idx').on(table.workbookId, table.kind, table.name),
    ]
);

export const queries = pgTable(
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
        definition: jsonb('definition').notNull().$type<unknown>().default(sql`'[]'::jsonb`), // JSON builder steps
        sql: text('sql').notNull().default(''),
        folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('queries_workbook_id_idx').on(table.workbookId),
        index('queries_data_source_id_idx').on(table.dataSourceId),
        index('queries_folder_id_idx').on(table.folderId),
    ]
);

export const charts = pgTable(
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
        config: jsonb('config').notNull().$type<unknown>().default(sql`'{}'::jsonb`), // JSON — validated via json-helpers
        folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        createdBy: text('created_by'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('charts_workbook_id_idx').on(table.workbookId),
        index('charts_query_id_idx').on(table.queryId),
        index('charts_folder_id_idx').on(table.folderId),
    ]
);

export const dashboards = pgTable(
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
        layout: jsonb('layout').notNull().$type<unknown>().default(sql`'[]'::jsonb`), // JSON react-grid-layout items
        filters: jsonb('filters').notNull().$type<unknown>().default(sql`'[]'::jsonb`), // JSON dashboard filters
        autoRefresh: text('auto_refresh').notNull().default('off'),
        folderId: text('folder_id').references(() => folders.id, { onDelete: 'set null' }),
        position: integer('position').notNull().default(0),
        createdBy: text('created_by')
            .references(() => users.id, { onDelete: 'set null' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('dashboards_owner_id_idx').on(table.ownerId),
        index('dashboards_workbook_id_idx').on(table.workbookId),
        index('dashboards_folder_id_idx').on(table.folderId),
    ]
);

export const dashboardFavorites = pgTable(
    'dashboard_favorites',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        dashboardId: text('dashboard_id')
            .notNull()
            .references(() => dashboards.id, { onDelete: 'cascade' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        primaryKey({ columns: [table.userId, table.dashboardId] }),
        index('dashboard_favorites_user_id_idx').on(table.userId),
        index('dashboard_favorites_dashboard_id_idx').on(table.dashboardId),
    ]
);

export const dashboardViews = pgTable(
    'dashboard_views',
    {
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        dashboardId: text('dashboard_id')
            .notNull()
            .references(() => dashboards.id, { onDelete: 'cascade' }),
        viewCount: integer('view_count').notNull().default(0),
        lastViewedAt: timestamp('last_viewed_at', { withTimezone: true, mode: 'date' }),
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

export * from './schema/data-store';

