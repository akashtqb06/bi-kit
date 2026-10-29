import { describe, it, expect, beforeEach } from 'vitest';
import { MockFinanceService } from './index';

describe('MockFinanceService Implementation', () => {
  let service: MockFinanceService;

  beforeEach(() => {
    service = new MockFinanceService('salaried-urban');
  });

  describe('Accounts', () => {
    it('lists all accounts for the persona', async () => {
      const accounts = await service.listAccounts('test_user');
      expect(accounts.length).toBeGreaterThan(5);

      const salaryAcc = accounts.find((a) => a.name === 'Salary Account');
      expect(salaryAcc).toBeDefined();
      expect(salaryAcc?.kind).toBe('bank');
      expect(salaryAcc?.class).toBe('asset');
    });

    it('filters accounts by class and kind', async () => {
      const liabilities = await service.listAccounts('test_user', { class: 'liability' });
      for (const a of liabilities) {
        expect(a.class).toBe('liability');
      }

      const banks = await service.listAccounts('test_user', { kind: 'bank' });
      for (const a of banks) {
        expect(a.kind).toBe('bank');
      }
    });

    it('creates, updates, and deletes an account', async () => {
      const created = await service.createAccount('test_user', {
        name: 'New ICICI Checking',
        kind: 'bank',
        currency: 'INR',
      });
      expect(created.name).toBe('New ICICI Checking');
      expect(created.class).toBe('asset');

      const updated = await service.updateAccount('test_user', created.id, {
        name: 'Updated Checking Name',
      });
      expect(updated.name).toBe('Updated Checking Name');

      await service.deleteAccount('test_user', created.id);
      const fetched = await service.getAccount('test_user', created.id);
      expect(fetched.isActive).toBe(false);
    });
  });

  describe('Transactions & Pagination', () => {
    it('lists transactions with limit and pagination cursor', async () => {
      const page1 = await service.listTransactions('test_user', { limit: 10 });
      expect(page1.transactions.length).toBe(10);
      expect(page1.hasMore).toBe(true);
      expect(page1.nextCursor).toBeDefined();

      const page2 = await service.listTransactions('test_user', {
        limit: 10,
        cursor: page1.nextCursor!,
      });
      expect(page2.transactions.length).toBe(10);
      // Ensure pages don't overlap
      const ids1 = new Set(page1.transactions.map((t) => t.id));
      for (const t of page2.transactions) {
        expect(ids1.has(t.id)).toBe(false);
      }
    });

    it('filters transactions by search string', async () => {
      const res = await service.listTransactions('test_user', { limit: 50, search: 'Salary' });
      expect(res.transactions.length).toBeGreaterThan(0);
      for (const t of res.transactions) {
        const matches =
          (t.payee && t.payee.toLowerCase().includes('salary')) ||
          (t.note && t.note.toLowerCase().includes('salary'));
        expect(matches).toBe(true);
      }
    });

    it('creates transaction idempotently with clientRequestId', async () => {
      const accounts = await service.listAccounts('test_user');
      const salaryAcc = accounts.find((a) => a.name === 'Salary Account')!;

      const payload = {
        accountId: salaryAcc.id,
        date: '2026-10-25',
        type: 'expense' as const,
        amount: 50000,
        payee: 'Test Coffee Shop',
        clientRequestId: 'req_unique_coffee_123',
      };

      const txn1 = await service.createTransaction('test_user', payload);
      const txn2 = await service.createTransaction('test_user', payload);

      // Same transaction returned
      expect(txn1.id).toBe(txn2.id);
    });

    it('soft deletes transaction and excludes it from list', async () => {
      const accounts = await service.listAccounts('test_user');
      const salaryAcc = accounts.find((a) => a.name === 'Salary Account')!;

      const created = await service.createTransaction('test_user', {
        accountId: salaryAcc.id,
        date: '2026-10-26',
        type: 'expense',
        amount: 30000,
        payee: 'To Delete Store',
      });

      await service.deleteTransaction('test_user', created.id);

      const list = await service.listTransactions('test_user');
      const found = list.transactions.find((t) => t.id === created.id);
      expect(found).toBeUndefined();
    });
  });

  describe('Overview Stats & Budgets', () => {
    it('computes positive net worth, monthly income, expense and savings rate', async () => {
      const stats = await service.getOverviewStats('test_user');
      expect(stats.netWorth).toBeGreaterThan(0);
      expect(stats.totalAssets).toBeGreaterThan(0);
      expect(stats.totalLiabilities).toBeGreaterThanOrEqual(0);
      expect(stats.netWorth).toBe(stats.totalAssets - stats.totalLiabilities);
      expect(stats.savingsRate).toBeGreaterThanOrEqual(0);
      expect(stats.savingsRate).toBeLessThanOrEqual(1);
    });

    it('lists budgets with computed spending progress', async () => {
      const { budgets, progress } = await service.listBudgets('test_user');
      expect(budgets.length).toBeGreaterThan(0);
      expect(progress.length).toBe(budgets.length);

      for (const p of progress) {
        expect(p.categoryName).toBeDefined();
        expect(p.budgetedAmount).toBeGreaterThan(0);
        expect(p.spentAmount).toBeGreaterThanOrEqual(0);
        expect(p.remainingAmount).toBe(Math.max(0, p.budgetedAmount - p.spentAmount));
      }
    });
  });

  describe('Recurring Rules', () => {
    it('processes due recurring transactions', async () => {
      const result = await service.processRecurringRules();
      expect(typeof result.processed).toBe('number');
      expect(typeof result.generated).toBe('number');
    });
  });
});
