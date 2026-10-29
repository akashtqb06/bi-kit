import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
    finAccounts,
    finCategories,
    finTransactions,
    finValuations,
    finBudgets,
} from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import { seedUsers } from './users';
import { provisionFinanceWorkspace } from '@src/lib/finance/provision/workspace';
import { createConnector } from '@src/lib/connectors/factory';
import { compileFinanceQuery } from '@src/lib/finance/virtual-tables';
import { runMigrations } from '@src/lib/db/migrate';
import '@src/lib/connectors/drivers/finance';

/**
 * Seeds sample financial accounts, categories, transactions, and valuations
 * for a demo user if they don't already have finance records.
 */
export async function seedDemoFinanceData(userId: string): Promise<void> {
    const existingAccounts = await db
        .select({ id: finAccounts.id })
        .from(finAccounts)
        .where(eq(finAccounts.userId, userId))
        .limit(1);

    if (existingAccounts.length > 0) {
        return; // Already has financial data
    }

    const now = new Date();

    // 1. Categories
    const categoriesToInsert = [
        { id: newId(), userId, name: 'Salary', type: 'income' as const, isSystem: false },
        { id: newId(), userId, name: 'Groceries', type: 'expense' as const, isSystem: false },
        { id: newId(), userId, name: 'Rent', type: 'expense' as const, isSystem: false },
        { id: newId(), userId, name: 'Dining', type: 'expense' as const, isSystem: false },
        { id: newId(), userId, name: 'Utilities', type: 'expense' as const, isSystem: false },
        { id: newId(), userId, name: 'Shopping', type: 'expense' as const, isSystem: false },
    ];

    for (const cat of categoriesToInsert) {
        await db.insert(finCategories).values({
            ...cat,
            createdAt: now,
            updatedAt: now,
        });
    }

    const catMap = new Map(categoriesToInsert.map((c) => [c.name, c.id]));

    // 2. Accounts
    const bankAccount = {
        id: newId(),
        userId,
        name: 'HDFC Savings Account',
        kind: 'bank' as const,
        class: 'asset' as const,
        currency: 'INR',
        creditLimit: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: now,
    };

    const cardAccount = {
        id: newId(),
        userId,
        name: 'ICICI Sapphiro Credit Card',
        kind: 'credit_card' as const,
        class: 'liability' as const,
        currency: 'INR',
        creditLimit: 30000000, // ₹3,00,000 in paise
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: now,
    };

    const mfAccount = {
        id: newId(),
        userId,
        name: 'Zerodha Mutual Funds',
        kind: 'mutual_fund' as const,
        class: 'asset' as const,
        currency: 'INR',
        creditLimit: null,
        isActive: true,
        createdAt: new Date('2026-01-01'),
        updatedAt: now,
    };

    await db.insert(finAccounts).values([bankAccount, cardAccount, mfAccount]);

    // 3. Transactions across multiple months
    const sampleTxs = [
        // Jan 2026 Salary
        {
            id: newId(),
            userId,
            accountId: bankAccount.id,
            categoryId: catMap.get('Salary'),
            date: '2026-01-01',
            type: 'income' as const,
            amount: 15000000, // ₹1,50,000
            signedAmount: 15000000,
            payee: 'Tech Corp India',
            note: 'January Salary',
        },
        // Jan 2026 Rent
        {
            id: newId(),
            userId,
            accountId: bankAccount.id,
            categoryId: catMap.get('Rent'),
            date: '2026-01-05',
            type: 'expense' as const,
            amount: 4000000, // ₹40,000
            signedAmount: -4000000,
            payee: 'Prestige Estates',
            note: 'Apartment Rent',
        },
        // Jan 2026 Groceries
        {
            id: newId(),
            userId,
            accountId: cardAccount.id,
            categoryId: catMap.get('Groceries'),
            date: '2026-01-10',
            type: 'expense' as const,
            amount: 850000, // ₹8,500
            signedAmount: -850000,
            payee: 'Nature Basket',
            note: 'Monthly groceries',
        },
        // Jan 2026 Transfer to MF
        {
            id: newId(),
            userId,
            accountId: bankAccount.id,
            toAccountId: mfAccount.id,
            date: '2026-01-15',
            type: 'transfer' as const,
            amount: 3000000, // ₹30,000
            signedAmount: -3000000,
            payee: 'Zerodha Coin',
            note: 'SIP Investment',
        },
        // Feb 2026 Salary
        {
            id: newId(),
            userId,
            accountId: bankAccount.id,
            categoryId: catMap.get('Salary'),
            date: '2026-02-01',
            type: 'income' as const,
            amount: 15000000,
            signedAmount: 15000000,
            payee: 'Tech Corp India',
            note: 'February Salary',
        },
        // Feb 2026 Rent
        {
            id: newId(),
            userId,
            accountId: bankAccount.id,
            categoryId: catMap.get('Rent'),
            date: '2026-02-05',
            type: 'expense' as const,
            amount: 4000000,
            signedAmount: -4000000,
            payee: 'Prestige Estates',
            note: 'Apartment Rent',
        },
        // Feb 2026 Dining
        {
            id: newId(),
            userId,
            accountId: cardAccount.id,
            categoryId: catMap.get('Dining'),
            date: '2026-02-14',
            type: 'expense' as const,
            amount: 450000, // ₹4,500
            signedAmount: -450000,
            payee: 'Toit Brewpub',
            note: 'Dinner',
        },
        // Oct 2026 (Recent)
        {
            id: newId(),
            userId,
            accountId: bankAccount.id,
            categoryId: catMap.get('Salary'),
            date: '2026-10-01',
            type: 'income' as const,
            amount: 16000000, // ₹1,60,000
            signedAmount: 16000000,
            payee: 'Tech Corp India',
            note: 'October Salary',
        },
        {
            id: newId(),
            userId,
            accountId: cardAccount.id,
            categoryId: catMap.get('Shopping'),
            date: '2026-10-15',
            type: 'expense' as const,
            amount: 1250000, // ₹12,500
            signedAmount: -1250000,
            payee: 'Amazon India',
            note: 'Festival Shopping',
        },
    ];

    for (const tx of sampleTxs) {
        await db.insert(finTransactions).values({
            ...tx,
            createdAt: now,
            updatedAt: now,
        });
    }

    // 4. Valuations for Mutual Funds
    await db.insert(finValuations).values([
        {
            id: newId(),
            accountId: mfAccount.id,
            date: '2026-01-31',
            value: 3050000, // ₹30,500
            costBasis: 3000000,
            createdAt: now,
            updatedAt: now,
        },
        {
            id: newId(),
            accountId: mfAccount.id,
            date: '2026-10-28',
            value: 3580000, // ₹35,800
            costBasis: 3000000,
            createdAt: now,
            updatedAt: now,
        },
    ]);

    // 5. Budgets
    if (catMap.get('Groceries')) {
        await db.insert(finBudgets).values({
            id: newId(),
            userId,
            categoryId: catMap.get('Groceries')!,
            amount: 1500000, // ₹15,000
            period: 'monthly',
            startDate: '2026-01-01',
            createdAt: now,
            updatedAt: now,
        });
    }
}

