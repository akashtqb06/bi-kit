import { describe, it, expect, beforeAll } from 'vitest';
import { getConnectorDefinition } from '../../registry';
import { createConnector } from '../../factory';
import { FinanceConnector } from './connector';
import { getDb, resetConnection } from '@src/lib/db/client';
import { runMigrations } from '@src/lib/db/migrate';
import * as schema from '@src/lib/db/schema';
import { finAccounts, finTransactions } from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import { ConnectorError } from '../../types';
import './index'; // self-register

describe('FinanceConnector Implementation & Security', () => {
    let db: ReturnType<typeof getDb>;
    const testUserId = 'user_conn_' + newId();
    let testDsId: string;

    beforeAll(async () => {
        db = resetConnection();
        await runMigrations();

        // Seed user
        await db.insert(schema.users).values({
            id: testUserId,
            email: `conn-${newId()}@example.com`,
            name: 'Connector Tester',
            role: 'member',
            passwordHash: 'dummy_hash',
        });

        // Seed account and transaction
        const accId = newId();
        await db.insert(finAccounts).values({
            id: accId,
            userId: testUserId,
            name: 'Primary Bank',
            kind: 'bank',
            class: 'asset',
            currency: 'INR',
            isActive: true,
        });

        await db.insert(finTransactions).values({
            id: newId(),
            userId: testUserId,
            accountId: accId,
            date: '2026-06-01',
            type: 'income',
            amount: 5000000, // ₹50,000
            signedAmount: 5000000,
            payee: 'Tech Client',
            note: 'Invoice 101',
        });

        // Create data source record
        testDsId = newId();
        await db.insert(schema.dataSources).values({
            id: testDsId,
            ownerId: testUserId,
            name: 'My Finance',
            slug: `my-finance-${testUserId}`,
            type: 'finance',
            config: { isBuiltin: true, userId: testUserId },
            status: 'ok',
        });
    });

    it('is registered in connector registry with correct capabilities', () => {
        const def = getConnectorDefinition('finance');
        expect(def).toBeDefined();
        expect(def?.type).toBe('finance');
        expect(def?.category).toBe('builtin');
        expect(def?.capabilities.rawQuery).toBeNull();
        expect(def?.capabilities.dialect).toBe('postgres');
        expect(def?.capabilities.operations).toContain('filter');
        expect(def?.capabilities.operations).toContain('join');
        expect(def?.capabilities.operations).toContain('summarize');
        // @ts-expect-error extension check
        expect(def?.capabilities.virtualTables).toBe(true);
    });

    it('instantiates via factory createConnector', () => {
        const source = {
            id: testDsId,
            ownerId: testUserId,
            name: 'My Finance',
            type: 'finance',
            config: { isBuiltin: true, userId: testUserId },
        } as unknown as schema.DataSource;

        const connector = createConnector(source);
        expect(connector).toBeInstanceOf(FinanceConnector);
    });

    it('test() verifies database connectivity', async () => {
        const connector = new FinanceConnector({ isBuiltin: true, userId: testUserId });
        const res = await connector.test();
        expect(res.ok).toBe(true);
        expect(res.latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('introspect() returns all 8 virtual tables snapshot', async () => {
        const connector = new FinanceConnector({ isBuiltin: true, userId: testUserId });
        const schema = await connector.introspect();
        expect(schema.tables).toHaveLength(8);
        const tableNames = schema.tables.map((t) => t.name);
        expect(tableNames).toContain('transactions');
        expect(tableNames).toContain('accounts');
        expect(tableNames).toContain('account_balances');
        expect(tableNames).toContain('balance_history');
        expect(tableNames).toContain('net_worth_history');
        expect(tableNames).toContain('categories');
        expect(tableNames).toContain('budgets');
        expect(tableNames).toContain('budget_progress');
    });

    it('run() automatically injects scoped CTEs and returns normalized rows', async () => {
        const connector = new FinanceConnector({ isBuiltin: true, userId: testUserId });

        // Query referencing "transactions" without CTEs (as produced by standard compiler)
        const sql = `SELECT "id", "amount", "payee" FROM "transactions" WHERE "type" = $1`;
        const res = await connector.run({ kind: 'sql', sql, params: ['income'] });

        expect(res.columns).toEqual(['id', 'amount', 'payee']);
        expect(res.rowCount).toBe(1);
        expect(Number(res.rows[0][1])).toBe(50000.0);
        expect(res.rows[0][2]).toBe('Tech Client');
    });

    it('run() strictly blocks mutation queries', async () => {
        const connector = new FinanceConnector({ isBuiltin: true, userId: testUserId });

        await expect(
            connector.run({ kind: 'sql', sql: `DROP TABLE fin_transactions` })
        ).rejects.toThrow(ConnectorError);

        await expect(
            connector.run({ kind: 'sql', sql: `INSERT INTO fin_accounts (id) VALUES ('123')` })
        ).rejects.toThrow(ConnectorError);
    });

    it('run() strictly blocks direct access to internal fin_* tables', async () => {
        const connector = new FinanceConnector({ isBuiltin: true, userId: testUserId });

        await expect(
            connector.run({ kind: 'sql', sql: `SELECT * FROM fin_transactions` })
        ).rejects.toThrow(ConnectorError);

        await expect(
            connector.run({ kind: 'sql', sql: `SELECT * FROM users` })
        ).rejects.toThrow(ConnectorError);
    });
});
