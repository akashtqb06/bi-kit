import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, finAccounts, finRecurringRules, finTransactions } from '@src/lib/db';
import { setupFinanceTestDb, USER_A } from '../../__tests__/db/test-helper';
import { generateDueRecurringTransactions } from '../generator';

describe('Recurring Rules: DB Backend Integration Tests (PGlite)', () => {
  let accountId: string;

  beforeEach(async () => {
    process.env.FINANCE_BACKEND = 'db';
    await setupFinanceTestDb();

    // Create a bank account for USER_A
    const [acc] = await db
      .insert(finAccounts)
      .values({
        userId: USER_A,
        name: 'HDFC Savings Test',
        kind: 'bank',
        class: 'asset',
        currency: 'INR',
        isActive: true,
      })
      .returning();

    accountId = acc.id;
  });

  it('materializes due recurring transactions in the Postgres database', async () => {
    // Insert a monthly recurring rule
    const [rule] = await db
      .insert(finRecurringRules)
      .values({
        userId: USER_A,
        accountId,
        type: 'expense',
        amount: 2500000, // ₹25,000 paise
        payee: 'Sobha Apartment Rent',
        note: 'Monthly Rent [DOM:5]',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-08-05',
        nextOccurrence: '2026-08-05',
        isActive: true,
      })
      .returning();

    // Run generator up to 2026-10-10
    const result = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-10-10',
      backend: 'db',
    });

    expect(result.processed).toBe(1);
    expect(result.generated).toBe(3); // Aug 5, Sep 5, Oct 5
    expect(result.backfilled).toBe(3);

    // Verify in database
    const rows = await db
      .select()
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, USER_A), eq(finTransactions.recurringRuleId, rule.id)));

    expect(rows.length).toBe(3);
    expect(rows.map((r) => r.date).sort()).toEqual(['2026-08-05', '2026-09-05', '2026-10-05']);

    for (const row of rows) {
      expect(row.isRecurring).toBe(true);
      expect(row.clientRequestId).toBe(`${rule.id}_${row.date}`);
      expect(Number(row.amount)).toBe(2500000);
      expect(Number(row.signedAmount)).toBe(-2500000); // Expense has negative signed amount
      expect(row.accountId).toBe(accountId);
    }

    // Verify rule updated next occurrence
    const [updatedRule] = await db
      .select()
      .from(finRecurringRules)
      .where(eq(finRecurringRules.id, rule.id));

    expect(updatedRule.nextOccurrence).toBe('2026-11-05');
  });

  it('enforces database idempotency: reruns insert 0 new records', async () => {
    const [rule] = await db
      .insert(finRecurringRules)
      .values({
        userId: USER_A,
        accountId,
        type: 'expense',
        amount: 50000,
        payee: 'Spotify Premium',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-10-01',
        nextOccurrence: '2026-10-01',
        isActive: true,
      })
      .returning();

    // First run
    const run1 = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-10-20',
      backend: 'db',
    });
    expect(run1.generated).toBe(1);

    // Second run
    const run2 = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-10-20',
      backend: 'db',
    });
    expect(run2.generated).toBe(0);

    const txns = await db
      .select()
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, USER_A), eq(finTransactions.recurringRuleId, rule.id)));
    expect(txns.length).toBe(1);
  });

  it('respects pause and resume in the database', async () => {
    const [rule] = await db
      .insert(finRecurringRules)
      .values({
        userId: USER_A,
        accountId,
        type: 'expense',
        amount: 80000,
        payee: 'Gym Annual Plan',
        frequency: 'monthly',
        interval: 1,
        startDate: '2026-09-10',
        nextOccurrence: '2026-09-10',
        isActive: false, // Paused
      })
      .returning();

    // Generator should skip paused rule
    const resPaused = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-10-20',
      backend: 'db',
    });
    expect(resPaused.rulesProcessed.some((r) => r.ruleId === rule.id)).toBe(false);

    // Resume rule
    await db
      .update(finRecurringRules)
      .set({ isActive: true })
      .where(eq(finRecurringRules.id, rule.id));

    // Now generator processes it
    const resResumed = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-10-20',
      backend: 'db',
    });
    expect(resResumed.generated).toBe(2); // Sep 10 and Oct 10
  });

  it('handles month-end clamping with day 31 in DB backend', async () => {
    const [rule] = await db
      .insert(finRecurringRules)
      .values({
        userId: USER_A,
        accountId,
        type: 'expense',
        amount: 120000,
        payee: 'Broadband Bill',
        note: 'Broadband [DOM:31]',
        frequency: 'monthly',
        interval: 1,
        startDate: '2024-01-31',
        nextOccurrence: '2024-01-31',
        isActive: true,
      })
      .returning();

    // Generate up to 2024-03-31
    const res = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2024-03-31',
      backend: 'db',
    });

    expect(res.generated).toBe(3); // Jan 31, Feb 29 (leap year 2024), Mar 31

    const txns = await db
      .select()
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, USER_A), eq(finTransactions.recurringRuleId, rule.id)));

    expect(txns.map((t) => t.date).sort()).toEqual([
      '2024-01-31',
      '2024-02-29', // Feb clamped
      '2024-03-31', // Mar restored
    ]);
  });
});
