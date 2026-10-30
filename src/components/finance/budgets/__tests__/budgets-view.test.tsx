import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { BudgetsView } from '../budgets-view';
import { BudgetForm } from '../budget-dialog';
import { useFinanceStore } from '../../shared/finance-store';
import type { BudgetDTO, CategoryDTO, TransactionDTO } from '@src/lib/finance/contract';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/finance/budgets',
}));

describe('BudgetsView Component Tests', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useFinanceStore.getState().reset();
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({ budgets: [], progress: [] }), { status: 200 }))
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useFinanceStore.getState().reset();
  });

  it('renders skeleton loader when budgetsStatus is loading and budgets is empty', () => {
    useFinanceStore.setState({
      budgetsStatus: 'loading',
      budgets: [],
    });

    const html = renderToString(<BudgetsView />);
    expect(html).toContain('animate-pulse');
  });

  it('renders empty state when no budgets exist', () => {
    useFinanceStore.setState({
      budgetsStatus: 'ready',
      budgets: [],
      categories: [],
      transactions: [],
    });

    const html = renderToString(<BudgetsView />);
    expect(html).toContain('No budgets created yet');
    expect(html).toContain('Set Category Budget');
  });

  it('renders category budget cards with spent and budgeted amounts', () => {
    const mockCategories: CategoryDTO[] = [
      {
        id: 'cat-groceries',
        userId: 'usr-1',
        name: 'Groceries',
        type: 'expense',
        color: '#10b981',
        icon: null,
        isSystem: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
      {
        id: 'cat-dining',
        userId: 'usr-1',
        name: 'Dining Out',
        type: 'expense',
        color: '#ef4444',
        icon: null,
        isSystem: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    const currentMonth = new Date().toISOString().slice(0, 7);

    const mockBudgets: BudgetDTO[] = [
      {
        id: 'bgt-1',
        userId: 'usr-1',
        categoryId: 'cat-groceries',
        amount: 1500000, // ₹15,000 in paise
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
        createdAt: `${currentMonth}-01T00:00:00Z`,
        updatedAt: `${currentMonth}-01T00:00:00Z`,
      },
      {
        id: 'bgt-2',
        userId: 'usr-1',
        categoryId: 'cat-dining',
        amount: 500000, // ₹5,000 in paise
        period: 'monthly',
        startDate: `${currentMonth}-01`,
        endDate: null,
        createdAt: `${currentMonth}-01T00:00:00Z`,
        updatedAt: `${currentMonth}-01T00:00:00Z`,
      },
    ];

    const mockTransactions: TransactionDTO[] = [
      {
        id: 'tx-1',
        userId: 'usr-1',
        accountId: 'acc-1',
        toAccountId: null,
        categoryId: 'cat-groceries',
        date: `${currentMonth}-05`,
        type: 'expense',
        amount: 600000, // ₹6,000
        signedAmount: -600000,
        payee: 'Supermarket',
        note: null,
        tags: null,
        clientRequestId: null,
        importHash: null,
        isRecurring: false,
        recurringRuleId: null,
        deletedAt: null,
        createdAt: `${currentMonth}-05T00:00:00Z`,
        updatedAt: `${currentMonth}-05T00:00:00Z`,
      },
      {
        id: 'tx-2',
        userId: 'usr-1',
        accountId: 'acc-1',
        toAccountId: null,
        categoryId: 'cat-dining',
        date: `${currentMonth}-10`,
        type: 'expense',
        amount: 600000, // ₹6,000 (over budget: 6000 > 5000)
        signedAmount: -600000,
        payee: 'Restaurant',
        note: null,
        tags: null,
        clientRequestId: null,
        importHash: null,
        isRecurring: false,
        recurringRuleId: null,
        deletedAt: null,
        createdAt: `${currentMonth}-10T00:00:00Z`,
        updatedAt: `${currentMonth}-10T00:00:00Z`,
      },
    ];

    useFinanceStore.setState({
      budgetsStatus: 'ready',
      budgets: mockBudgets,
      categories: mockCategories,
      transactions: mockTransactions,
    });

    const html = renderToString(<BudgetsView />);

    // Total budgeted: ₹15,000 + ₹5,000 = ₹20,000
    expect(html).toContain('₹20,000');
    // Total spent: ₹6,000 + ₹6,000 = ₹12,000
    expect(html).toContain('₹12,000');
    // Category names
    expect(html).toContain('Groceries');
    expect(html).toContain('Dining Out');
    // Over budget alert for dining out
    expect(html).toContain('over budget');
    // Remaining for groceries
    expect(html).toContain('remaining');
  });

  it('renders BudgetForm for creating a new budget', () => {
    const mockCategories: CategoryDTO[] = [
      {
        id: 'cat-shopping',
        userId: 'usr-1',
        name: 'Shopping',
        type: 'expense',
        color: '#3b82f6',
        icon: null,
        isSystem: true,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    useFinanceStore.setState({
      categories: mockCategories,
      budgets: [],
    });

    const html = renderToString(
      <BudgetForm onCancel={vi.fn()} onSuccess={vi.fn()} />
    );

    expect(html).toContain('Shopping');
    expect(html).toContain('Budget Amount (₹)');
    expect(html).toContain('Create Budget');
  });
});
