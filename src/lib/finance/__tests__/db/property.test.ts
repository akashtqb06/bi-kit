import { beforeEach, describe, expect, it } from 'vitest';
import { setupFinanceTestDb, USER_A } from './test-helper';
import type { DbFinanceService } from '../../db-service';

describe('Finance Service Invariants & Property Tests', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  it('Property: Transfers between accounts net to zero total asset change', async () => {
    const bank1 = await service.createAccount(USER_A, { name: 'Bank 1', kind: 'bank' });
    const bank2 = await service.createAccount(USER_A, { name: 'Bank 2', kind: 'bank' });

    // Initial income into Bank 1
    await service.createTransaction(USER_A, {
      accountId: bank1.id,
      type: 'income',
      amount: 10000000,
      date: '2026-01-01',
    });

    const initialStats = await service.getOverviewStats(USER_A);
    expect(initialStats.totalAssets).toBe(10000000);
    expect(initialStats.netWorth).toBe(10000000);

    // Multiple transfers back and forth
    await service.createTransaction(USER_A, {
      accountId: bank1.id,
      toAccountId: bank2.id,
      type: 'transfer',
      amount: 4000000,
      date: '2026-01-02',
    });

    await service.createTransaction(USER_A, {
      accountId: bank2.id,
      toAccountId: bank1.id,
      type: 'transfer',
      amount: 1500000,
      date: '2026-01-03',
    });

    await service.createTransaction(USER_A, {
      accountId: bank1.id,
      toAccountId: bank2.id,
      type: 'transfer',
      amount: 500000,
      date: '2026-01-04',
    });

    const postTransferStats = await service.getOverviewStats(USER_A);
    // Transfers must have net zero effect on total assets and net worth
    expect(postTransferStats.totalAssets).toBe(initialStats.totalAssets);
    expect(postTransferStats.netWorth).toBe(initialStats.netWorth);
  });

  it('Property: Transfer from bank account to investment account preserves total assets and net worth', async () => {
    const bank = await service.createAccount(USER_A, { name: 'Savings Account', kind: 'bank' });
    const mf = await service.createAccount(USER_A, {
      name: 'Groww Mutual Funds',
      kind: 'mutual_fund',
      metadata: { openingContributionPaise: 28000000 },
    });

    // Seed bank with income: 100,000 INR
    await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'income',
      amount: 10000000,
      date: '2026-11-01',
    });

    // Opening valuation on Groww: 350,000 INR value, 280,000 INR costBasis
    await service.createValuation(USER_A, {
      accountId: mf.id,
      date: '2026-11-01',
      value: 35000000,
      costBasis: 28000000,
      note: 'Opening valuation recorded during setup',
    });

    const beforeTransferStats = await service.getOverviewStats(USER_A);
    // Total assets: Bank (10,000,000) + Groww (35,000,000) = 45,000,000 paise (₹450,000)
    expect(beforeTransferStats.totalAssets).toBe(45000000);
    expect(beforeTransferStats.netWorth).toBe(45000000);

    // Transfer ₹50,000 from Savings account to Groww Mutual Funds
    await service.createTransaction(USER_A, {
      accountId: bank.id,
      toAccountId: mf.id,
      type: 'transfer',
      amount: 5000000,
      date: '2026-11-03',
    });

    const afterTransferStats = await service.getOverviewStats(USER_A);
    // Assets and net worth MUST be preserved (transfers net to zero total asset change)
    expect(afterTransferStats.totalAssets).toBe(45000000);
    expect(afterTransferStats.netWorth).toBe(45000000);
  });

  it('Property: Sum of all balance changes equals total income minus total expense', async () => {
    const bank = await service.createAccount(USER_A, { name: 'Bank', kind: 'bank' });
    const cash = await service.createAccount(USER_A, { name: 'Cash', kind: 'cash' });

    let totalIncome = 0;
    let totalExpense = 0;

    // Series of transactions
    const txData = [
      { acc: bank.id, type: 'income' as const, amt: 500000 },
      { acc: bank.id, type: 'expense' as const, amt: 120000 },
      { acc: cash.id, type: 'income' as const, amt: 80000 },
      { acc: cash.id, type: 'expense' as const, amt: 35000 },
      { acc: bank.id, toAcc: cash.id, type: 'transfer' as const, amt: 100000 },
      { acc: bank.id, type: 'expense' as const, amt: 45000 },
      { acc: cash.id, type: 'expense' as const, amt: 15000 },
    ];

    for (let i = 0; i < txData.length; i++) {
      const item = txData[i];
      if (item.type === 'income') totalIncome += item.amt;
      if (item.type === 'expense') totalExpense += item.amt;

      await service.createTransaction(USER_A, {
        accountId: item.acc,
        toAccountId: 'toAcc' in item ? (item as { toAcc?: string }).toAcc : undefined,
        type: item.type,
        amount: item.amt,
        date: `2026-01-0${i + 1}`,
      });
    }

    const stats = await service.getOverviewStats(USER_A);
    const expectedNetAssets = totalIncome - totalExpense;

    expect(stats.totalAssets).toBe(expectedNetAssets);
    expect(stats.netWorth).toBe(expectedNetAssets);
  });

  it('Property: Deleting then re-adding a transaction strictly restores balances', async () => {
    const bank = await service.createAccount(USER_A, { name: 'Audit Bank', kind: 'bank' });

    await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'income',
      amount: 1000000,
      date: '2026-01-01',
    });

    const baselineStats = await service.getOverviewStats(USER_A);

    const expense = await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'expense',
      amount: 250000,
      date: '2026-01-02',
    });

    const statsWithExpense = await service.getOverviewStats(USER_A);
    expect(statsWithExpense.totalAssets).toBe(baselineStats.totalAssets - 250000);

    // Delete the transaction
    await service.deleteTransaction(USER_A, expense.id);

    const statsAfterDelete = await service.getOverviewStats(USER_A);
    expect(statsAfterDelete.totalAssets).toBe(baselineStats.totalAssets);
    expect(statsAfterDelete.netWorth).toBe(baselineStats.netWorth);

    // Re-add equivalent transaction
    await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'expense',
      amount: 250000,
      date: '2026-01-02',
    });

    const statsRestored = await service.getOverviewStats(USER_A);
    expect(statsRestored.totalAssets).toBe(statsWithExpense.totalAssets);
    expect(statsRestored.netWorth).toBe(statsWithExpense.netWorth);
  });
});
