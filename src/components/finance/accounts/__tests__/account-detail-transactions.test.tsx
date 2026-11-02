import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { useFinanceStore } from '../../shared/finance-store';
import { TransactionTable } from '../../transactions/transaction-table';
import { BudgetForm } from '../../budgets/budget-dialog';

describe('Account Details Auto-Refresh & Budget Dialog Verification', () => {
  const accountId = 'acc-hdfc-savings';
  const mockAccount = {
    id: accountId,
    userId: 'usr-1',
    name: 'HDFC Savings',
    kind: 'bank' as const,
    class: 'asset' as const,
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
  };

  beforeEach(() => {
    useFinanceStore.setState({
      accounts: [mockAccount],
      transactions: [],
      transactionsByAccount: {
        [accountId]: {
          transactions: [
            {
              id: 'tx-existing-1',
              userId: 'usr-1',
              accountId,
              amount: 100000,
              signedAmount: -100000,
              type: 'expense',
              date: '2026-10-25',
              payee: 'Grocery Store',
              isRecurring: false,
              createdAt: '2026-10-25',
              updatedAt: '2026-10-25',
            },
          ],
        },
      },
      categories: [
        { id: 'cat-groceries', userId: 'usr-1', name: 'Groceries', type: 'expense', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
      ],
    });
  });

  it('synchronously updates transactionsByAccount[accountId] when addTransaction is executed', async () => {
    const originalFetch = globalThis.fetch;
    const fetchCalls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      fetchCalls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/finance/transactions' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            transaction: {
              id: 'tx-new-auto-added',
              userId: 'usr-1',
              accountId: body.accountId,
              amount: body.amount,
              signedAmount: -body.amount,
              type: body.type,
              date: body.date,
              payee: body.payee,
              createdAt: '2026-11-01',
              updatedAt: '2026-11-01',
            },
          }),
        };
      }
      if (url.startsWith('/api/finance/transactions?accountId=')) {
        return {
          ok: true,
          json: async () => ({
            transactions: [
              {
                id: 'tx-new-auto-added',
                userId: 'usr-1',
                accountId,
                amount: 25000,
                signedAmount: -25000,
                type: 'expense',
                date: '2026-11-01',
                payee: 'Coffee Shop',
                isRecurring: false,
                createdAt: '2026-11-01',
                updatedAt: '2026-11-01',
              },
              {
                id: 'tx-existing-1',
                userId: 'usr-1',
                accountId,
                amount: 100000,
                signedAmount: -100000,
                type: 'expense',
                date: '2026-10-25',
                payee: 'Grocery Store',
                isRecurring: false,
                createdAt: '2026-10-25',
                updatedAt: '2026-10-25',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    try {
      const store = useFinanceStore.getState();
      const { transaction } = await store.addTransaction({
        accountId,
        categoryId: 'cat-groceries',
        date: '2026-11-01',
        type: 'expense',
        amount: 25000,
        payee: 'Coffee Shop',
      });

      expect(transaction.id).toBe('tx-new-auto-added');

      // The store's transactionsByAccount[accountId] must contain the new transaction immediately!
      const state = useFinanceStore.getState();
      const accountTxs = state.transactionsByAccount[accountId]?.transactions || [];
      expect(accountTxs.some((t) => t.id === 'tx-new-auto-added')).toBe(true);

      // Verify that the account transactions and history were requested
      expect(fetchCalls.some((c) => c.includes(`/api/finance/transactions?accountId=${accountId}`))).toBe(true);
      expect(fetchCalls.some((c) => c.includes(`/api/finance/accounts/${accountId}/history`))).toBe(true);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('TransactionTable renders newly added transaction for the account without manual refresh', () => {
    // Put transaction in transactionsByAccount
    useFinanceStore.setState((prev) => ({
      ...prev,
      transactionsByAccount: {
        [accountId]: {
          transactions: [
            {
              id: 'tx-instant-1',
              userId: 'usr-1',
              accountId,
              amount: 50000,
              signedAmount: -50000,
              type: 'expense',
              date: '2026-11-02',
              payee: 'Fresh Supermarket',
              isRecurring: false,
              createdAt: '2026-11-02',
              updatedAt: '2026-11-02',
            },
          ],
        },
      },
    }));

    const html = renderToString(<TransactionTable accountId={accountId} />);
    expect(html).toContain('Fresh Supermarket');
    expect(html).toContain('₹500');
  });

  it('renders BudgetForm cleanly without attaching containerRef to SelectContent', () => {
    const html = renderToString(<BudgetForm />);
    expect(html).toContain('Budget Month');
    expect(html).toContain('Category');
    expect(html).toContain('Budget Amount');
  });
});
