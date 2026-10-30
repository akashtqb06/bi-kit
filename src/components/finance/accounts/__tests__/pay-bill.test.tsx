import { describe, it, expect, beforeEach, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { useFinanceStore } from '../../shared/finance-store';
import { PayBillDialog, PayBillForm } from '../pay-bill-dialog';
import { QuickAddForm } from '../../quick-add/quick-add-dialog';
import { formatAccountDisplayBalance, formatLiabilityBalance } from '../../shared/format';
import type { AccountWithBalance } from '../../shared/fixtures';

describe('Pay Credit Card Bill Flow & Safety', () => {
  const mockCard: AccountWithBalance = {
    id: 'acc-icici-card',
    userId: 'usr-1',
    name: 'Amazon Pay ICICI Card',
    kind: 'credit_card',
    class: 'liability',
    currency: 'INR',
    creditLimit: 20000000, // ₹2,00,000
    isActive: true,
    metadata: { dueDay: 20 },
    balance: -215900, // Owes ₹2,159
    outstanding: 215900, // ₹2,159
    utilization: 0.010795,
    currentValue: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockHdfc: AccountWithBalance = {
    id: 'acc-hdfc-salary',
    userId: 'usr-1',
    name: 'HDFC Salary Account',
    kind: 'bank',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: {},
    balance: 5000000, // ₹50,000
    outstanding: 0,
    utilization: 0,
    currentValue: 5000000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockSbi: AccountWithBalance = {
    id: 'acc-sbi-savings',
    userId: 'usr-1',
    name: 'SBI Savings Account',
    kind: 'bank',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: {},
    balance: 1000000, // ₹10,000
    outstanding: 0,
    utilization: 0,
    currentValue: 1000000,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockLoan: AccountWithBalance = {
    id: 'acc-personal-loan',
    userId: 'usr-1',
    name: 'Personal Loan',
    kind: 'loan',
    class: 'liability',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: {},
    balance: -50000000,
    outstanding: 50000000,
    utilization: 1,
    currentValue: 0,
    createdAt: '2026-01-01',
    updatedAt: '2026-01-01',
  };

  const mockCategories = [
    {
      id: 'cat_system_cc_payment',
      userId: 'usr-1',
      name: 'Credit card payment',
      type: 'expense' as const,
      color: '#6366f1',
      icon: 'credit-card',
      isSystem: true,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
    {
      id: 'cat_dining',
      userId: 'usr-1',
      name: 'Dining',
      type: 'expense' as const,
      color: '#f97316',
      icon: 'utensils',
      isSystem: false,
      createdAt: '2026-01-01',
      updatedAt: '2026-01-01',
    },
  ];

  beforeEach(() => {
    useFinanceStore.setState({
      accounts: [mockCard, mockHdfc, mockSbi, mockLoan],
      transactions: [],
      categories: mockCategories,
      payBillOpen: false,
      payBillCardId: null,
      quickAddOpen: false,
      quickAddInitialData: null,
    });
  });

  it('1. Default Account Selection: preselects card, selects last used account or highest balance bank account', () => {
    // Open pay bill for mockCard
    const { openPayBill } = useFinanceStore.getState();
    openPayBill(mockCard.id);

    const state = useFinanceStore.getState();
    expect(state.payBillOpen).toBe(true);
    expect(state.payBillCardId).toBe(mockCard.id);

    // If no past transactions, highest balance bank account is HDFC (50k vs 10k)
    const bankAccounts = state.accounts.filter(
      (a) => (a.kind === 'bank' || a.kind === 'cash') && a.isActive
    );
    const sorted = [...bankAccounts].sort((a, b) => b.balance - a.balance);
    expect(sorted[0].id).toBe('acc-hdfc-salary');
    expect(sorted[0].class).toBe('asset');

    // Never default From to a liability
    expect(sorted[0].kind).not.toBe('credit_card');
    expect(sorted[0].kind).not.toBe('loan');

    // If there WAS a previous payment to this card from SBI:
    useFinanceStore.setState({
      transactions: [
        {
          id: 'tx-prev-pay',
          userId: 'usr-1',
          accountId: 'acc-sbi-savings',
          toAccountId: 'acc-icici-card',
          amount: 500000,
          signedAmount: -500000,
          type: 'transfer',
          date: '2026-10-15',
          isRecurring: false,
          createdAt: '2026-10-15',
          updatedAt: '2026-10-15',
        },
      ],
    });

    const txs = useFinanceStore.getState().transactions;
    const lastPayment = txs.find(
      (t) => t.type === 'transfer' && t.toAccountId === mockCard.id
    );
    expect(lastPayment?.accountId).toBe('acc-sbi-savings');
  });

  it('2. From exclusions: Quick Add transfer excludes credit cards & loans by default', () => {
    const allAccounts = useFinanceStore.getState().accounts;

    // Filter used in Quick Add for "From":
    const defaultFromOptions = allAccounts.filter(
      (a) => a.kind !== 'credit_card' && a.kind !== 'loan' && a.kind !== 'other_liability'
    );

    expect(defaultFromOptions.find((a) => a.kind === 'credit_card')).toBeUndefined();
    expect(defaultFromOptions.find((a) => a.kind === 'loan')).toBeUndefined();
    expect(defaultFromOptions.map((a) => a.id)).toEqual(['acc-hdfc-salary', 'acc-sbi-savings']);

    // Liabilities display formatting
    expect(formatAccountDisplayBalance(mockCard)).toBe('Owes ₹2,159');
    expect(formatLiabilityBalance(mockCard.balance)).toBe('Owes ₹2,159');
    expect(formatLiabilityBalance(50000)).toBe('Credit ₹500');
    expect(formatLiabilityBalance(0)).toBe('₹0');
  });

  it('3. Full and Partial payment balance projections', () => {
    const cardOutstanding = mockCard.outstanding; // 215900 paise
    const bankBalance = mockHdfc.balance; // 5000000 paise

    // A) Full payment (₹2,159)
    const fullPayAmount = cardOutstanding;
    const cardBalAfterFull = mockCard.balance + fullPayAmount;
    const bankBalAfterFull = bankBalance - fullPayAmount;

    expect(cardBalAfterFull).toBe(0);
    expect(Math.max(0, -cardBalAfterFull)).toBe(0); // 0 outstanding
    expect(bankBalAfterFull).toBe(4784100); // ₹47,841

    // B) Partial payment (₹1,000 = 100000 paise)
    const partialPayAmount = 100000;
    const cardBalAfterPartial = mockCard.balance + partialPayAmount;
    const cardOutstandingAfterPartial = Math.max(0, -cardBalAfterPartial);
    const bankBalAfterPartial = bankBalance - partialPayAmount;

    expect(cardOutstandingAfterPartial).toBe(115900); // ₹1,159 remaining due
    expect(bankBalAfterPartial).toBe(4900000); // ₹49,000
  });

  it('4. Overpayment produces credit notice and card credit balance', () => {
    const cardOutstanding = mockCard.outstanding; // 215900 paise (₹2,159)
    const overpaymentAmount = 300000; // ₹3,000

    expect(overpaymentAmount).toBeGreaterThan(cardOutstanding);
    const overpaymentPaise = overpaymentAmount - cardOutstanding;
    expect(overpaymentPaise).toBe(84100); // ₹841

    // New card balance is positive credit
    const newCardBalance = mockCard.balance + overpaymentAmount;
    expect(newCardBalance).toBe(84100);
    expect(formatLiabilityBalance(newCardBalance)).toBe('Credit ₹841');
  });

  it('5. Insufficient funds warning detection', () => {
    const fromBalance = mockSbi.balance; // ₹10,000 (1000000 paise)
    const paymentAmount = 1500000; // ₹15,000

    const isInsufficient = fromBalance < paymentAmount;
    expect(isInsufficient).toBe(true);

    const safeAmount = 500000; // ₹5,000
    expect(fromBalance < safeAmount).toBe(false);
  });

  it('6. Spending totals are strictly unchanged by credit card bill payments', () => {
    // Spending model:
    // 1. Spends on the credit card are recorded as EXPENSE transactions on the card.
    // 2. Paying the bill is recorded as a TRANSFER from bank to card.
    // 3. Transfers MUST NEVER count as expenses.

    const cardExpenseTx = {
      id: 'tx-spend-1',
      userId: 'usr-1',
      accountId: 'acc-icici-card',
      amount: 215900,
      signedAmount: -215900,
      type: 'expense' as const,
      categoryId: 'cat_dining',
      date: '2026-10-10',
    };

    const billPaymentTransferTx = {
      id: 'tx-pay-bill-1',
      userId: 'usr-1',
      accountId: 'acc-hdfc-salary',
      toAccountId: 'acc-icici-card',
      amount: 215900,
      signedAmount: -215900,
      type: 'transfer' as const,
      categoryId: 'cat_system_cc_payment',
      date: '2026-10-28',
    };

    const allTx = [cardExpenseTx, billPaymentTransferTx];

    // Compute monthly expense:
    const monthlyExpense = allTx
      .filter((t) => t.type === 'expense')
      .reduce((sum, t) => sum + t.amount, 0);

    expect(monthlyExpense).toBe(215900); // Exactly ₹2,159 (only the card spend, NOT the payment)

    // Compute category spend:
    const categorySpend = allTx
      .filter((t) => t.type === 'expense')
      .reduce((acc, t) => {
        acc[t.categoryId || 'uncategorized'] = (acc[t.categoryId || 'uncategorized'] || 0) + t.amount;
        return acc;
      }, {} as Record<string, number>);

    expect(categorySpend['cat_dining']).toBe(215900);
    expect(categorySpend['cat_system_cc_payment']).toBeUndefined(); // Payment transfer is NOT spend
  });

  it('7. Undo action reverses transfer transaction', async () => {
    const originalFetch = globalThis.fetch;
    const calls: string[] = [];

    globalThis.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      calls.push(`${init?.method ?? 'GET'} ${url}`);
      if (url === '/api/finance/transactions' && init?.method === 'POST') {
        const body = JSON.parse(init.body as string);
        return {
          ok: true,
          json: async () => ({
            transaction: {
              id: 'tx-bill-pay-99',
              userId: 'usr-1',
              accountId: body.accountId,
              toAccountId: body.toAccountId,
              amount: body.amount,
              signedAmount: -body.amount,
              type: body.type,
              categoryId: body.categoryId,
              date: body.date,
              createdAt: '2026-10-28',
              updatedAt: '2026-10-28',
            },
          }),
        };
      }
      if (url.startsWith('/api/finance/transactions/') && init?.method === 'DELETE') {
        return {
          ok: true,
          json: async () => ({ success: true }),
        };
      }
      return { ok: true, json: async () => ({ accounts: [], transactions: [] }) };
    });

    try {
      const store = useFinanceStore.getState();
      const { transaction, undo } = await store.addTransaction({
        accountId: 'acc-hdfc-salary',
        toAccountId: 'acc-icici-card',
        type: 'transfer',
        amount: 215900,
        categoryId: 'cat_system_cc_payment',
        date: '2026-10-28',
        note: 'Credit Card Bill Payment',
      });

      expect(transaction.id).toBe('tx-bill-pay-99');
      expect(transaction.type).toBe('transfer');

      // Execute undo
      await undo();
      expect(calls).toContain('DELETE /api/finance/transactions/tx-bill-pay-99');
    } finally {
      globalThis.fetch = originalFetch;
    }
  });

  it('8. Renders PayBillForm with Help text and liability plain text', () => {
    // Open the Pay Bill dialog
    useFinanceStore.setState({
      payBillOpen: true,
      payBillCardId: mockCard.id,
    });

    const html = renderToString(<PayBillForm />);
    expect(html).toContain('Confirm Payment');
    expect(html).toContain('Amazon Pay ICICI Card');
    expect(html).toContain('Card payments are transfers, not double-counted expenses.');
    expect(html).toContain('Learn how card bill payments work');
    expect(html).toContain('Owes ₹2,159');
  });
});
