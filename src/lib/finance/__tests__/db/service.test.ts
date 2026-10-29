import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError, ForbiddenError } from '@src/app/api/utils';
import { setupFinanceTestDb, USER_A } from './test-helper';
import type { DbFinanceService } from '../../db-service';

describe('DbFinanceService Integration Tests on PGlite', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  describe('Accounts CRUD & Life Cycle', () => {
    it('creates, reads, updates and filters accounts', async () => {
      const bank = await service.createAccount(USER_A, {
        name: 'HDFC Bank',
        kind: 'bank',
        currency: 'INR',
      });

      expect(bank.id).toBeDefined();
      expect(bank.name).toBe('HDFC Bank');
      expect(bank.kind).toBe('bank');
      expect(bank.class).toBe('asset');
      expect(bank.currency).toBe('INR');
      expect(bank.isActive).toBe(true);

      const card = await service.createAccount(USER_A, {
        name: 'Infinia Card',
        kind: 'credit_card',
        creditLimit: 10000000, // 100,000 INR
      });

      expect(card.class).toBe('liability');
      expect(card.creditLimit).toBe(10000000);

      // Get account
      const fetched = await service.getAccount(USER_A, bank.id);
      expect(fetched.name).toBe('HDFC Bank');

      // Update account
      const updated = await service.updateAccount(USER_A, bank.id, {
        name: 'HDFC Salary Bank',
      });
      expect(updated.name).toBe('HDFC Salary Bank');

      // Filter accounts by class
      const assets = await service.listAccounts(USER_A, { class: 'asset' });
      expect(assets.length).toBe(1);
      expect(assets[0].id).toBe(bank.id);

      const liabilities = await service.listAccounts(USER_A, { class: 'liability' });
      expect(liabilities.length).toBe(1);
      expect(liabilities[0].id).toBe(card.id);

      // Delete unused account -> hard deleted
      await service.deleteAccount(USER_A, card.id);
      await expect(service.getAccount(USER_A, card.id)).rejects.toThrow(NotFoundError);
    });

    it('archives account instead of deleting when transactions exist', async () => {
      const bank = await service.createAccount(USER_A, {
        name: 'SBI Checking',
        kind: 'bank',
      });

      // Add a transaction
      await service.createTransaction(USER_A, {
        accountId: bank.id,
        type: 'income',
        amount: 50000,
        date: '2026-01-01',
      });

      // Attempt deletion
      await service.deleteAccount(USER_A, bank.id);

      // Account should still exist but marked isActive = false
      const accountAfter = await service.getAccount(USER_A, bank.id);
      expect(accountAfter.isActive).toBe(false);

      // Should not appear in active-only list
      const activeList = await service.listAccounts(USER_A, { isActive: true });
      expect(activeList.some((a) => a.id === bank.id)).toBe(false);

      const allList = await service.listAccounts(USER_A);
      expect(allList.some((a) => a.id === bank.id)).toBe(true);
    });
  });

  describe('Categories CRUD', () => {
    it('lists system categories and manages custom user categories', async () => {
      const list = await service.listCategories(USER_A);
      expect(list.length).toBeGreaterThanOrEqual(20);
      const food = list.find((c) => c.name === 'Food & Dining');
      expect(food?.isSystem).toBe(true);

      // System categories cannot be modified or deleted
      if (food) {
        await expect(
          service.updateCategory(USER_A, food.id, { name: 'Food Edited' })
        ).rejects.toThrow(ForbiddenError);

        await expect(service.deleteCategory(USER_A, food.id)).rejects.toThrow(
          ForbiddenError
        );
      }

      // Create custom user category
      const customParent = await service.createCategory(USER_A, {
        name: 'Hobbies',
        type: 'expense',
      });
      expect(customParent.isSystem).toBe(false);

      const customSub = await service.createCategory(USER_A, {
        name: 'Photography',
        type: 'expense',
        parentId: customParent.id,
      });
      expect(customSub.parentId).toBe(customParent.id);

      // Delete parent unlinks child parentId
      await service.deleteCategory(USER_A, customParent.id);
      const subAfter = await service.getCategory(USER_A, customSub.id);
      expect(subAfter.parentId).toBeNull();
    });
  });

  describe('Transactions CRUD, Idempotency & Transfers', () => {
    it('manages income, expense, transfers and clientRequestId idempotency', async () => {
      const bank1 = await service.createAccount(USER_A, {
        name: 'Primary Bank',
        kind: 'bank',
      });
      const bank2 = await service.createAccount(USER_A, {
        name: 'Secondary Bank',
        kind: 'bank',
      });

      // Income transaction
      const salary = await service.createTransaction(USER_A, {
        accountId: bank1.id,
        type: 'income',
        amount: 20000000, // 200,000 INR
        date: '2026-02-01',
        payee: 'Employer Corp',
        note: 'February Salary',
        clientRequestId: 'req_salary_feb_2026',
      });

      expect(salary.signedAmount).toBe(20000000);
      expect(salary.type).toBe('income');

      // Idempotent retry with same clientRequestId returns existing record
      const salaryRetry = await service.createTransaction(USER_A, {
        accountId: bank1.id,
        type: 'income',
        amount: 20000000,
        date: '2026-02-01',
        clientRequestId: 'req_salary_feb_2026',
      });
      expect(salaryRetry.id).toBe(salary.id);

      // Expense transaction
      const grocery = await service.createTransaction(USER_A, {
        accountId: bank1.id,
        type: 'expense',
        amount: 450000,
        date: '2026-02-05',
        payee: 'Supermarket',
        note: 'Weekly essentials',
      });
      expect(grocery.signedAmount).toBe(-450000);

      // Transfer transaction
      const transfer = await service.createTransaction(USER_A, {
        accountId: bank1.id,
        toAccountId: bank2.id,
        type: 'transfer',
        amount: 5000000,
        date: '2026-02-10',
        note: 'Savings transfer',
      });
      expect(transfer.type).toBe('transfer');
      expect(transfer.toAccountId).toBe(bank2.id);

      // Transfer to self fails
      await expect(
        service.createTransaction(USER_A, {
          accountId: bank1.id,
          toAccountId: bank1.id,
          type: 'transfer',
          amount: 1000,
          date: '2026-02-10',
        })
      ).rejects.toThrow();

      // List transactions with search filter
      const searchRes = await service.listTransactions(USER_A, {
        search: 'Supermarket',
        limit: 50,
      });
      expect(searchRes.transactions.length).toBe(1);
      expect(searchRes.transactions[0].id).toBe(grocery.id);

      // Cursor pagination
      const page1 = await service.listTransactions(USER_A, { limit: '2' as unknown as number });
      expect(page1.transactions.length).toBe(2);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      if (page1.nextCursor) {
        const page2 = await service.listTransactions(USER_A, {
          cursor: page1.nextCursor,
          limit: '2' as unknown as number,
        });
        expect(page2.transactions.length).toBe(1);
        expect(page2.hasMore).toBe(false);
      }

      // Soft delete
      await service.deleteTransaction(USER_A, grocery.id);
      await expect(service.getTransaction(USER_A, grocery.id)).rejects.toThrow(NotFoundError);

      // Excluded from transaction list
      const listAfter = await service.listTransactions(USER_A);
      expect(listAfter.transactions.some((t) => t.id === grocery.id)).toBe(false);
    });

    it('supports bulk update and bulk delete in a transaction', async () => {
      const bank = await service.createAccount(USER_A, {
        name: 'Bulk Bank',
        kind: 'bank',
      });

      const t1 = await service.createTransaction(USER_A, {
        accountId: bank.id,
        type: 'expense',
        amount: 1000,
        date: '2026-01-01',
      });
      const t2 = await service.createTransaction(USER_A, {
        accountId: bank.id,
        type: 'expense',
        amount: 2000,
        date: '2026-01-02',
      });

      // Bulk update notes
      await service.bulkUpdateTransactions(USER_A, [t1.id, t2.id], {
        note: 'Bulk updated note',
      });

      const updatedT1 = await service.getTransaction(USER_A, t1.id);
      expect(updatedT1.note).toBe('Bulk updated note');

      // Bulk delete
      const deletedCount = await service.bulkDeleteTransactions(USER_A, [t1.id, t2.id]);
      expect(deletedCount).toBe(2);

      await expect(service.getTransaction(USER_A, t1.id)).rejects.toThrow(NotFoundError);
      await expect(service.getTransaction(USER_A, t2.id)).rejects.toThrow(NotFoundError);
    });
  });

  describe('Valuations & Deposit Auto-Recomputation', () => {
    it('upserts manual valuations and computes FD valuations without overwriting', async () => {
      const fd = await service.createAccount(USER_A, {
        name: 'HDFC FD 1 Year',
        kind: 'fixed_deposit',
        metadata: {
          principal: 10000000, // 100,000 INR
          interestRate: 0.08,
          compoundingFrequency: 'quarterly',
          startDate: '2025-01-01',
          tenureMonths: 12,
        },
      });

      // Manual valuation on 2025-06-01
      const manualVal = await service.createValuation(USER_A, {
        accountId: fd.id,
        date: '2025-06-01',
        value: 10400000,
        note: 'Manual bank certificate valuation',
      });

      expect(manualVal.value).toBe(10400000);

      // Recompute deposit valuations
      const recomputeRes = await service.recomputeDepositValuations(USER_A, fd.id);
      expect(recomputeRes.valuationsWritten).toBeGreaterThanOrEqual(1);

      // List valuations
      const vals = await service.listValuations(USER_A, { accountId: fd.id });
      expect(vals.length).toBeGreaterThanOrEqual(2);

      // Ensure manual valuation was preserved
      const manualFound = vals.find((v) => v.date === '2025-06-01');
      expect(manualFound?.value).toBe(10400000);
      expect(manualFound?.note).toBe('Manual bank certificate valuation');
    });
  });

  describe('Budgets & Progress', () => {
    it('creates budget and calculates live category spend progress', async () => {
      const cats = await service.listCategories(USER_A, { type: 'expense' });
      const foodCat = cats.find((c) => c.name === 'Food & Dining') || cats[0];

      const bank = await service.createAccount(USER_A, {
        name: 'Budget Test Bank',
        kind: 'bank',
      });

      // Create budget for 25,000 INR (2,500,000 paise)
      const budget = await service.createBudget(USER_A, {
        categoryId: foodCat.id,
        amount: 2500000,
        period: 'monthly',
        startDate: '2026-01-01',
      });

      expect(budget.amount).toBe(2500000);

      // Record an expense in the category today
      const today = new Date().toISOString().slice(0, 10);
      await service.createTransaction(USER_A, {
        accountId: bank.id,
        categoryId: foodCat.id,
        type: 'expense',
        amount: 500000, // 5,000 INR
        date: today,
      });

      // Fetch budgets with progress
      const result = await service.listBudgets(USER_A);
      expect(result.budgets.length).toBe(1);
      expect(result.progress.length).toBe(1);

      const prog = result.progress[0];
      expect(prog.budgetedAmount).toBe(2500000);
      expect(prog.spentAmount).toBe(500000);
      expect(prog.remainingAmount).toBe(2000000);
      expect(prog.percentageUsed).toBe(20.0);
    });
  });

  describe('Recurring Rules Execution', () => {
    it('creates, advances and materializes recurring transactions', async () => {
      const bank = await service.createAccount(USER_A, {
        name: 'Recurring Bank',
        kind: 'bank',
      });

      const today = new Date().toISOString().slice(0, 10);

      const rule = await service.createRecurringRule(USER_A, {
        accountId: bank.id,
        type: 'expense',
        amount: 99900,
        frequency: 'monthly',
        interval: 1,
        startDate: today,
        nextOccurrence: today,
        payee: 'Streaming Sub',
      });

      expect(rule.isActive).toBe(true);
      expect(rule.nextOccurrence).toBe(today);

      // Process recurring rules
      const processRes = await service.processRecurringRules();
      expect(processRes.generated).toBeGreaterThanOrEqual(1);

      // Verify transaction was materialized
      const txs = await service.listTransactions(USER_A);
      const generatedTx = txs.transactions.find((t) => t.recurringRuleId === rule.id);
      expect(generatedTx).toBeDefined();
      expect(generatedTx?.amount).toBe(99900);
      expect(generatedTx?.isRecurring).toBe(true);

      // Verify next occurrence was advanced
      const ruleAfter = await service.getRecurringRule(USER_A, rule.id);
      expect(ruleAfter.nextOccurrence > today).toBe(true);
    });
  });

  describe('Overview Stats & Net Worth History', () => {
    it('computes overview metrics, net worth and historical timeline in SQL', async () => {
      const bank = await service.createAccount(USER_A, {
        name: 'Salary Bank',
        kind: 'bank',
      });

      const card = await service.createAccount(USER_A, {
        name: 'Amazon ICICI',
        kind: 'credit_card',
        creditLimit: 5000000,
      });

      const today = new Date().toISOString().slice(0, 10);

      // Income: 100,000 INR
      await service.createTransaction(USER_A, {
        accountId: bank.id,
        type: 'income',
        amount: 10000000,
        date: today,
      });

      // Credit card expense: 20,000 INR
      await service.createTransaction(USER_A, {
        accountId: card.id,
        type: 'expense',
        amount: 2000000,
        date: today,
      });

      const overview = await service.getOverviewStats(USER_A);
      expect(overview.totalAssets).toBe(10000000);
      expect(overview.totalLiabilities).toBe(2000000);
      expect(overview.netWorth).toBe(8000000);
      expect(overview.monthlyIncome).toBe(10000000);
      expect(overview.monthlyExpense).toBe(2000000);
      expect(overview.savingsRate).toBe(80.0);

      // Net worth history query
      const history = await service.getNetWorthHistory(USER_A, {
        startDate: today,
        endDate: today,
        interval: 'daily',
      });

      expect(history.length).toBe(1);
      expect(history[0].date).toBe(today);
      expect(history[0].assets).toBe(10000000);
      expect(history[0].liabilities).toBe(2000000);
      expect(history[0].netWorth).toBe(8000000);
    });
  });
});
