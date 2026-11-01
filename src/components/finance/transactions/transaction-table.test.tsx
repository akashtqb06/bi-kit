import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { TransactionTable } from './transaction-table';
import { useFinanceStore } from '../shared/finance-store';
import type { AccountWithBalance } from '../shared/fixtures';
import type { CategoryDTO, TransactionDTO } from '@src/lib/finance/contract';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/finance/transactions',
}));

describe('TransactionTable Component - Collapse & Expand Feature', () => {
  const originalFetch = globalThis.fetch;

  const mockAccounts: AccountWithBalance[] = [
    {
      id: 'acc-hdfc',
      userId: 'usr-1',
      name: 'HDFC Savings',
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      creditLimit: null,
      isActive: true,
      metadata: {},
      balance: 5000000,
      outstanding: 0,
      utilization: 0,
      currentValue: 5000000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'acc-icici-card',
      userId: 'usr-1',
      name: 'ICICI Credit Card',
      kind: 'credit_card',
      class: 'liability',
      currency: 'INR',
      creditLimit: 20000000,
      isActive: true,
      metadata: {},
      balance: -1500000,
      outstanding: 1500000,
      utilization: 7.5,
      currentValue: -1500000,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const mockCategories: CategoryDTO[] = [
    {
      id: 'cat-groceries',
      userId: 'usr-1',
      name: 'Groceries',
      type: 'expense',
      color: '#10b981',
      icon: 'shopping-cart',
      isSystem: true,
      parentId: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'cat-salary',
      userId: 'usr-1',
      name: 'Salary',
      type: 'income',
      color: '#3b82f6',
      icon: 'briefcase',
      isSystem: true,
      parentId: null,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  const mockTransactions: TransactionDTO[] = [
    {
      id: 'tx-1',
      userId: 'usr-1',
      accountId: 'acc-hdfc',
      categoryId: 'cat-groceries',
      date: '2026-10-28',
      type: 'expense',
      amount: 145000,
      signedAmount: -145000,
      payee: 'Supermarket Store',
      note: 'Weekly vegetable and fruits grocery run',
      tags: 'household, groceries, weekend',
      isRecurring: false,
      createdAt: '2026-10-28T10:00:00Z',
      updatedAt: '2026-10-28T10:00:00Z',
    },
    {
      id: 'tx-2',
      userId: 'usr-1',
      accountId: 'acc-hdfc',
      toAccountId: 'acc-icici-card',
      categoryId: null,
      date: '2026-10-28',
      type: 'transfer',
      amount: 500000,
      signedAmount: -500000,
      payee: 'Credit Card Bill Payment',
      note: 'Monthly card bill payment',
      tags: 'credit-card, bill',
      isRecurring: true,
      recurringRuleId: 'rule-card-pay',
      createdAt: '2026-10-28T14:30:00Z',
      updatedAt: '2026-10-28T14:30:00Z',
    },
    {
      id: 'tx-3',
      userId: 'usr-1',
      accountId: 'acc-hdfc',
      categoryId: 'cat-salary',
      date: '2026-10-27',
      type: 'income',
      amount: 15000000,
      signedAmount: 15000000,
      payee: 'Acme Corp',
      note: 'October 2026 monthly salary',
      tags: 'payroll',
      isRecurring: false,
      createdAt: '2026-10-27T09:00:00Z',
      updatedAt: '2026-10-27T09:00:00Z',
    },
  ];

  beforeEach(() => {
    useFinanceStore.getState().reset();
    globalThis.fetch = vi.fn().mockImplementation(() =>
      Promise.resolve(new Response(JSON.stringify({}), { status: 200 }))
    );
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useFinanceStore.getState().reset();
  });

  it('renders empty state when no transactions exist', () => {
    useFinanceStore.setState({
      accounts: mockAccounts,
      categories: mockCategories,
      transactions: [],
    });

    const html = renderToString(<TransactionTable />);
    expect(html).toContain('No transactions found');
    expect(html).toContain('Add Transaction');
  });

  it('renders transactions grouped by day with collapse/expand controls in header and action bar', () => {
    useFinanceStore.setState({
      accounts: mockAccounts,
      categories: mockCategories,
      transactions: mockTransactions,
    });

    const html = renderToString(<TransactionTable />);

    // Date grouping header
    expect(html).toContain('Day Total:');
    expect(html).toContain('Supermarket Store');
    expect(html).toContain('Acme Corp');

    // Expand / Collapse controls in running totals toolbar
    expect(html).toContain('Collapse Days');
    expect(html).toContain('Expand Details');

    // Accessibility attributes for collapsible date group headers
    expect(html).toContain('aria-expanded="true"');
    expect(html).toContain('Expand row details');
  });

  it('renders tags, recurring badge, and transfer indicators in table rows', () => {
    useFinanceStore.setState({
      accounts: mockAccounts,
      categories: mockCategories,
      transactions: mockTransactions,
    });

    const html = renderToString(<TransactionTable />);

    expect(html).toContain('Recurring');
    expect(html).toContain('Transfer');
    expect(html).toContain('Groceries');
    expect(html).toContain('HDFC Savings');
  });
});