/**
 * Main seed function for personal finance workbooks.
 */
export async function seedFinanceWorkbook(): Promise<void> {
    await runMigrations();
    const { admin, member } = await seedUsers();

    // 1. Seed demo financial data for both users
    await seedDemoFinanceData(admin.id);
    await seedDemoFinanceData(member.id);

    // 2. Provision finance workspace for Admin
    const adminProvision = await provisionFinanceWorkspace(admin.id);
    console.log(`Provisioned finance workspace for Admin (${admin.email}):`);
    console.log(`  Data Source: "${adminProvision.dataSource.name}" (${adminProvision.dataSource.id})`);
    console.log(`  Workbook:    "${adminProvision.workbook.name}" (${adminProvision.workbook.id})`);
    console.log(`  Dashboard:   "${adminProvision.dashboard.name}" (${adminProvision.dashboard.id})`);
    console.log(`  Queries:     ${adminProvision.queries.length}`);
    console.log(`  Charts:      ${adminProvision.charts.length}`);

    // 3. Provision finance workspace for Member
    const memberProvision = await provisionFinanceWorkspace(member.id);
    console.log(`Provisioned finance workspace for Member (${member.email}):`);
    console.log(`  Data Source: "${memberProvision.dataSource.name}" (${memberProvision.dataSource.id})`);
    console.log(`  Workbook:    "${memberProvision.workbook.name}" (${memberProvision.workbook.id})`);
    console.log(`  Dashboard:   "${memberProvision.dashboard.name}" (${memberProvision.dashboard.id})`);

    // 4. Validate query execution on Admin's connector
    const connector = createConnector(adminProvision.dataSource);
    for (const q of adminProvision.queries) {
        const compiled = compileFinanceQuery(q.definition, { userId: admin.id });
        const res = await connector.run({ kind: 'sql', sql: compiled.sql, params: compiled.params });
        console.log(`Validated seeded query "${q.name}": ${res.rowCount} rows returned.`);
    }

    console.log('Finance workbook seeding and verification successfully completed.');
}

// Allow direct execution: tsx scripts/seed/finance-workbook.ts
if (
    typeof process.argv[1] === 'string' &&
    process.argv[1].endsWith('finance-workbook.ts')
) {
    seedFinanceWorkbook()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Failed to seed finance workbook:', err);
            process.exit(1);
        });
}
