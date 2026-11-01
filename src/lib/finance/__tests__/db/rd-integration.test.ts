import { describe, it, expect, beforeEach } from 'vitest';
import { db, finAccounts, finRecurringRules, finTransactions } from '@src/lib/db';
import { setupFinanceTestDb, USER_A, USER_B } from './test-helper';
import type { DbFinanceService } from '../../db-service';
import { generateDueRecurringTransactions } from '../../recurring/generator';
import { backfillRDAccounts } from '../../../../../scripts/migrate-rd-backfill';
import { and, eq, isNull } from 'drizzle-orm';

describe('RD Auto-Debit & Integration Tests on PGlite', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
    // Clean up test transactions, rules, and accounts for USER_A and USER_B
    await db.delete(finTransactions).where(eq(finTransactions.userId, USER_A));
    await db.delete(finTransactions).where(eq(finTransactions.userId, USER_B));
    await db.delete(finRecurringRules).where(eq(finRecurringRules.userId, USER_A));
    await db.delete(finRecurringRules).where(eq(finRecurringRules.userId, USER_B));
    await db.delete(finAccounts).where(eq(finAccounts.userId, USER_A));
    await db.delete(finAccounts).where(eq(finAccounts.userId, USER_B));
  });

  it('creates an auto-debit recurring rule, generates transfers, is idempotent, and preserves net worth', async () => {
    // 1. Create a bank account with ₹1,00,000 balance
    const bank = await service.createAccount(USER_A, {
      name: 'Salary Account',
      kind: 'bank',
    });

    await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'income',
      amount: 10000000, // ₹1,00,000
      date: '2026-08-01',
      payee: 'Opening Funds',
    });

    // 2. Create an RD starting 2026-08-18, day 2, 12 months, autoDebit enabled from bank
    const rd = await service.createAccount(USER_A, {
      name: 'Monthly Savings RD',
      kind: 'recurring_deposit',
      metadata: {
        monthlyInstallmentPaise: 500000, // ₹5,000
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 6.8,
        payFromAccountId: bank.id,
        autoDebit: true,
      },
    });

    // Verify recurring rule was automatically created
    const rules = await db
      .select()
      .from(finRecurringRules)
      .where(and(eq(finRecurringRules.userId, USER_A), eq(finRecurringRules.toAccountId, rd.id)));

    expect(rules).toHaveLength(1);
    const rule = rules[0];
    expect(rule.type).toBe('transfer');
    expect(rule.accountId).toBe(bank.id);
    expect(rule.toAccountId).toBe(rd.id);
    expect(Number(rule.amount)).toBe(500000);
    expect(rule.startDate).toBe('2026-08-18');
    expect(rule.endDate).toBe('2027-07-02');
    expect(rule.isActive).toBe(true);

    // 3. Run generator as of 2026-11-01 (Aug 18, Sep 2, Oct 2 = 3 transfers due)
    const genResult1 = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-11-01',
    });

    expect(genResult1.generated).toBe(3);

    // Verify transactions in database
    const txns = await db
      .select()
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, USER_A),
          eq(finTransactions.toAccountId, rd.id),
          isNull(finTransactions.deletedAt)
        )
      )
      .orderBy(finTransactions.date);

    expect(txns).toHaveLength(3);
    expect(txns.map((t) => t.date)).toEqual(['2026-08-18', '2026-09-02', '2026-10-02']);
    expect(txns.every((t) => t.type === 'transfer')).toBe(true);

    // Verify spending unchanged (transfers are not expenses)
    const stats = await service.getOverviewStats(USER_A);
    expect(stats.monthlyExpense).toBe(0);

    // 4. Run generator again on the same date (Idempotency: rule is already advanced past 2026-11-01, so 0 generated)
    const genResult2 = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-11-01',
    });
    expect(genResult2.generated).toBe(0);

    // 5. Advance generator to 2026-11-02 (4th installment due today)
    const genResult3 = await generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-11-02',
    });
    expect(genResult3.generated).toBe(1);

    const txnsAfterNov2 = await db
      .select()
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, USER_A),
          eq(finTransactions.toAccountId, rd.id),
          isNull(finTransactions.deletedAt)
        )
      )
      .orderBy(finTransactions.date);

    expect(txnsAfterNov2).toHaveLength(4);
    expect(txnsAfterNov2[3].date).toBe('2026-11-02');
  });

  it('updates recurring rule from effective month when installment day changes', async () => {
    const bank = await service.createAccount(USER_A, {
      name: 'HDFC Bank',
      kind: 'bank',
    });

    const rd = await service.createAccount(USER_A, {
      name: 'ICICI RD',
      kind: 'recurring_deposit',
      metadata: {
        monthlyInstallmentPaise: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 6.8,
        payFromAccountId: bank.id,
        autoDebit: true,
      },
    });

    // Change day to 10 effective from 2026-12
    const meta = (rd.metadata || {}) as Record<string, unknown>;
    const updatedMeta = {
      ...meta,
      installmentDay: 10,
      installmentDayHistory: [
        { effectiveFrom: '2026-08', day: 2 },
        { effectiveFrom: '2026-12', day: 10 },
      ],
    };

    await service.updateAccount(USER_A, rd.id, {
      metadata: updatedMeta,
    });

    const [rule] = await db
      .select()
      .from(finRecurringRules)
      .where(and(eq(finRecurringRules.userId, USER_A), eq(finRecurringRules.toAccountId, rd.id)));

    expect(rule).toBeDefined();
    expect(rule.endDate).toBe('2027-07-10'); // Last installment shifts to 10th
  });

  it('deactivates recurring rule when RD is deleted or autoDebit turned off', async () => {
    const bank = await service.createAccount(USER_A, {
      name: 'HDFC Bank',
      kind: 'bank',
    });

    const rd = await service.createAccount(USER_A, {
      name: 'ICICI RD',
      kind: 'recurring_deposit',
      metadata: {
        monthlyInstallmentPaise: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        payFromAccountId: bank.id,
        autoDebit: true,
      },
    });

    const [rule] = await db
      .select()
      .from(finRecurringRules)
      .where(and(eq(finRecurringRules.userId, USER_A), eq(finRecurringRules.toAccountId, rd.id)));

    expect(rule).toBeDefined();

    // Turning off autoDebit
    await service.updateAccount(USER_A, rd.id, {
      metadata: {
        ...(rd.metadata as Record<string, unknown>),
        autoDebit: false,
      },
    });

    const [ruleAfterOff] = await db
      .select()
      .from(finRecurringRules)
      .where(eq(finRecurringRules.id, rule.id));

    expect(ruleAfterOff.isActive).toBe(false);

    // Deleting the RD
    await service.deleteAccount(USER_A, rd.id);
    const [ruleAfterDelete] = await db
      .select()
      .from(finRecurringRules)
      .where(eq(finRecurringRules.id, rule.id));

    expect(ruleAfterDelete.isActive).toBe(false);
  });

  it('verifies backfill migration is idempotent and maintains user isolation', async () => {
    // Create an RD for USER_A without new fields
    const rd1 = await service.createAccount(USER_A, {
      name: 'Legacy RD 1',
      kind: 'recurring_deposit',
      metadata: {
        monthlyInstallmentPaise: 500000,
        startDate: '2026-08-18',
        tenureMonths: 12,
        interestRate: 6.8,
      },
    });

    // Create an RD for USER_B
    const rd2 = await service.createAccount(USER_B, {
      name: 'Legacy RD 2',
      kind: 'recurring_deposit',
      metadata: {
        monthlyInstallmentPaise: 1000000,
        startDate: '2026-05-10',
        tenureMonths: 24,
        interestRate: 7.1,
      },
    });

    // Run backfill migration 1st time
    await backfillRDAccounts();

    const [afterBackfill1] = await db.select().from(finAccounts).where(eq(finAccounts.id, rd1.id));
    const meta1 = (afterBackfill1.metadata ?? {}) as Record<string, unknown>;
    expect(meta1.installmentDay).toBe(18); // day of 2026-08-18
    expect(meta1.firstInstallmentOn).toBe('start_date');
    expect(meta1.installmentDayHistory).toEqual([{ effectiveFrom: '2026-08', day: 18 }]);

    const [afterBackfill2] = await db.select().from(finAccounts).where(eq(finAccounts.id, rd2.id));
    const meta2 = (afterBackfill2.metadata ?? {}) as Record<string, unknown>;
    expect(meta2.installmentDay).toBe(10); // day of 2026-05-10
    expect(meta2.firstInstallmentOn).toBe('start_date');

    // Run backfill migration 2nd time (idempotent)
    await backfillRDAccounts();

    const [afterBackfillAgain] = await db.select().from(finAccounts).where(eq(finAccounts.id, rd1.id));
    const metaAgain = (afterBackfillAgain.metadata ?? {}) as Record<string, unknown>;
    expect(metaAgain.installmentDayHistory).toEqual([
      { effectiveFrom: '2026-08', day: 18 },
    ]);
  });
});
