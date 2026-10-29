import type { TableSnapshot, SchemaSnapshot, SchemaInfo } from '@src/lib/connectors/types';

/**
 * Virtual Tables Catalog for Finance Module
 *
 * Implements the 8 virtual reporting views defined in docs/finance/CONTRACT.md:
 * 1. transactions
 * 2. accounts
 * 3. account_balances
 * 4. balance_history
 * 5. net_worth_history
 * 6. categories
 * 7. budgets
 * 8. budget_progress
 *
 * Amounts are exposed in fractional rupees (numeric / number).
 */

export const FINANCE_VIRTUAL_TABLE_NAMES = [
    'transactions',
    'accounts',
    'account_balances',
    'balance_history',
    'net_worth_history',
    'categories',
    'budgets',
    'budget_progress',
] as const;

export type FinanceVirtualTableName = (typeof FINANCE_VIRTUAL_TABLE_NAMES)[number];

export function isFinanceVirtualTable(name: string): name is FinanceVirtualTableName {
    return FINANCE_VIRTUAL_TABLE_NAMES.includes(name as FinanceVirtualTableName);
}

export const FINANCE_VIRTUAL_TABLES: Record<FinanceVirtualTableName, TableSnapshot> = {
    transactions: {
        name: 'transactions',
        kind: 'view',
        columns: [
            { name: 'id', type: 'text', nativeType: 'text', isPrimaryKey: true, nullable: false },
            { name: 'date', type: 'date', nativeType: 'date', nullable: false },
            { name: 'year', type: 'number', nativeType: 'integer', nullable: false },
            { name: 'month', type: 'number', nativeType: 'integer', nullable: false },
            { name: 'month_start', type: 'date', nativeType: 'date', nullable: false },
            { name: 'weekday', type: 'number', nativeType: 'integer', nullable: false },
            { name: 'type', type: 'text', nativeType: 'text', nullable: false },
            { name: 'amount', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'signed_amount', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'account_id', type: 'text', nativeType: 'text', nullable: false },
            { name: 'account_name', type: 'text', nativeType: 'text', nullable: false },
            { name: 'account_kind', type: 'text', nativeType: 'text', nullable: false },
            { name: 'to_account_id', type: 'text', nativeType: 'text', nullable: true },
            { name: 'category_id', type: 'text', nativeType: 'text', nullable: true },
            { name: 'category', type: 'text', nativeType: 'text', nullable: false },
            { name: 'parent_category', type: 'text', nativeType: 'text', nullable: true },
            { name: 'payee', type: 'text', nativeType: 'text', nullable: true },
            { name: 'note', type: 'text', nativeType: 'text', nullable: true },
            { name: 'tags', type: 'text', nativeType: 'text', nullable: true },
        ],
    },
    accounts: {
        name: 'accounts',
        kind: 'view',
        columns: [
            { name: 'id', type: 'text', nativeType: 'text', isPrimaryKey: true, nullable: false },
            { name: 'name', type: 'text', nativeType: 'text', nullable: false },
            { name: 'kind', type: 'text', nativeType: 'text', nullable: false },
            { name: 'class', type: 'text', nativeType: 'text', nullable: false },
            { name: 'currency', type: 'text', nativeType: 'text', nullable: false },
            { name: 'is_active', type: 'boolean', nativeType: 'boolean', nullable: false },
            { name: 'credit_limit', type: 'number', nativeType: 'numeric(15,2)', nullable: true },
            { name: 'created_at', type: 'date', nativeType: 'timestamp with time zone', nullable: false },
            { name: 'updated_at', type: 'date', nativeType: 'timestamp with time zone', nullable: false },
        ],
    },
    account_balances: {
        name: 'account_balances',
        kind: 'view',
        columns: [
            { name: 'account_id', type: 'text', nativeType: 'text', isPrimaryKey: true, nullable: false },
            { name: 'name', type: 'text', nativeType: 'text', nullable: false },
            { name: 'kind', type: 'text', nativeType: 'text', nullable: false },
            { name: 'class', type: 'text', nativeType: 'text', nullable: false },
            { name: 'balance', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'outstanding', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'credit_limit', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'utilization', type: 'number', nativeType: 'numeric(5,4)', nullable: false },
            { name: 'current_value', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'contributions', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'gain', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
        ],
    },
    balance_history: {
        name: 'balance_history',
        kind: 'view',
        columns: [
            { name: 'date', type: 'date', nativeType: 'date', nullable: false },
            { name: 'account_id', type: 'text', nativeType: 'text', nullable: false },
            { name: 'balance', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'value', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
        ],
    },
    net_worth_history: {
        name: 'net_worth_history',
        kind: 'view',
        columns: [
            { name: 'date', type: 'date', nativeType: 'date', isPrimaryKey: true, nullable: false },
            { name: 'assets', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'liabilities', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'net_worth', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
        ],
    },
    categories: {
        name: 'categories',
        kind: 'view',
        columns: [
            { name: 'id', type: 'text', nativeType: 'text', isPrimaryKey: true, nullable: false },
            { name: 'name', type: 'text', nativeType: 'text', nullable: false },
            { name: 'type', type: 'text', nativeType: 'text', nullable: false },
            { name: 'parent_id', type: 'text', nativeType: 'text', nullable: true },
            { name: 'is_system', type: 'boolean', nativeType: 'boolean', nullable: false },
        ],
    },
    budgets: {
        name: 'budgets',
        kind: 'view',
        columns: [
            { name: 'id', type: 'text', nativeType: 'text', isPrimaryKey: true, nullable: false },
            { name: 'category_id', type: 'text', nativeType: 'text', nullable: false },
            { name: 'amount', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'period', type: 'text', nativeType: 'text', nullable: false },
            { name: 'start_date', type: 'date', nativeType: 'date', nullable: false },
        ],
    },
    budget_progress: {
        name: 'budget_progress',
        kind: 'view',
        columns: [
            { name: 'budget_id', type: 'text', nativeType: 'text', isPrimaryKey: true, nullable: false },
            { name: 'category_id', type: 'text', nativeType: 'text', nullable: false },
            { name: 'category_name', type: 'text', nativeType: 'text', nullable: false },
            { name: 'period', type: 'text', nativeType: 'text', nullable: false },
            { name: 'budgeted_amount', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'spent_amount', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'remaining_amount', type: 'number', nativeType: 'numeric(15,2)', nullable: false },
            { name: 'percentage_used', type: 'number', nativeType: 'numeric(5,2)', nullable: false },
        ],
    },
};

export function getFinanceCatalogSnapshot(): SchemaSnapshot {
    return {
        schemas: ['public'],
        tables: Object.values(FINANCE_VIRTUAL_TABLES),
        fetchedAt: new Date().toISOString(),
    };
}

export function getFinanceSchemaInfo(): SchemaInfo {
    return {
        tables: Object.values(FINANCE_VIRTUAL_TABLES).map((t) => ({
            name: t.name,
            kind: t.kind,
            columns: t.columns.map((c) => ({
                name: c.name,
                type: c.nativeType,
                nullable: c.nullable ?? true,
            })),
        })),
    };
}
