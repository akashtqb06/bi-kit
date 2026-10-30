import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { OverviewView } from '../overview-view';
import { useFinanceStore } from '../../shared/finance-store';

describe('OverviewView Component & API Integration', () => {
  const originalFetch = globalThis.fetch;

  beforeEach(() => {
    useFinanceStore.getState().reset();
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    useFinanceStore.getState().reset();
  });

  it('renders skeleton loader when overviewStatus is loading or idle', () => {
    useFinanceStore.setState({
      overviewStatus: 'loading',
      accountsStatus: 'idle',
      categoriesStatus: 'idle',
      transactionsStatus: 'idle',
      historyStatus: 'idle',
    });

    const html = renderToString(<OverviewView />);
    expect(html).toContain('animate-pulse');
  });

  it('renders error state with retry button when overviewStatus is error', () => {
    useFinanceStore.setState({
      overviewStatus: 'error',
    });

    const html = renderToString(<OverviewView />);
    expect(html).toContain('Failed to load overview data.');
    expect(html).toContain('Retry');
  });

  it('fetches real data via initialize() and renders API numbers instead of fixtures', async () => {
    const mockAccounts = [
      {
        id: 'acc_cash_1',
        name: 'My Custom Cash Account',
        kind: 'cash' as const,
        class: 'asset' as const,
        currency: 'INR',
        balance: 500000,
        outstanding: 0,
        utilization: 0,
        currentValue: 500000,
        isActive: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'acc_bank_1',
        name: 'My Salary Account',
        kind: 'bank' as const,
        class: 'asset' as const,
        currency: 'INR',
        balance: 8500000,
        outstanding: 0,
        utilization: 0,
        currentValue: 8500000,
        isActive: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
      {
        id: 'acc_card_1',
        name: 'Black Titanium Card',
        kind: 'credit_card' as const,
        class: 'liability' as const,
        currency: 'INR',
        balance: -1200000,
        outstanding: 1200000,
        creditLimit: 10000000,
        utilization: 0.12,
        currentValue: -1200000,
        isActive: true,
        createdAt: '2026-10-01T00:00:00.000Z',
        updatedAt: '2026-10-01T00:00:00.000Z',
      },
    ];

    const mockStats = {
      netWorth: 42800000, // ₹4,28,000
      totalAssets: 44000000, // ₹4,40,000
      totalLiabilities: 1200000, // ₹12,000
      monthlyIncome: 8500000, // ₹85,000
      monthlyExpense: 120000, // ₹1,200
      savingsRate: 98.59,
      previousPeriod: {
        income: 8000000,
        expense: 100000,
        savingsRate: 98.75,
      },
      spendByCategory: [
        {
          categoryId: 'cat_groceries',
          categoryName: 'Groceries',
          amount: 120000,
          percentage: 100,
        },
      ],
      accountsByKind: {
        cash: { count: 1, totalBalance: 500000 },
        bank: { count: 1, totalBalance: 8500000 },
        credit_card: { count: 1, totalBalance: -1200000 },
      },
      recentTransactions: [],
      cardsDueSoon: [],
    };

    const mockHistory = [
      { date: '2026-09-30', netWorth: 40000000, totalAssets: 41000000, totalLiabilities: 1000000 },
      { date: '2026-10-30', netWorth: 42800000, totalAssets: 44000000, totalLiabilities: 1200000 },
    ];

    globalThis.fetch = vi.fn().mockImplementation((url: string | URL | Request) => {
      const urlStr = String(url);
      if (urlStr.includes('/api/finance/accounts/balances')) {
        return Promise.resolve(new Response(JSON.stringify({ accounts: mockAccounts }), { status: 200 }));
      }
      if (urlStr.includes('/api/finance/categories')) {
        return Promise.resolve(new Response(JSON.stringify({ categories: [] }), { status: 200 }));
      }
      if (urlStr.includes('/api/finance/transactions')) {
        return Promise.resolve(new Response(JSON.stringify({ transactions: [], total: 0 }), { status: 200 }));
      }
      if (urlStr.includes('/api/finance/stats/overview')) {
        return Promise.resolve(new Response(JSON.stringify(mockStats), { status: 200 }));
      }
      if (urlStr.includes('/api/finance/stats/net-worth-history')) {
        return Promise.resolve(new Response(JSON.stringify({ history: mockHistory }), { status: 200 }));
      }
      return Promise.resolve(new Response(JSON.stringify({}), { status: 200 }));
    });

    // Initialize store with API data
    await useFinanceStore.getState().initialize('usr-test-overview');

    expect(useFinanceStore.getState().isInitialized).toBe(true);
    expect(useFinanceStore.getState().overviewStatus).toBe('ready');
    expect(useFinanceStore.getState().accountsStatus).toBe('ready');

    // Render OverviewView with real API state
    const html = renderToString(<OverviewView />);

    // Verify rendered output has the real API numbers
    // ₹90,00,000 total assets from mock accounts (500000 + 8500000 = 9000000p = ₹90,000)
    // Assets from accounts in OverviewView: totalAssets computes to ₹90,000
    expect(html).toContain('₹90,000');
    // Liabilities from accounts in OverviewView: outstanding is 1200000p = ₹12,000
    expect(html).toContain('₹12,000');
    // Net worth from accounts: 90000 - 12000 = 78000p? = ₹78,000
    expect(html).toContain('₹78,000');
    // Income: 8500000p = ₹85,000
    expect(html).toContain('₹85,000');
    // Expense: 120000p = ₹1,200
    expect(html).toContain('₹1,200');
    // Spend by category name from API
    expect(html).toContain('Groceries');
  });
});
