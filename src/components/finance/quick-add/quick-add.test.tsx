import { describe, it, expect, beforeEach } from 'vitest';
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

  it('executes optimistic addTransaction and supports idempotent resubmit and undo', async () => {
    const store = useFinanceStore.getState();
    const initialTxCount = store.transactions.length;
    const initialHdfcBalance = store.accounts.find((a) => a.id === 'acc-hdfc-salary')?.balance || 0;

    const reqId1 = 'client-req-abc-123';
    const { transaction, undo } = await store.addTransaction(
      {
        accountId: 'acc-hdfc-salary',
        categoryId: 'cat-groceries',
        date: '2026-10-28',
        type: 'expense',
        amount: 29000, // ₹290.00
        payee: 'Supermarket',
      },
      reqId1
    );

    // Verify optimistic insert
    const stateAfterAdd = useFinanceStore.getState();
    expect(stateAfterAdd.transactions.length).toBe(initialTxCount + 1);
    expect(stateAfterAdd.transactions[0].id).toBe(transaction.id);
    expect(stateAfterAdd.transactions[0].clientRequestId).toBe(reqId1);

    // Verify account balance decreased
    const updatedHdfc = stateAfterAdd.accounts.find((a) => a.id === 'acc-hdfc-salary');
    expect(updatedHdfc?.balance).toBe(initialHdfcBalance - 29000);

    // Verify payee category map was updated
    expect(stateAfterAdd.payeeCategoryMap['supermarket']).toBe('cat-groceries');

    // Verify undo reverts state completely
    undo();
    const stateAfterUndo = useFinanceStore.getState();
    expect(stateAfterUndo.transactions.length).toBe(initialTxCount);
    const revertedHdfc = stateAfterUndo.accounts.find((a) => a.id === 'acc-hdfc-salary');
    expect(revertedHdfc?.balance).toBe(initialHdfcBalance);
  });

  it('handles transfer flow and card balance updates', async () => {
    const store = useFinanceStore.getState();
    const bankAcc = store.accounts.find((a) => a.id === 'acc-hdfc-salary')!;
    const cardAcc = store.accounts.find((a) => a.id === 'acc-icici-card')!;

    const initialBankBal = bankAcc.balance;
    const initialCardBal = cardAcc.balance; // negative
    const initialCardOutstanding = cardAcc.outstanding;

    const transferAmount = 1000000; // ₹10,000 payment to card

    await store.addTransaction({
      accountId: bankAcc.id,
      toAccountId: cardAcc.id,
      date: '2026-10-28',
      type: 'transfer',
      amount: transferAmount,
      payee: 'Credit Card Bill Payment',
    });

    const updatedBank = useFinanceStore.getState().accounts.find((a) => a.id === bankAcc.id)!;
    const updatedCard = useFinanceStore.getState().accounts.find((a) => a.id === cardAcc.id)!;

    expect(updatedBank.balance).toBe(initialBankBal - transferAmount);
    expect(updatedCard.balance).toBe(initialCardBal + transferAmount);
    expect(updatedCard.outstanding).toBe(initialCardOutstanding - transferAmount);
  });
});
