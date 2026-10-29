import { describe, expect, it } from 'vitest';
import type { BudgetDTO, CategoryDTO, TransactionDTO } from '../../contract';
import {
  calculateBudgetProgress,
  calculateCategorySpend,
  calculateTotalBudgetSummary,
  computeCategoryRollovers,
  formatMonthLabel,
  getMonthDateRange,
  getNextMonthString,
  getPreviousMonthString,
  planCopyLastMonthBudgets,
} from '../progress';
import { getBudgetProgressVirtualTableTemplate } from '../virtual-table-template';

describe('Budgets Progress & Calculation Domain Tests (S6b)', () => {
  const dummyCategory: CategoryDTO = {
    id: 'cat-groceries',
    userId: 'user-1',
    name: 'Groceries',
    type: 'expense',
    isSystem: false,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const dummyBudget: BudgetDTO = {
    id: 'bgt-groceries-oct',
    userId: 'user-1',
    categoryId: 'cat-groceries',
    amount: 1000000, // ₹10,000 in paise
    period: 'monthly',
    startDate: '2026-10-01',
    endDate: '2026-10-31',
    createdAt: '2026-10-01T00:00:00Z',
    updatedAt: '2026-10-01T00:00:00Z',
  };

  const createTxn = (overrides: Partial<TransactionDTO>): TransactionDTO => ({
    id: `txn-${Math.random().toString(36).substring(2, 8)}`,
    userId: 'user-1',
    accountId: 'acc-hdfc',
    toAccountId: null,
    categoryId: 'cat-groceries',
    date: '2026-10-15',
    type: 'expense',
    amount: 200000, // ₹2,000
    signedAmount: -200000,
    payee: 'Supermarket',
    note: null,
    tags: null,
    clientRequestId: null,
    importHash: null,
    isRecurring: false,
    recurringRuleId: null,
    deletedAt: null,
    createdAt: '2026-10-15T10:00:00Z',
    updatedAt: '2026-10-15T10:00:00Z',
    ...overrides,
  });

  describe('Month navigation and date ranges', () => {
    it('computes correct date boundaries for standard and leap years', () => {
      expect(getMonthDateRange('2026-10')).toEqual({
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      // Leap year Feb
      expect(getMonthDateRange('2024-02')).toEqual({
        startDate: '2024-02-01',
        endDate: '2024-02-29',
      });

      // Non-leap year Feb
      expect(getMonthDateRange('2026-02')).toEqual({
        startDate: '2026-02-01',
        endDate: '2026-02-28',
      });
    });

    it('navigates previous and next months across year boundaries', () => {
      expect(getPreviousMonthString('2026-01')).toBe('2025-12');
      expect(getPreviousMonthString('2026-10')).toBe('2026-09');

      expect(getNextMonthString('2026-12')).toBe('2027-01');
      expect(getNextMonthString('2026-09')).toBe('2026-10');
    });

    it('formats month labels properly', () => {
      expect(formatMonthLabel('2026-10')).toBe('October 2026');
      expect(formatMonthLabel('2026-01')).toBe('January 2026');
    });
  });

  describe('Spending calculations, refunds, and transfer rules', () => {
    it('correctly tracks basic expense transactions', () => {
      const txns = [
        createTxn({ amount: 250000 }), // ₹2,500
        createTxn({ amount: 150000 }), // ₹1,500
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(spend.spentAmount).toBe(400000); // ₹4,000
      expect(spend.expenseAmount).toBe(400000);
      expect(spend.refundAmount).toBe(0);
      expect(spend.transactionCount).toBe(2);
    });

    it('deducts refunds credited to the category from total spend', () => {
      const txns = [
        createTxn({ amount: 500000, type: 'expense' }), // ₹5,000 spent
        createTxn({ amount: 150000, type: 'income', payee: 'Refund from Merchant' }), // ₹1,500 refund
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(spend.expenseAmount).toBe(500000);
      expect(spend.refundAmount).toBe(150000);
      expect(spend.spentAmount).toBe(350000); // ₹5,000 - ₹1,500 = ₹3,500
      expect(spend.transactionCount).toBe(2);
    });

    it('clamps net spend to 0 when refunds exceed expenses', () => {
      const txns = [
        createTxn({ amount: 200000, type: 'expense' }), // ₹2,000 spent
        createTxn({ amount: 300000, type: 'income' }), // ₹3,000 refund
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(spend.expenseAmount).toBe(200000);
      expect(spend.refundAmount).toBe(300000);
      expect(spend.spentAmount).toBe(0); // non-negative net spend
    });

    it('STRICTLY NEVER counts transfer transactions toward budget spend', () => {
      const txns = [
        createTxn({ amount: 200000, type: 'expense' }), // ₹2,000
        createTxn({
          amount: 5000000, // ₹50,000
          type: 'transfer',
          toAccountId: 'acc-credit-card',
          note: 'Credit card payment for groceries',
        }),
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      // The ₹50,000 transfer MUST NOT count!
      expect(spend.spentAmount).toBe(200000);
      expect(spend.transactionCount).toBe(1);
    });

    it('STRICTLY excludes soft-deleted transactions', () => {
      const txns = [
        createTxn({ amount: 200000, type: 'expense' }),
        createTxn({
          amount: 800000,
          type: 'expense',
          deletedAt: '2026-10-16T12:00:00Z',
        }),
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(spend.spentAmount).toBe(200000);
      expect(spend.transactionCount).toBe(1);
    });

    it('does not count adjustment transactions as category expense', () => {
      const txns = [
        createTxn({ amount: 200000, type: 'expense' }),
        createTxn({ amount: 100000, type: 'adjustment' }),
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(spend.spentAmount).toBe(200000);
      expect(spend.transactionCount).toBe(1);
    });

    it('enforces month date boundaries and prevents leaks from prior/subsequent months', () => {
      const txns = [
        createTxn({ amount: 100000, date: '2026-09-30' }), // prior month
        createTxn({ amount: 250000, date: '2026-10-01' }), // first day
        createTxn({ amount: 350000, date: '2026-10-31' }), // last day
        createTxn({ amount: 400000, date: '2026-11-01' }), // next month
      ];

      const spend = calculateCategorySpend({
        categoryId: 'cat-groceries',
        transactions: txns,
        startDate: '2026-10-01',
        endDate: '2026-10-31',
      });

      expect(spend.spentAmount).toBe(600000); // 250k + 350k
      expect(spend.transactionCount).toBe(2);
    });
  });

  describe('Budget progress & threshold alerts', () => {
    it('reports normal "ok" status when spending is below 80%', () => {
      const txns = [createTxn({ amount: 500000 })]; // 50% of ₹10,000

      const progress = calculateBudgetProgress({
        budget: dummyBudget,
        categoryName: dummyCategory.name,
        transactions: txns,
        monthStr: '2026-10',
      });

      expect(progress.budgetedAmount).toBe(1000000);
      expect(progress.spentAmount).toBe(500000);
      expect(progress.remainingAmount).toBe(500000);
      expect(progress.overspentAmount).toBe(0);
      expect(progress.percentageUsed).toBe(50);
      expect(progress.status).toBe('ok');
      expect(progress.isNearLimit).toBe(false);
      expect(progress.isOverBudget).toBe(false);
    });

    it('triggers "warning" status when spending is >= 80% and <= 100%', () => {
      // Exactly 80%
      const txns80 = [createTxn({ amount: 800000 })];
      const prog80 = calculateBudgetProgress({
        budget: dummyBudget,
        categoryName: dummyCategory.name,
        transactions: txns80,
        monthStr: '2026-10',
      });
      expect(prog80.percentageUsed).toBe(80);
      expect(prog80.status).toBe('warning');
      expect(prog80.isNearLimit).toBe(true);
      expect(prog80.isOverBudget).toBe(false);

      // 95%
      const txns95 = [createTxn({ amount: 950000 })];
      const prog95 = calculateBudgetProgress({
        budget: dummyBudget,
        categoryName: dummyCategory.name,
        transactions: txns95,
        monthStr: '2026-10',
      });
      expect(prog95.percentageUsed).toBe(95);
      expect(prog95.status).toBe('warning');
      expect(prog95.isNearLimit).toBe(true);
      expect(prog95.isOverBudget).toBe(false);
      expect(prog95.remainingAmount).toBe(50000);
    });

    it('triggers "over_budget" status when spending exceeds 100%', () => {
      const txns = [createTxn({ amount: 1200000 })]; // ₹12,000 spent against ₹10,000 budget

      const progress = calculateBudgetProgress({
        budget: dummyBudget,
        categoryName: dummyCategory.name,
        transactions: txns,
        monthStr: '2026-10',
      });

      expect(progress.spentAmount).toBe(1200000);
      expect(progress.remainingAmount).toBe(0);
      expect(progress.overspentAmount).toBe(200000); // ₹2,000 over
      expect(progress.percentageUsed).toBe(120);
      expect(progress.status).toBe('over_budget');
      expect(progress.isOverBudget).toBe(true);
      expect(progress.isNearLimit).toBe(false);
    });
  });

  describe('Rollover calculations', () => {
    it('rolls over positive surplus from prior month when enabled', () => {
      // Prior month (September) had ₹10,000 budget and ₹7,000 spent -> ₹3,000 surplus
      const prevBudget: BudgetDTO = {
        ...dummyBudget,
        id: 'bgt-groceries-sep',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      };
      const prevTxn = createTxn({ amount: 700000, date: '2026-09-15' });

      const rollovers = computeCategoryRollovers({
        categoryBudgets: [prevBudget],
        transactions: [prevTxn],
        currentMonth: '2026-10',
        options: { enabled: true, allowDeficits: true },
      });

      expect(rollovers.get('cat-groceries')).toBe(300000); // ₹3,000 surplus

      // Progress with rollover applied:
      // Base: ₹10,000 + Rollover ₹3,000 = Effective: ₹13,000
      const currentTxns = [createTxn({ amount: 1100000, date: '2026-10-10' })]; // ₹11,000 spent

      const progress = calculateBudgetProgress({
        budget: dummyBudget,
        categoryName: dummyCategory.name,
        transactions: currentTxns,
        monthStr: '2026-10',
        rolloverAmount: rollovers.get('cat-groceries') || 0,
        rolloverEnabled: true,
      });

      expect(progress.budgetedAmount).toBe(1000000);
      expect(progress.rolloverAmount).toBe(300000);
      expect(progress.effectiveBudget).toBe(1300000);
      expect(progress.spentAmount).toBe(1100000);
      expect(progress.remainingAmount).toBe(200000); // Still has ₹2,000 remaining!
      expect(progress.isOverBudget).toBe(false); // Would have been over budget without rollover
      expect(progress.status).toBe('warning'); // 11000/13000 = 84.6%
    });

    it('handles deficit rollover when allowDeficits is true', () => {
      // September: ₹10,000 budget, ₹12,000 spent -> -₹2,000 deficit
      const prevBudget: BudgetDTO = {
        ...dummyBudget,
        id: 'bgt-groceries-sep',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      };
      const prevTxn = createTxn({ amount: 1200000, date: '2026-09-15' });

      const rollovers = computeCategoryRollovers({
        categoryBudgets: [prevBudget],
        transactions: [prevTxn],
        currentMonth: '2026-10',
        options: { enabled: true, allowDeficits: true },
      });

      expect(rollovers.get('cat-groceries')).toBe(-200000); // ₹2,000 deficit

      // Effective budget reduced from ₹10,000 to ₹8,000
      const progress = calculateBudgetProgress({
        budget: dummyBudget,
        categoryName: dummyCategory.name,
        transactions: [createTxn({ amount: 750000, date: '2026-10-10' })],
        monthStr: '2026-10',
        rolloverAmount: rollovers.get('cat-groceries') || 0,
        rolloverEnabled: true,
      });

      expect(progress.effectiveBudget).toBe(800000);
      expect(progress.spentAmount).toBe(750000);
      expect(progress.percentageUsed).toBe(93.75); // 750k / 800k = 93.75%
      expect(progress.status).toBe('warning');
    });

    it('clamps negative deficit to 0 when allowDeficits is false', () => {
      const prevBudget: BudgetDTO = {
        ...dummyBudget,
        id: 'bgt-groceries-sep',
        startDate: '2026-09-01',
        endDate: '2026-09-30',
      };
      const prevTxn = createTxn({ amount: 1200000, date: '2026-09-15' });

      const rollovers = computeCategoryRollovers({
        categoryBudgets: [prevBudget],
        transactions: [prevTxn],
        currentMonth: '2026-10',
        options: { enabled: true, allowDeficits: false },
      });

      expect(rollovers.get('cat-groceries')).toBe(0);
    });
  });

  describe('Total budget summary', () => {
    it('aggregates across multiple categories and summarizes alert counts', () => {
      const items = [
        calculateBudgetProgress({
          budget: { ...dummyBudget, id: 'b1', categoryId: 'c1', amount: 100000 },
          categoryName: 'Cat 1',
          transactions: [createTxn({ categoryId: 'c1', amount: 50000 })], // 50% (ok)
          monthStr: '2026-10',
        }),
        calculateBudgetProgress({
          budget: { ...dummyBudget, id: 'b2', categoryId: 'c2', amount: 100000 },
          categoryName: 'Cat 2',
          transactions: [createTxn({ categoryId: 'c2', amount: 85000 })], // 85% (warning)
          monthStr: '2026-10',
        }),
        calculateBudgetProgress({
          budget: { ...dummyBudget, id: 'b3', categoryId: 'c3', amount: 100000 },
          categoryName: 'Cat 3',
          transactions: [createTxn({ categoryId: 'c3', amount: 120000 })], // 120% (over)
          monthStr: '2026-10',
        }),
      ];

      const summary = calculateTotalBudgetSummary({
        month: '2026-10',
        items,
      });

      expect(summary.totalBudgeted).toBe(300000);
      expect(summary.totalEffectiveBudget).toBe(300000);
      expect(summary.totalSpent).toBe(255000); // 50k + 85k + 120k
      expect(summary.totalRemaining).toBe(65000); // 50k + 15k + 0
      expect(summary.totalOverspent).toBe(20000); // 0 + 0 + 20k
      expect(summary.percentageUsed).toBe(85);
      expect(summary.status).toBe('warning');
      expect(summary.totalBudgetsCount).toBe(3);
      expect(summary.onTrackCount).toBe(1);
      expect(summary.warningCount).toBe(1);
      expect(summary.overBudgetCount).toBe(1);
    });
  });

  describe('Copy last month budgets plan', () => {
    it('finds budgets from prior month that are absent in current month', () => {
      const categories: CategoryDTO[] = [
        { id: 'c-food', userId: 'u1', name: 'Food', type: 'expense', isSystem: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'c-fuel', userId: 'u1', name: 'Fuel', type: 'expense', isSystem: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
        { id: 'c-rent', userId: 'u1', name: 'Rent', type: 'expense', isSystem: false, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ];

      const allBudgets: BudgetDTO[] = [
        // Sep budgets (3 categories)
        { id: 'b-sep-food', userId: 'u1', categoryId: 'c-food', amount: 1500000, period: 'monthly', startDate: '2026-09-01', createdAt: '2026-09-01', updatedAt: '2026-09-01' },
        { id: 'b-sep-fuel', userId: 'u1', categoryId: 'c-fuel', amount: 500000, period: 'monthly', startDate: '2026-09-01', createdAt: '2026-09-01', updatedAt: '2026-09-01' },
        { id: 'b-sep-rent', userId: 'u1', categoryId: 'c-rent', amount: 3000000, period: 'monthly', startDate: '2026-09-01', createdAt: '2026-09-01', updatedAt: '2026-09-01' },
        // Oct budget already has food
        { id: 'b-oct-food', userId: 'u1', categoryId: 'c-food', amount: 1600000, period: 'monthly', startDate: '2026-10-01', createdAt: '2026-10-01', updatedAt: '2026-10-01' },
      ];

      const plan = planCopyLastMonthBudgets({
        allBudgets,
        categories,
        currentMonth: '2026-10',
      });

      expect(plan.canCopy).toBe(true);
      expect(plan.previousMonth).toBe('2026-09');
      expect(plan.candidates.length).toBe(2);
      expect(plan.candidates.map((c) => c.categoryName)).toEqual(['Fuel', 'Rent']);
      expect(plan.alreadyExistingCategoryIds).toEqual(['c-food']);
    });
  });

  describe('Virtual table template export', () => {
    it('produces SQL containing user scoping, soft-delete filtering, and refund handling', () => {
      const sql = getBudgetProgressVirtualTableTemplate('$1');
      expect(sql).toContain('fin_budgets');
      expect(sql).toContain('fin_transactions');
      expect(sql).toContain('WHERE b.user_id = $1');
      expect(sql).toContain('t.deleted_at IS NULL');
      expect(sql).toContain("type = 'expense'");
      expect(sql).toContain("type = 'income'");
      expect(sql).toContain('budgeted_amount');
      expect(sql).toContain('spent_amount');
      expect(sql).toContain('remaining_amount');
      expect(sql).toContain('percentage_used');
    });
  });
});
