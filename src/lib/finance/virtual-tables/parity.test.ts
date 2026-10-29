import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';
import path from 'node:path';
import fs from 'node:fs';
import * as schema from '@src/lib/db/schema';
import {
    finAccounts,
    finCategories,
    finTransactions,
} from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import { compileFinanceQuery } from './compiler';
import { FINANCE_QUERY_DEFINITIONS } from '../provision/workspace';

interface OraclePersona {
    name: string;
    description: string;
    monthly_spend: { month_start: string; spend: number }[];
    spend_by_category: { category: string; total_spend: number }[];
    income_vs_expense: { month_start: string; income: number; expense: number }[];
    balances_by_account: { name: string; balance: number }[];
    credit_card_utilization?: { name: string; utilization: number }[];
    top_payees: { payee: string; total_spend: number }[];
    savings_rate: number;
    recent_transactions_count: number;
}

describe('Result Parity Across Three Personas Against Oracle', () => {
    let pglite: PGlite;
    let db: ReturnType<typeof drizzle>;

    const oraclePath = path.join(__dirname, 'fixtures', 'oracle.json');
    const oracle: Record<string, OraclePersona> = JSON.parse(
        fs.readFileSync(oraclePath, 'utf8')
    );

    const userAaravId = 'usr_aarav_' + newId();
    const userMeeraId = 'usr_meera_' + newId();
    const userKabirId = 'usr_kabir_' + newId();

    beforeAll(async () => {
        pglite = new PGlite();
        db = drizzle(pglite, { schema });

        const migrationsFolder = path.join(process.cwd(), 'src/lib/db/migrations');
        await migrate(db, { migrationsFolder });

        // 1. Seed Users
        await db.insert(schema.users).values([
            { id: userAaravId, email: `aarav-${newId()}@example.com`, name: 'Aarav Sharma', role: 'member', passwordHash: 'hash' },
            { id: userMeeraId, email: `meera-${newId()}@example.com`, name: 'Meera Patel', role: 'member', passwordHash: 'hash' },
            { id: userKabirId, email: `kabir-${newId()}@example.com`, name: 'Kabir Verma', role: 'member', passwordHash: 'hash' },
        ]);

        // -------------------------------------------------------------------
        // Seed Persona 1: Aarav
        // -------------------------------------------------------------------
        const aaravHdfc = newId();
        const aaravIcici = newId();
        await db.insert(finAccounts).values([
            { id: aaravHdfc, userId: userAaravId, name: 'HDFC Salary Account', kind: 'bank', class: 'asset', currency: 'INR', isActive: true },
            { id: aaravIcici, userId: userAaravId, name: 'ICICI Sapphiro Card', kind: 'credit_card', class: 'liability', currency: 'INR', creditLimit: 30000000, isActive: true },
        ]);

        const catRentA = newId();
        const catGrocA = newId();
        const catDineA = newId();
        const catSalA = newId();
        await db.insert(finCategories).values([
            { id: catSalA, userId: userAaravId, name: 'Salary', type: 'income' },
            { id: catRentA, userId: userAaravId, name: 'Rent', type: 'expense' },
            { id: catGrocA, userId: userAaravId, name: 'Groceries', type: 'expense' },
            { id: catDineA, userId: userAaravId, name: 'Dining', type: 'expense' },
        ]);

        await db.insert(finTransactions).values([
            { id: newId(), userId: userAaravId, accountId: aaravHdfc, categoryId: catSalA, date: '2026-01-01', type: 'income', amount: 15000000, signedAmount: 15000000, payee: 'Tech Corp India' },
            { id: newId(), userId: userAaravId, accountId: aaravHdfc, categoryId: catRentA, date: '2026-01-05', type: 'expense', amount: 4000000, signedAmount: -4000000, payee: 'Prestige Estates' },
            { id: newId(), userId: userAaravId, accountId: aaravIcici, categoryId: catGrocA, date: '2026-01-10', type: 'expense', amount: 850000, signedAmount: -850000, payee: 'Nature Basket' },
            { id: newId(), userId: userAaravId, accountId: aaravIcici, categoryId: catDineA, date: '2026-01-15', type: 'expense', amount: 350000, signedAmount: -350000, payee: 'Toit Brewpub' },
        ]);

        // -------------------------------------------------------------------
        // Seed Persona 2: Meera
        // -------------------------------------------------------------------
        const meeraSbi = newId();
        const meeraZerodha = newId();
        await db.insert(finAccounts).values([
            { id: meeraSbi, userId: userMeeraId, name: 'SBI Savings Account', kind: 'bank', class: 'asset', currency: 'INR', isActive: true },
            { id: meeraZerodha, userId: userMeeraId, name: 'Zerodha Demat', kind: 'mutual_fund', class: 'asset', currency: 'INR', isActive: true },
        ]);

        const catSalM = newId();
        const catRentM = newId();
        const catGrocM = newId();
        await db.insert(finCategories).values([
            { id: catSalM, userId: userMeeraId, name: 'Salary', type: 'income' },
            { id: catRentM, userId: userMeeraId, name: 'Rent', type: 'expense' },
            { id: catGrocM, userId: userMeeraId, name: 'Groceries', type: 'expense' },
        ]);

        await db.insert(finTransactions).values([
            { id: newId(), userId: userMeeraId, accountId: meeraSbi, categoryId: catSalM, date: '2026-02-01', type: 'income', amount: 20000000, signedAmount: 20000000, payee: 'Global Analytics' },
            { id: newId(), userId: userMeeraId, accountId: meeraSbi, categoryId: catRentM, date: '2026-02-05', type: 'expense', amount: 2500000, signedAmount: -2500000, payee: 'DLF Properties' },
            { id: newId(), userId: userMeeraId, accountId: meeraSbi, categoryId: catGrocM, date: '2026-02-10', type: 'expense', amount: 1000000, signedAmount: -1000000, payee: 'FreshWorld' },
            { id: newId(), userId: userMeeraId, accountId: meeraSbi, toAccountId: meeraZerodha, date: '2026-02-15', type: 'transfer', amount: 4000000, signedAmount: -4000000, payee: 'Zerodha Fund' },
        ]);

        // -------------------------------------------------------------------
        // Seed Persona 3: Kabir
        // -------------------------------------------------------------------
        const kabirKotak = newId();
        const kabirLoan = newId();
        await db.insert(finAccounts).values([
            { id: kabirKotak, userId: userKabirId, name: 'Kotak Business Account', kind: 'bank', class: 'asset', currency: 'INR', isActive: true },
            { id: kabirLoan, userId: userKabirId, name: 'SBI Auto Loan', kind: 'loan', class: 'liability', currency: 'INR', isActive: true },
        ]);

        const catRevK = newId();
        const catEmiK = newId();
        const catUtilK = newId();
        await db.insert(finCategories).values([
            { id: catRevK, userId: userKabirId, name: 'Revenue', type: 'income' },
            { id: catEmiK, userId: userKabirId, name: 'EMI & Loans', type: 'expense' },
            { id: catUtilK, userId: userKabirId, name: 'Utilities', type: 'expense' },
        ]);

        // Auto loan starting balance: 350000 (handled via ledger adjustment or initial loan)
        await db.insert(finTransactions).values([
            { id: newId(), userId: userKabirId, accountId: kabirLoan, date: '2026-03-01', type: 'adjustment', amount: 35000000, signedAmount: 35000000, note: 'Loan Principal Balance' },
            { id: newId(), userId: userKabirId, accountId: kabirKotak, categoryId: catRevK, date: '2026-03-01', type: 'income', amount: 18000000, signedAmount: 18000000, payee: 'Client Contracts' },
            { id: newId(), userId: userKabirId, accountId: kabirKotak, categoryId: catEmiK, date: '2026-03-05', type: 'expense', amount: 3000000, signedAmount: -3000000, payee: 'SBI Vehicle Finance' },
            { id: newId(), userId: userKabirId, accountId: kabirKotak, categoryId: catUtilK, date: '2026-03-10', type: 'expense', amount: 1500000, signedAmount: -1500000, payee: 'BESCOM Power' },
        ]);
    });

    afterAll(async () => {
        await pglite.close();
    });

    async function executeQueryForUser(queryName: string, userId: string) {
        const queryDef = FINANCE_QUERY_DEFINITIONS.find((q) => q.name === queryName);
        if (!queryDef) throw new Error(`Query ${queryName} not found`);
        const compiled = compileFinanceQuery(queryDef.definition, { userId });
        const res = await pglite.query<Record<string, unknown>>(compiled.sql, compiled.params);
        return res.rows;
    }

    it('matches oracle values for Persona 1 (Aarav Sharma)', async () => {
        const expected = oracle.persona_aarav;

        // 1. Monthly Spend
        const monthlySpendRows = await executeQueryForUser('Monthly Spend', userAaravId);
        expect(monthlySpendRows).toHaveLength(1);
        const dateStr = monthlySpendRows[0].month_start instanceof Date
            ? monthlySpendRows[0].month_start.toISOString().slice(0, 10)
            : String(monthlySpendRows[0].month_start).slice(0, 10);
        expect(dateStr).toBe(expected.monthly_spend[0].month_start);
        expect(Number(monthlySpendRows[0].spend)).toBe(expected.monthly_spend[0].spend);

        // 2. Spend by Category
        const catRows = await executeQueryForUser('Spend by Category', userAaravId);
        expect(catRows).toHaveLength(3);
        expect(catRows[0].category).toBe(expected.spend_by_category[0].category);
        expect(Number(catRows[0].total_spend)).toBe(expected.spend_by_category[0].total_spend);

        // 3. Income vs Expense
        const incExpRows = await executeQueryForUser('Income vs Expense', userAaravId);
        expect(incExpRows).toHaveLength(1);
        expect(Number(incExpRows[0].income)).toBe(expected.income_vs_expense[0].income);
        expect(Number(incExpRows[0].expense)).toBe(expected.income_vs_expense[0].expense);

        // 4. Balances by Account
        const balRows = await executeQueryForUser('Balances by Account', userAaravId);
        expect(balRows).toHaveLength(2);
        const hdfcRow = balRows.find((r) => r.name === 'HDFC Salary Account')!;
        const iciciRow = balRows.find((r) => r.name === 'ICICI Sapphiro Card')!;
        expect(Number(hdfcRow.balance)).toBe(110000);
        expect(Number(iciciRow.balance)).toBe(-12000);

        // 5. Credit Card Utilization
        const ccRows = await executeQueryForUser('Credit Card Utilization', userAaravId);
        expect(ccRows).toHaveLength(1);
        expect(Number(ccRows[0].utilization)).toBe(0.04);

        // 6. Savings Rate
        const savRows = await executeQueryForUser('Savings Rate', userAaravId);
        expect(savRows).toHaveLength(1);
        expect(Number(savRows[0].savings_rate)).toBe(expected.savings_rate);
    });

    it('matches oracle values for Persona 2 (Meera Patel)', async () => {
        const expected = oracle.persona_meera;

        const monthlySpendRows = await executeQueryForUser('Monthly Spend', userMeeraId);
        expect(monthlySpendRows).toHaveLength(1);
        expect(Number(monthlySpendRows[0].spend)).toBe(expected.monthly_spend[0].spend);

        const incExpRows = await executeQueryForUser('Income vs Expense', userMeeraId);
        expect(Number(incExpRows[0].income)).toBe(expected.income_vs_expense[0].income);
        expect(Number(incExpRows[0].expense)).toBe(expected.income_vs_expense[0].expense);

        const savRows = await executeQueryForUser('Savings Rate', userMeeraId);
        expect(Number(savRows[0].savings_rate)).toBe(expected.savings_rate);
    });

    it('matches oracle values for Persona 3 (Kabir Verma)', async () => {
        const expected = oracle.persona_kabir;

        const monthlySpendRows = await executeQueryForUser('Monthly Spend', userKabirId);
        expect(monthlySpendRows).toHaveLength(1);
        expect(Number(monthlySpendRows[0].spend)).toBe(expected.monthly_spend[0].spend);

        const incExpRows = await executeQueryForUser('Income vs Expense', userKabirId);
        expect(Number(incExpRows[0].income)).toBe(expected.income_vs_expense[0].income);
        expect(Number(incExpRows[0].expense)).toBe(expected.income_vs_expense[0].expense);

        const savRows = await executeQueryForUser('Savings Rate', userKabirId);
        expect(Number(savRows[0].savings_rate)).toBe(expected.savings_rate);
    });
});
