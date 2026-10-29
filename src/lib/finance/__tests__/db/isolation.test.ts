import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '@src/app/api/utils';
import { setupFinanceTestDb, USER_A, USER_B } from './test-helper';
import type { DbFinanceService } from '../../db-service';

describe('Strict User Scoping & Tenant Isolation', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  it('prohibits User A from reading, modifying, or deleting User B accounts', async () => {
    const accB = await service.createAccount(USER_B, {
      name: "User B's Secret Bank",
      kind: 'bank',
    });

    // User A cannot get B's account
    await expect(service.getAccount(USER_A, accB.id)).rejects.toThrow(NotFoundError);

    // User A cannot update B's account
    await expect(
      service.updateAccount(USER_A, accB.id, { name: 'Hacked Name' })
    ).rejects.toThrow(NotFoundError);

    // User A cannot delete B's account
    await expect(service.deleteAccount(USER_A, accB.id)).rejects.toThrow(NotFoundError);

    // User A's list never includes B's account
    const listA = await service.listAccounts(USER_A);
    expect(listA.some((a) => a.id === accB.id)).toBe(false);
  });

  it('prohibits User A from reading, modifying, or deleting User B transactions', async () => {
    const accA = await service.createAccount(USER_A, { name: 'Bank A', kind: 'bank' });
    const accB = await service.createAccount(USER_B, { name: 'Bank B', kind: 'bank' });

    const txB = await service.createTransaction(USER_B, {
      accountId: accB.id,
      type: 'income',
      amount: 1000000,
      date: '2026-01-01',
      payee: 'Secret B Employer',
    });

    // User A cannot get B's transaction
    await expect(service.getTransaction(USER_A, txB.id)).rejects.toThrow(NotFoundError);

    // User A cannot update B's transaction
    await expect(
      service.updateTransaction(USER_A, txB.id, { amount: 500 })
    ).rejects.toThrow(NotFoundError);

    // User A cannot delete B's transaction
    await expect(service.deleteTransaction(USER_A, txB.id)).rejects.toThrow(NotFoundError);

    // User A's list never includes B's transaction
    const listA = await service.listTransactions(USER_A);
    expect(listA.transactions.some((t) => t.id === txB.id)).toBe(false);

    // User A cannot create a transaction on B's account
    await expect(
      service.createTransaction(USER_A, {
        accountId: accB.id,
        type: 'expense',
        amount: 500,
        date: '2026-01-02',
      })
    ).rejects.toThrow(NotFoundError);

    // User A cannot transfer funds to B's account
    await expect(
      service.createTransaction(USER_A, {
        accountId: accA.id,
        toAccountId: accB.id,
        type: 'transfer',
        amount: 500,
        date: '2026-01-02',
      })
    ).rejects.toThrow(NotFoundError);
  });

  it('prohibits User A from reading, modifying, or deleting User B categories', async () => {
    const catB = await service.createCategory(USER_B, {
      name: "User B's Private Category",
      type: 'expense',
    });

    await expect(service.getCategory(USER_A, catB.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateCategory(USER_A, catB.id, { name: 'Hacked Cat' })
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteCategory(USER_A, catB.id)).rejects.toThrow(NotFoundError);

    const listA = await service.listCategories(USER_A);
    expect(listA.some((c) => c.id === catB.id)).toBe(false);
  });

  it('prohibits User A from accessing User B valuations, budgets, and recurring rules', async () => {
    const accB = await service.createAccount(USER_B, { name: 'Bank B', kind: 'bank' });
    const catsB = await service.listCategories(USER_B);

    // Valuations
    await service.createValuation(USER_B, {
      accountId: accB.id,
      date: '2026-01-01',
      value: 500000,
    });
    await expect(
      service.listValuations(USER_A, { accountId: accB.id })
    ).rejects.toThrow(NotFoundError);
    await expect(
      service.createValuation(USER_A, {
        accountId: accB.id,
        date: '2026-01-02',
        value: 100000,
      })
    ).rejects.toThrow(NotFoundError);

    // Budgets
    const budgetB = await service.createBudget(USER_B, {
      categoryId: catsB[0].id,
      amount: 5000000,
      period: 'monthly',
      startDate: '2026-01-01',
    });
    await expect(service.getBudget(USER_A, budgetB.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateBudget(USER_A, budgetB.id, { amount: 1000 })
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteBudget(USER_A, budgetB.id)).rejects.toThrow(NotFoundError);

    const budgetsA = await service.listBudgets(USER_A);
    expect(budgetsA.budgets.some((b) => b.id === budgetB.id)).toBe(false);

    // Recurring rules
    const ruleB = await service.createRecurringRule(USER_B, {
      accountId: accB.id,
      type: 'expense',
      amount: 150000,
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-01-01',
    });
    await expect(service.getRecurringRule(USER_A, ruleB.id)).rejects.toThrow(NotFoundError);
    await expect(
      service.updateRecurringRule(USER_A, ruleB.id, { amount: 1000 })
    ).rejects.toThrow(NotFoundError);
    await expect(service.deleteRecurringRule(USER_A, ruleB.id)).rejects.toThrow(NotFoundError);

    const rulesA = await service.listRecurringRules(USER_A);
    expect(rulesA.some((r) => r.id === ruleB.id)).toBe(false);
  });

  it('keeps overview stats and net worth history completely isolated', async () => {
    const accB = await service.createAccount(USER_B, { name: 'Millionaire B', kind: 'bank' });
    await service.createTransaction(USER_B, {
      accountId: accB.id,
      type: 'income',
      amount: 1000000000, // 10 million INR
      date: '2026-01-01',
    });

    const statsA = await service.getOverviewStats(USER_A);
    expect(statsA.totalAssets).toBe(0);
    expect(statsA.netWorth).toBe(0);

    const historyA = await service.getNetWorthHistory(USER_A, {
      startDate: '2026-01-01',
      endDate: '2026-01-01',
      interval: 'daily',
    });
    expect(historyA[0]?.assets).toBe(0);
    expect(historyA[0]?.netWorth).toBe(0);
  });
});
