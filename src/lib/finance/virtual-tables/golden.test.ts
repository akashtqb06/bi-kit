import { describe, it, expect } from 'vitest';
import {
    FINANCE_VIRTUAL_TABLE_NAMES,
    getFinanceCatalogSnapshot,
    getFinanceSchemaInfo,
} from './catalog';
import { getVirtualTableTemplate } from './templates';
import { compileFinanceQuery, CompileError } from './compiler';

describe('Virtual Tables Catalog & Golden SQL Templates', () => {
    it('declares all 8 virtual tables required by CONTRACT.md', () => {
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toHaveLength(8);
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('transactions');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('accounts');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('account_balances');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('balance_history');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('net_worth_history');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('categories');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('budgets');
        expect(FINANCE_VIRTUAL_TABLE_NAMES).toContain('budget_progress');
    });

    it('returns introspection snapshot with all tables and columns', () => {
        const snapshot = getFinanceCatalogSnapshot();
        expect(snapshot.tables).toHaveLength(8);

        const txTable = snapshot.tables.find((t) => t.name === 'transactions')!;
        expect(txTable).toBeDefined();
        const txCols = txTable.columns.map((c) => c.name);
        expect(txCols).toContain('id');
        expect(txCols).toContain('date');
        expect(txCols).toContain('month_start');
        expect(txCols).toContain('amount');
        expect(txCols).toContain('signed_amount');
        expect(txCols).toContain('account_name');
        expect(txCols).toContain('category');

        const balTable = snapshot.tables.find((t) => t.name === 'account_balances')!;
        expect(balTable).toBeDefined();
        const balCols = balTable.columns.map((c) => c.name);
        expect(balCols).toContain('balance');
        expect(balCols).toContain('outstanding');
        expect(balCols).toContain('utilization');
        expect(balCols).toContain('current_value');
        expect(balCols).toContain('gain');

        const nwTable = snapshot.tables.find((t) => t.name === 'net_worth_history')!;
        expect(nwTable).toBeDefined();
        const nwCols = nwTable.columns.map((c) => c.name);
        expect(nwCols).toContain('date');
        expect(nwCols).toContain('assets');
        expect(nwCols).toContain('liabilities');
        expect(nwCols).toContain('net_worth');
    });

    it('returns SchemaInfo format for query compiler and UI', () => {
        const schemaInfo = getFinanceSchemaInfo();
        expect(schemaInfo.tables.length).toBe(8);
        expect(schemaInfo.tables.map((t) => t.name)).toEqual(
            expect.arrayContaining([...FINANCE_VIRTUAL_TABLE_NAMES])
        );
    });

    it('golden template tests: every template binds user_id parameter and converts paise to rupees', () => {
        for (const tableName of FINANCE_VIRTUAL_TABLE_NAMES) {
            const sql = getVirtualTableTemplate(tableName, '$1');
            expect(sql).toContain('$1');

            if (tableName === 'transactions') {
                expect(sql).toContain('ROUND(t.amount::numeric / 100.0, 2) AS amount');
                expect(sql).toContain('ROUND(t.signed_amount::numeric / 100.0, 2) AS signed_amount');
                expect(sql).toContain('t.deleted_at IS NULL');
                expect(sql).toContain('DATE_TRUNC(\'month\', t.date)::date AS month_start');
            }

            if (tableName === 'account_balances') {
                expect(sql).toContain('COALESCE(b.balance_paise, 0)::numeric / 100.0');
                expect(sql).toContain('utilization');
                expect(sql).toContain('outstanding');
            }

            if (tableName === 'balance_history' || tableName === 'net_worth_history') {
                expect(sql).toContain('generate_series');
                expect(sql).toContain('bounds.start_date');
            }
        }
    });

    it('compiles standard finance query with user scoping CTE', () => {
        const queryDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'type', op: '=', value: 'expense' }],
                    },
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'category' }],
                    aggregates: [{ fn: 'sum', column: 'amount', alias: 'total_spend' }],
                },
                {
                    type: 'order',
                    items: [{ column: 'total_spend', dir: 'desc' }],
                },
            ],
        };

        const result = compileFinanceQuery(queryDef, { userId: 'user_123' });

        expect(result.params).toEqual(['user_123', 'expense']);
        expect(result.sql).toContain('"transactions" AS (');
        expect(result.sql).toContain('user_id = $1');
        expect(result.sql).toContain('"type" = $2');
        expect(result.sql).toContain('GROUP BY "category"');
        expect(result.sql).toContain('ORDER BY "total_spend" DESC');
    });

    it('compiles joins between virtual tables cleanly', () => {
        const queryDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'accounts',
                    on: [{ left: 'account_id', right: 'id' }],
                },
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'class', op: '=', value: 'asset' }],
                    },
                },
            ],
        };

        const result = compileFinanceQuery(queryDef, { userId: 'user_123' });

        expect(result.params).toEqual(['user_123', 'asset']);
        expect(result.sql).toContain('"transactions" AS (');
        expect(result.sql).toContain('"accounts" AS (');
        expect(result.sql).toContain('INNER JOIN "accounts" ON');
        expect(result.sql).toContain('"class" = $2');
    });

    it('rejects queries referencing tables outside the catalog', () => {
        const invalidTableDef = {
            source: { table: 'fin_transactions' },
            steps: [],
        };
        expect(() => compileFinanceQuery(invalidTableDef, { userId: 'user_123' })).toThrow(
            CompileError
        );

        const invalidJoinDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'users',
                    on: [{ left: 'id', right: 'id' }],
                },
            ],
        };
        expect(() => compileFinanceQuery(invalidJoinDef, { userId: 'user_123' })).toThrow(
            CompileError
        );
    });

    it('rejects mutate expressions containing subqueries or raw physical table names', () => {
        const subqueryDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'mutate',
                    name: 'stolen_data',
                    expression: '(SELECT email FROM users LIMIT 1)',
                },
            ],
        };
        expect(() => compileFinanceQuery(subqueryDef, { userId: 'user_123' })).toThrow(
            CompileError
        );

        const finAccessDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'mutate',
                    name: 'bypass',
                    expression: 'fin_accounts.credit_limit * 2',
                },
            ],
        };
        expect(() => compileFinanceQuery(finAccessDef, { userId: 'user_123' })).toThrow(
            CompileError
        );
    });
});
