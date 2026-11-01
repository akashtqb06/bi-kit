import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    date,
    index,
    integer,
    jsonb,
    pgTable,
    text,
    timestamp,
    uniqueIndex,
} from 'drizzle-orm/pg-core';
import { newId } from '../id';
import { users } from '../schema';
import { finAccounts, finCategories, finTransactions } from './finance';

// ---------------------------------------------------------------------------
// api_tokens
// ---------------------------------------------------------------------------

export const apiTokens = pgTable(
    'api_tokens',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        tokenHash: text('token_hash').notNull().unique(),
        prefix: text('prefix').notNull(),
        scopes: text('scopes').array().notNull().default(sql`'{}'::text[]`),
        lastUsedAt: timestamp('last_used_at', { withTimezone: true, mode: 'date' }),
        expiresAt: timestamp('expires_at', { withTimezone: true, mode: 'date' }),
        revokedAt: timestamp('revoked_at', { withTimezone: true, mode: 'date' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('api_tokens_user_id_idx').on(table.userId),
        index('api_tokens_user_revoked_idx')
            .on(table.userId, table.revokedAt)
            .where(sql`${table.revokedAt} IS NULL`),
    ]
);

// ---------------------------------------------------------------------------
// fin_inbox
// ---------------------------------------------------------------------------

export const finInbox = pgTable(
    'fin_inbox',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        idempotencyKey: text('idempotency_key').notNull(),
        source: text('source', {
            enum: ['email', 'sms', 'api', 'n8n'],
        }).notNull(),
        receivedAt: timestamp('received_at', { withTimezone: true, mode: 'date' }).notNull(),
        date: date('date', { mode: 'string' }).notNull(),
        amount: bigint('amount', { mode: 'number' }).notNull(),
        direction: text('direction', {
            enum: ['debit', 'credit'],
        }).notNull(),
        currency: text('currency').notNull().default('INR'),
        merchant: text('merchant'),
        description: text('description'),
        accountHint: jsonb('account_hint').$type<{ last4?: string; name?: string } | null>(),
        reference: text('reference'),
        raw: text('raw'),
        status: text('status', {
            enum: ['pending', 'approved', 'rejected', 'duplicate'],
        })
            .notNull()
            .default('pending'),
        matchedAccountId: text('matched_account_id').references(() => finAccounts.id, {
            onDelete: 'set null',
        }),
        suggestedCategoryId: text('suggested_category_id').references(() => finCategories.id, {
            onDelete: 'set null',
        }),
        duplicateWarning: jsonb('duplicate_warning').$type<
            Array<{ reason: string; existingId?: string }>
        >(),
        importHash: text('import_hash'),
        createdTransactionId: text('created_transaction_id').references(
            () => finTransactions.id,
            { onDelete: 'set null' }
        ),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('fin_inbox_user_status_idx').on(table.userId, table.status),
        uniqueIndex('fin_inbox_user_idempotency_key_idx').on(table.userId, table.idempotencyKey),
        uniqueIndex('fin_inbox_user_import_hash_idx')
            .on(table.userId, table.importHash)
            .where(sql`${table.importHash} IS NOT NULL`),
        index('fin_inbox_user_id_idx').on(table.userId),
    ]
);

// ---------------------------------------------------------------------------
// webhook_endpoints
// ---------------------------------------------------------------------------

export const webhookEndpoints = pgTable(
    'webhook_endpoints',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        url: text('url').notNull(),
        secretHash: text('secret_hash').notNull(),
        events: text('events').array().notNull().default(sql`'{}'::text[]`),
        enabled: boolean('enabled').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [index('webhook_endpoints_user_id_idx').on(table.userId)]
);

// ---------------------------------------------------------------------------
// webhook_deliveries
// ---------------------------------------------------------------------------

export const webhookDeliveries = pgTable(
    'webhook_deliveries',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        endpointId: text('endpoint_id')
            .notNull()
            .references(() => webhookEndpoints.id, { onDelete: 'cascade' }),
        event: text('event').notNull(),
        payload: jsonb('payload').notNull().$type<Record<string, unknown>>(),
        status: text('status', {
            enum: ['pending', 'success', 'failed'],
        })
            .notNull()
            .default('pending'),
        attemptCount: integer('attempt_count').notNull().default(0),
        nextAttemptAt: timestamp('next_attempt_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        lastAttemptAt: timestamp('last_attempt_at', { withTimezone: true, mode: 'date' }),
        responseStatus: integer('response_status'),
        responseBody: text('response_body'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('webhook_deliveries_endpoint_status_idx').on(table.endpointId, table.status),
        index('webhook_deliveries_status_next_attempt_idx').on(table.status, table.nextAttemptAt),
    ]
);

// ---------------------------------------------------------------------------
// payee_rules
// ---------------------------------------------------------------------------

export const payeeRules = pgTable(
    'payee_rules',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        payeePattern: text('payee_pattern').notNull(),
        categoryId: text('category_id')
            .notNull()
            .references(() => finCategories.id, { onDelete: 'cascade' }),
        priority: integer('priority').notNull().default(0),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('payee_rules_user_id_idx').on(table.userId),
        uniqueIndex('payee_rules_user_payee_pattern_idx').on(table.userId, table.payeePattern),
    ]
);

// ---------------------------------------------------------------------------
// Inferred types
// ---------------------------------------------------------------------------

export type ApiToken = typeof apiTokens.$inferSelect;
export type NewApiToken = typeof apiTokens.$inferInsert;
export type FinInbox = typeof finInbox.$inferSelect;
export type NewFinInbox = typeof finInbox.$inferInsert;
export type WebhookEndpoint = typeof webhookEndpoints.$inferSelect;
export type NewWebhookEndpoint = typeof webhookEndpoints.$inferInsert;
export type WebhookDelivery = typeof webhookDeliveries.$inferSelect;
export type NewWebhookDelivery = typeof webhookDeliveries.$inferInsert;
export type PayeeRule = typeof payeeRules.$inferSelect;
export type NewPayeeRule = typeof payeeRules.$inferInsert;
