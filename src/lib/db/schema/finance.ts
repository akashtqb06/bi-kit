import { sql } from 'drizzle-orm';
import {
    bigint,
    boolean,
    check,
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

export const finAccounts = pgTable(
    'fin_accounts',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        kind: text('kind', {
            enum: [
                'cash',
                'bank',
                'credit_card',
                'fixed_deposit',
                'recurring_deposit',
                'mutual_fund',
                'stocks',
                'loan',
                'other_asset',
                'other_liability',
            ],
        }).notNull(),
        class: text('class', {
            enum: ['asset', 'liability'],
        }).notNull(),
        currency: text('currency').notNull().default('INR'),
        creditLimit: bigint('credit_limit', { mode: 'number' }),
        isActive: boolean('is_active').notNull().default(true),
        metadata: jsonb('metadata')
            .notNull()
            .$type<Record<string, unknown>>()
            .default(sql`'{}'::jsonb`),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('fin_accounts_user_id_idx').on(table.userId),
        index('fin_accounts_user_kind_idx').on(table.userId, table.kind),
        index('fin_accounts_user_active_idx').on(table.userId, table.isActive),
    ]
);

export const finCategories = pgTable(
    'fin_categories',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id').references(() => users.id, { onDelete: 'cascade' }),
        name: text('name').notNull(),
        type: text('type', {
            enum: ['expense', 'income'],
        }).notNull(),
        parentId: text('parent_id'),
        icon: text('icon'),
        color: text('color'),
        isSystem: boolean('is_system').notNull().default(false),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('fin_categories_user_id_idx').on(table.userId),
        index('fin_categories_user_type_idx').on(table.userId, table.type),
    ]
);

