import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import * as schema from '@src/lib/db/schema';
import { finAccounts, finCategories, finTransactions } from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import { compileFinanceQuery, CompileError } from './compiler';

describe('Finance Scoping Security Tests (Cross-User Isolation)', () => {
    let pglite: PGlite;
    let db: ReturnType<typeof drizzle>;

    const userA = 'user_alice_' + newId();
    const userB = 'user_bob_' + newId();

    let accountAId: string;
    let accountBId: string;

    beforeAll(async () => {
        pglite = new PGlite();
        db = drizzle(pglite, { schema });

        const migrationsFolder = path.join(process.cwd(), 'src/lib/db/migrations');
        await migrate(db, { migrationsFolder });

        // Insert users
        await db.insert(schema.users).values([
            { id: userA, email: `alice-${newId()}@example.com`, name: 'Alice', role: 'member', passwordHash: 'dummy_hash' },
            { id: userB, email: `bob-${newId()}@example.com`, name: 'Bob', role: 'member', passwordHash: 'dummy_hash' },
        ]);

        // Insert accounts for Alice
        accountAId = newId();
        await db.insert(finAccounts).values({
            id: accountAId,
            userId: userA,
            name: 'Alice Checking',
            kind: 'bank',
            class: 'asset',
            currency: 'INR',
            isActive: true,
        });

        // Insert accounts for Bob
        accountBId = newId();
        await db.insert(finAccounts).values({
            id: accountBId,
            userId: userB,
            name: 'Bob Secret Account',
            kind: 'bank',
            class: 'asset',
            currency: 'INR',
            isActive: true,
        });

        // Insert categories
        const catAId = newId();
        const catBId = newId();
        await db.insert(finCategories).values([
            { id: catAId, userId: userA, name: 'Alice Groceries', type: 'expense' },
            { id: catBId, userId: userB, name: 'Bob Secret Expense', type: 'expense' },
        ]);

        // Insert transactions for Alice (Income: ₹1,000 = 100,000 paise, Expense: ₹300 = 30,000 paise)
        await db.insert(finTransactions).values([
            {
                id: newId(),
                userId: userA,
                accountId: accountAId,
                date: '2026-05-01',
                type: 'income',
                amount: 100000,
                signedAmount: 100000,
                payee: 'Alice Employer',
                note: 'Alice Salary Note',
            },
            {
                id: newId(),
                userId: userA,
                accountId: accountAId,
                categoryId: catAId,
                date: '2026-05-10',
                type: 'expense',
                amount: 30000,
                signedAmount: -30000,
                payee: 'Alice Supermarket',
                note: 'Alice Groceries Note',
            },
        ]);

        // Insert transactions for Bob (Income: ₹5,000 = 500,000 paise, Expense: ₹2,000 = 200,000 paise)
        await db.insert(finTransactions).values([
            {
                id: newId(),
                userId: userB,
                accountId: accountBId,
                date: '2026-05-01',
                type: 'income',
                amount: 500000,
                signedAmount: 500000,
                payee: 'Bob Employer',
                note: 'Bob Confidential Bonus',
            },
            {
                id: newId(),
                userId: userB,
                accountId: accountBId,
                categoryId: catBId,
                date: '2026-05-15',
                type: 'expense',
                amount: 200000,
                signedAmount: -200000,
                payee: 'Bob Luxury Store',
                note: 'Bob Secret Purchase',
            },
        ]);
    });

    afterAll(async () => {
        await pglite.close();
    });

    it('user A queries on transactions never return user B records', async () => {
        const queryDef = {
            source: { table: 'transactions' },
            steps: [],
        };

        const compiledA = compileFinanceQuery(queryDef, { userId: userA });
        const resA = await pglite.query<{ payee: string; account_name: string }>(
            compiledA.sql,
            compiledA.params
        );

        expect(resA.rows).toHaveLength(2);
        for (const row of resA.rows) {
            expect(row.account_name).toBe('Alice Checking');
            expect(row.payee).not.toContain('Bob');
        }

        const compiledB = compileFinanceQuery(queryDef, { userId: userB });
        const resB = await pglite.query<{ payee: string; account_name: string }>(
            compiledB.sql,
            compiledB.params
        );

        expect(resB.rows).toHaveLength(2);
        for (const row of resB.rows) {
            expect(row.account_name).toBe('Bob Secret Account');
            expect(row.payee).toContain('Bob');
        }
    });

    it('user A queries on accounts and account_balances never return user B accounts', async () => {
        const queryDef = {
            source: { table: 'account_balances' },
            steps: [],
        };

        const compiledA = compileFinanceQuery(queryDef, { userId: userA });
        const resA = await pglite.query<{ name: string; balance: number }>(
            compiledA.sql,
            compiledA.params
        );

        expect(resA.rows).toHaveLength(1);
        expect(resA.rows[0].name).toBe('Alice Checking');
        // Balance = 1000.00 - 300.00 = 700.00
        expect(Number(resA.rows[0].balance)).toBe(700.0);

        const compiledB = compileFinanceQuery(queryDef, { userId: userB });
        const resB = await pglite.query<{ name: string; balance: number }>(
            compiledB.sql,
            compiledB.params
        );

        expect(resB.rows).toHaveLength(1);
        expect(resB.rows[0].name).toBe('Bob Secret Account');
        // Balance = 5000.00 - 2000.00 = 3000.00
        expect(Number(resB.rows[0].balance)).toBe(3000.0);
    });

    it('joins between virtual tables strictly preserve user scoping', async () => {
        const queryDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'accounts',
                    on: [{ left: 'account_id', right: 'id' }],
                },
            ],
        };

        const compiledA = compileFinanceQuery(queryDef, { userId: userA });
        const resA = await pglite.query<{ name: string }>(compiledA.sql, compiledA.params);

        expect(resA.rows).toHaveLength(2);
        expect(resA.rows.every((r) => r.name === 'Alice Checking')).toBe(true);
    });

    it('filters attempting to query Bob data from Alice session return 0 rows', async () => {
        const maliciousDef = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'account_name', op: '=', value: 'Bob Secret Account' }],
                    },
                },
            ],
        };

        const compiledA = compileFinanceQuery(maliciousDef, { userId: userA });
        const resA = await pglite.query(compiledA.sql, compiledA.params);

        expect(resA.rows).toHaveLength(0);
    });

    it('crafted definitions referencing physical persistence tables or system catalogs are strictly rejected', () => {
        const finTxQuery = {
            source: { table: 'fin_transactions' },
            steps: [],
        };
        expect(() => compileFinanceQuery(finTxQuery, { userId: userA })).toThrow(CompileError);

        const usersQuery = {
            source: { table: 'users' },
            steps: [],
        };
        expect(() => compileFinanceQuery(usersQuery, { userId: userA })).toThrow(CompileError);

        const joinFinAccounts = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'fin_accounts',
                    on: [{ left: 'account_id', right: 'id' }],
                },
            ],
        };
        expect(() => compileFinanceQuery(joinFinAccounts, { userId: userA })).toThrow(CompileError);
    });

    it('crafted mutate expressions attempting to exfiltrate other users data are rejected', () => {
        const mutateSubquery = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'mutate',
                    name: 'stolen_field',
                    expression: `(SELECT password_hash FROM users WHERE id = '${userB}')`,
                },
            ],
        };
        expect(() => compileFinanceQuery(mutateSubquery, { userId: userA })).toThrow(CompileError);

        const mutateFinTx = {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'mutate',
                    name: 'exfiltrate',
                    expression: `fin_transactions.signed_amount`,
                },
            ],
        };
        expect(() => compileFinanceQuery(mutateFinTx, { userId: userA })).toThrow(CompileError);
    });
});
