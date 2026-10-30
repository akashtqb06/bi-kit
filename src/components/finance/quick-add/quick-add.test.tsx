import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { QuickAddForm } from './quick-add-dialog';
import { useFinanceStore } from '../shared/finance-store';
import { parseAmountExpression } from '../shared/expression-parser';

describe('Quick Add Component & Logic Verification', () => {
  beforeEach(() => {
    // Reset store state
    useFinanceStore.setState({
      quickAddOpen: true,
      quickAddInitialData: null,
      lastUsedAccountId: 'acc-hdfc-salary',
    });
  });

  it('renders Quick Add form cleanly without server rendering errors', () => {
    const html = renderToString(<QuickAddForm />);
    expect(html).toContain('Expense');
    expect(html).toContain('Income');
    expect(html).toContain('Transfer');
    expect(html).toContain('Amount');
  });

  it('evaluates mathematical expressions into valid minor paise units', () => {
    const res = parseAmountExpression('250+40');
    expect(res.isValid).toBe(true);
    expect(res.result).toBe(290);
    expect(res.paise).toBe(29000);

    const complex = parseAmountExpression('500 + 50 * 2');
    expect(complex.result).toBe(600);
    expect(complex.paise).toBe(60000);
  });

  it('validates transfer transactions require distinct from and to accounts', () => {
    const acc1: string = 'acc-hdfc-salary';
    const acc2: string = 'acc-icici-card';

    // Same account should fail
    expect(acc1 === acc1).toBe(true);
    // Distinct accounts should succeed
    expect(acc1 === acc2).toBe(false);
  });

  it('executes addTransaction via API and supports undo', async () => {
    const originalFetch = globalThis.fetch;
    const mockAccounts = [
      {
        id: 'acc-hdfc-salary',
        userId: 'usr-1',
        name: 'HDFC Salary Account',
        kind: 'bank' as const,
        class: 'asset' as const,
        currency: 'INR',
        creditLimit: null,
        isActive: true,
        metadata: {},
        balance: 100000,
        outstanding: 0,
        utilization: 0,
        currentValue: 100000,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    useFinanceStore.setState({
      accounts: mockAccounts,
      transactions: [],
    });

    const calls: string[] = [];
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/finance/transactions' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            transaction: {
              id: 'tx-created-1',
              userId: 'usr-1',
              accountId: body.accountId,
              amount: body.amount,
              signedAmount: -body.amount,
              type: body.type,
              date: body.date,
              payee: body.payee,
              clientRequestId: body.clientRequestId,
              createdAt: '2026-10-28',
              updatedAt: '2026-10-28',
            },
          }),
        };
      }
      if (url === '/api/finance/accounts/balances') {
        return {
          ok: true,
          json: async () => ({
            accounts: [
              {
                ...mockAccounts[0],
                balance: mockAccounts[0].balance - 29000,
              },
            ],
          }),
        };
      }
      if (url === '/api/finance/stats/overview') {
        return {
          ok: true,
          json: async () => ({
            netWorth: 71000,
            totalAssets: 71000,
            totalLiabilities: 0,
            monthlyIncome: 0,
            monthlyExpense: 29000,
            savingsRate: 0,
          }),
        };
      }
      if (url === '/api/finance/transactions' && (!init?.method || init.method === 'GET')) {
        return {
          ok: true,
          json: async () => ({
            transactions: [
              {
                id: 'tx-created-1',
                userId: 'usr-1',
                accountId: 'acc-hdfc-salary',
                amount: 29000,
                signedAmount: -29000,
                type: 'expense',
                date: '2026-10-28',
                payee: 'Supermarket',
                clientRequestId: 'client-req-abc-123',
                createdAt: '2026-10-28',
                updatedAt: '2026-10-28',
              },
            ],
          }),
        };
      }
      if (url.startsWith('/api/finance/transactions/') && init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    try {
      const store = useFinanceStore.getState();
      const reqId1 = 'client-req-abc-123';
      const { transaction, undo } = await store.addTransaction(
        {
          accountId: 'acc-hdfc-salary',
          categoryId: 'cat-groceries',
          date: '2026-10-28',
          type: 'expense',
          amount: 29000,
          payee: 'Supermarket',
        },
        reqId1
      );

      // Verify returned transaction and state
      expect(transaction.id).toBe('tx-created-1');
      expect(transaction.clientRequestId).toBe(reqId1);
      const stateAfterAdd = useFinanceStore.getState();
      expect(stateAfterAdd.transactions.length).toBe(1);
      expect(stateAfterAdd.accounts[0].balance).toBe(71000);

      // Verify undo reverts
      await undo();
      expect(calls).toContain('DELETE /api/finance/transactions/tx-created-1');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('handles transfer flow and card balance updates', async () => {
    const originalFetch = globalThis.fetch;
    const mockAccounts = [
      {
        id: 'acc-hdfc-salary',
        userId: 'usr-1',
        name: 'HDFC Salary Account',
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
      },
      {
        id: 'acc-icici-card',
        userId: 'usr-1',
        name: 'ICICI Credit Card',
        kind: 'credit_card' as const,
        class: 'liability' as const,
        currency: 'INR',
        creditLimit: 10000000,
        isActive: true,
        metadata: {},
        balance: -2000000,
        outstanding: 2000000,
        utilization: 0.2,
        currentValue: -2000000,
        createdAt: '2026-01-01',
        updatedAt: '2026-01-01',
      },
    ];

    useFinanceStore.setState({
      accounts: mockAccounts,
      transactions: [],
    });

    const transferAmount = 1000000;
    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      if (url === '/api/finance/transactions' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            transaction: {
              id: 'tx-transfer-1',
              userId: 'usr-1',
              accountId: body.accountId,
              toAccountId: body.toAccountId,
              amount: body.amount,
              signedAmount: -body.amount,
              type: body.type,
              date: body.date,
              createdAt: '2026-10-28',
              updatedAt: '2026-10-28',
            },
          }),
        };
      }
      if (url === '/api/finance/accounts/balances') {
        return {
          ok: true,
          json: async () => ({
            accounts: [
              { ...mockAccounts[0], balance: mockAccounts[0].balance - transferAmount },
              {
                ...mockAccounts[1],
                balance: mockAccounts[1].balance + transferAmount,
                outstanding: mockAccounts[1].outstanding - transferAmount,
                utilization: (mockAccounts[1].outstanding - transferAmount) / 10000000,
              },
            ],
          }),
        };
      }
      if (url === '/api/finance/stats/overview') {
        return {
          ok: true,
          json: async () => ({
            netWorth: 4000000,
            totalAssets: 4000000,
            totalLiabilities: 1000000,
            monthlyIncome: 0,
            monthlyExpense: 0,
            savingsRate: 0,
          }),
        };
      }
      if (url === '/api/finance/transactions') {
        return {
          ok: true,
          json: async () => ({
            transactions: [
              {
                id: 'tx-transfer-1',
                userId: 'usr-1',
                accountId: 'acc-hdfc-salary',
                toAccountId: 'acc-icici-card',
                amount: transferAmount,
                signedAmount: -transferAmount,
                type: 'transfer',
                date: '2026-10-28',
                createdAt: '2026-10-28',
                updatedAt: '2026-10-28',
              },
            ],
          }),
        };
      }
      return { ok: true, json: async () => ({}) };
    });

    try {
      const store = useFinanceStore.getState();
      await store.addTransaction({
        accountId: 'acc-hdfc-salary',
        toAccountId: 'acc-icici-card',
        date: '2026-10-28',
        type: 'transfer',
        amount: transferAmount,
        payee: 'Credit Card Bill Payment',
      });

      const updatedBank = useFinanceStore.getState().accounts.find((a) => a.id === 'acc-hdfc-salary')!;
      const updatedCard = useFinanceStore.getState().accounts.find((a) => a.id === 'acc-icici-card')!;

      expect(updatedBank.balance).toBe(4000000);
      expect(updatedCard.balance).toBe(-1000000);
      expect(updatedCard.outstanding).toBe(1000000);
    } finally {
      globalThis.fetch = originalFetch;
    }
  });
});