export const finTransactions = pgTable(
    'fin_transactions',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        accountId: text('account_id')
            .notNull()
            .references(() => finAccounts.id, { onDelete: 'cascade' }),
        toAccountId: text('to_account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
        categoryId: text('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
        date: date('date', { mode: 'string' }).notNull(),
        type: text('type', {
            enum: ['expense', 'income', 'transfer', 'adjustment'],
        }).notNull(),
        amount: bigint('amount', { mode: 'number' }).notNull(),
        signedAmount: bigint('signed_amount', { mode: 'number' }).notNull(),
        payee: text('payee'),
        note: text('note'),
        tags: text('tags'),
        clientRequestId: text('client_request_id'),
        importHash: text('import_hash'),
        isRecurring: boolean('is_recurring').notNull().default(false),
        recurringRuleId: text('recurring_rule_id'),
        deletedAt: timestamp('deleted_at', { withTimezone: true, mode: 'date' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('fin_transactions_user_date_idx').on(table.userId, table.date),
        index('fin_transactions_account_date_idx').on(table.accountId, table.date),
        index('fin_transactions_user_category_idx').on(table.userId, table.categoryId),
        uniqueIndex('fin_transactions_user_client_req_idx')
            .on(table.userId, table.clientRequestId)
            .where(sql`${table.clientRequestId} IS NOT NULL`),
        uniqueIndex('fin_transactions_user_import_hash_idx')
            .on(table.userId, table.importHash)
            .where(sql`${table.importHash} IS NOT NULL`),
        check(
            'fin_transactions_amount_check',
            sql`${table.type} = 'adjustment' OR ${table.amount} > 0`
        ),
        check(
            'fin_transactions_transfer_check',
            sql`${table.type} <> 'transfer' OR (${table.toAccountId} IS NOT NULL AND ${table.toAccountId} <> ${table.accountId})`
        ),
    ]
);

export const finValuations = pgTable(
    'fin_valuations',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        accountId: text('account_id')
            .notNull()
            .references(() => finAccounts.id, { onDelete: 'cascade' }),
        date: date('date', { mode: 'string' }).notNull(),
        value: bigint('value', { mode: 'number' }).notNull(),
        costBasis: bigint('cost_basis', { mode: 'number' }),
        note: text('note'),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        uniqueIndex('fin_valuations_account_date_idx').on(table.accountId, table.date),
        index('fin_valuations_account_id_idx').on(table.accountId),
    ]
);

export const finBudgets = pgTable(
    'fin_budgets',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        categoryId: text('category_id')
            .notNull()
            .references(() => finCategories.id, { onDelete: 'cascade' }),
        amount: bigint('amount', { mode: 'number' }).notNull(),
        period: text('period', {
            enum: ['monthly', 'quarterly', 'yearly'],
        })
            .notNull()
            .default('monthly'),
        startDate: date('start_date', { mode: 'string' }).notNull(),
        endDate: date('end_date', { mode: 'string' }),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('fin_budgets_user_id_idx').on(table.userId),
        index('fin_budgets_user_category_idx').on(table.userId, table.categoryId),
    ]
);

export const finRecurringRules = pgTable(
    'fin_recurring_rules',
    {
        id: text('id')
            .primaryKey()
            .$defaultFn(() => newId()),
        userId: text('user_id')
            .notNull()
            .references(() => users.id, { onDelete: 'cascade' }),
        accountId: text('account_id')
            .notNull()
            .references(() => finAccounts.id, { onDelete: 'cascade' }),
        toAccountId: text('to_account_id').references(() => finAccounts.id, { onDelete: 'set null' }),
        categoryId: text('category_id').references(() => finCategories.id, { onDelete: 'set null' }),
        type: text('type', {
            enum: ['expense', 'income', 'transfer'],
        }).notNull(),
        amount: bigint('amount', { mode: 'number' }).notNull(),
        payee: text('payee'),
        note: text('note'),
        frequency: text('frequency', {
            enum: ['daily', 'weekly', 'monthly', 'quarterly', 'yearly'],
        }).notNull(),
        interval: integer('interval').notNull().default(1),
        startDate: date('start_date', { mode: 'string' }).notNull(),
        endDate: date('end_date', { mode: 'string' }),
        nextOccurrence: date('next_occurrence', { mode: 'string' }).notNull(),
        isActive: boolean('is_active').notNull().default(true),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    },
    (table) => [
        index('fin_recurring_user_id_idx').on(table.userId),
        index('fin_recurring_active_next_idx').on(table.userId, table.isActive, table.nextOccurrence),
    ]
);

export const finUserSettings = pgTable(
    'fin_user_settings',
    {
        userId: text('user_id')
            .primaryKey()
            .references(() => users.id, { onDelete: 'cascade' }),
        baseCurrency: text('base_currency').notNull().default('INR'),
        timezone: text('timezone').notNull().default('Asia/Kolkata'),
        weekStartsOn: integer('week_starts_on').notNull().default(1),
        trackingStartDate: date('tracking_start_date', { mode: 'string' }),
        setupStep: integer('setup_step').notNull().default(1),
        setupCompletedAt: timestamp('setup_completed_at', { withTimezone: true, mode: 'date' }),
        setupSkippedAt: timestamp('setup_skipped_at', { withTimezone: true, mode: 'date' }),
        draft: jsonb('draft').$type<Record<string, unknown>>(),
        createdAt: timestamp('created_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
        updatedAt: timestamp('updated_at', { withTimezone: true, mode: 'date' })
            .notNull()
            .defaultNow(),
    }
);

export type FinAccount = typeof finAccounts.$inferSelect;
export type NewFinAccount = typeof finAccounts.$inferInsert;
export type FinCategory = typeof finCategories.$inferSelect;
export type NewFinCategory = typeof finCategories.$inferInsert;
export type FinTransaction = typeof finTransactions.$inferSelect;
export type NewFinTransaction = typeof finTransactions.$inferInsert;
export type FinValuation = typeof finValuations.$inferSelect;
export type NewFinValuation = typeof finValuations.$inferInsert;
export type FinBudget = typeof finBudgets.$inferSelect;
export type NewFinBudget = typeof finBudgets.$inferInsert;
export type FinRecurringRule = typeof finRecurringRules.$inferSelect;
export type NewFinRecurringRule = typeof finRecurringRules.$inferInsert;
export type FinUserSettings = typeof finUserSettings.$inferSelect;
export type NewFinUserSettings = typeof finUserSettings.$inferInsert;

