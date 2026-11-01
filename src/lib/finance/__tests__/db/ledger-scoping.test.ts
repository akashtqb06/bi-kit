import { beforeEach, describe, expect, it } from 'vitest';
import { NotFoundError } from '@src/app/api/utils';
import { setupFinanceTestDb, USER_A, USER_B } from './test-helper';
import type { DbFinanceService } from '../../db-service';

describe('Ledger Scoping, Signed Effects, Running Balance & History Invariants', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  it("Account A's transactions never appear in Account B's ledger", async () => {
    const accA = await service.createAccount(USER_A, { name: 'ICICI Savings', kind: 'bank' });
    const accB = await service.createAccount(USER_A, { name: 'Indian Bank Savings', kind: 'bank' });

    await service.createTransaction(USER_A, {
      accountId: accA.id,
      type: 'income',
      amount: 500000, // ₹5,000
      date: '2026-10-01',
      payee: 'Salary',
    });

    await service.createTransaction(USER_A, {
      accountId: accB.id,
      type: 'income',
      amount: 1000000, // ₹10,000
      date: '2026-10-02',
      payee: 'Freelance',
    });

    const ledgerA = await service.listTransactions(USER_A, { accountId: accA.id });
    expect(ledgerA.transactions).toHaveLength(1);
    expect(ledgerA.transactions[0].accountId).toBe(accA.id);
    expect(ledgerA.transactions[0].payee).toBe('Salary');
    expect(ledgerA.summary).toBeDefined();
    expect(ledgerA.summary?.count).toBe(1);
    expect(ledgerA.summary?.totalIn).toBe(500000);
    expect(ledgerA.summary?.totalOut).toBe(0);
    expect(ledgerA.summary?.net).toBe(500000);

    const ledgerB = await service.listTransactions(USER_A, { accountId: accB.id });
    expect(ledgerB.transactions).toHaveLength(1);
    expect(ledgerB.transactions[0].accountId).toBe(accB.id);
    expect(ledgerB.transactions[0].payee).toBe('Freelance');
    expect(ledgerB.summary?.count).toBe(1);
    expect(ledgerB.summary?.totalIn).toBe(1000000);
    expect(ledgerB.summary?.totalOut).toBe(0);
    expect(ledgerB.summary?.net).toBe(1000000);
  });

  it('Transfers appear in both ledgers with opposite signed effects and counterparties', async () => {
    const accA = await service.createAccount(USER_A, { name: 'ICICI Savings', kind: 'bank' });
    const accB = await service.createAccount(USER_A, { name: 'Credit Card', kind: 'credit_card' });

    // Initial income into Bank A
    await service.createTransaction(USER_A, {
      accountId: accA.id,
      type: 'income',
      amount: 1000000, // ₹10,000
      date: '2026-10-01',
      payee: 'Deposit',
    });

    // Transfer from Bank A to Credit Card B
    await service.createTransaction(USER_A, {
      accountId: accA.id,
      toAccountId: accB.id,
      type: 'transfer',
      amount: 300000, // ₹3,000
      date: '2026-10-05',
      payee: 'Card Payment',
    });

    // Check Bank A ledger: transfer out has negative effect (-₹3,000) and counterparty "Credit Card"
    const ledgerA = await service.listTransactions(USER_A, { accountId: accA.id });
    expect(ledgerA.transactions).toHaveLength(2);
    const transferInA = ledgerA.transactions.find((t) => t.type === 'transfer')!;
    expect(transferInA.effect).toBe(-300000);
    expect(transferInA.counterparty).toBe('Credit Card');

    // Check Card B ledger: transfer in has positive effect (+₹3,000) and counterparty "ICICI Savings"
    const ledgerB = await service.listTransactions(USER_A, { accountId: accB.id });
    expect(ledgerB.transactions).toHaveLength(1);
    const transferInB = ledgerB.transactions[0];
    expect(transferInB.effect).toBe(300000);
    expect(transferInB.counterparty).toBe('ICICI Savings');
  });

  it('Computes running balance chronologically and last point equals account balance', async () => {
    const acc = await service.createAccount(USER_A, {
      name: 'Checking',
      kind: 'bank',
    });

    // Opening adjustment transaction
    await service.createTransaction(USER_A, {
      accountId: acc.id,
      type: 'adjustment',
      amount: 100000, // ₹1,000 opening
      date: '2026-10-01',
      payee: 'Opening Balance',
    });

    // Income +₹2,000
    await service.createTransaction(USER_A, {
      accountId: acc.id,
      type: 'income',
      amount: 200000,
      date: '2026-10-02',
    });

    // Expense -₹500
    await service.createTransaction(USER_A, {
      accountId: acc.id,
      type: 'expense',
      amount: 50000,
      date: '2026-10-03',
    });

    const ledger = await service.listTransactions(USER_A, { accountId: acc.id });
    expect(ledger.transactions).toHaveLength(3); // opening adjustment + income + expense

    // Opening transaction carries isOpening: true
    const openingTx = ledger.transactions.find((t) => t.isOpening);
    expect(openingTx).toBeDefined();
    expect(openingTx?.type).toBe('adjustment');

    // Running balances:
    // Row 1 (opening): 100000
    // Row 2 (income): 300000
    // Row 3 (expense): 250000
    const sorted = [...ledger.transactions].sort((a, b) => a.date.localeCompare(b.date));
    expect(sorted[0].runningBalance).toBe(100000);
    expect(sorted[1].runningBalance).toBe(300000);
    expect(sorted[2].runningBalance).toBe(250000);

    // Latest account balance via history
    const history = await service.getAccountHistory(USER_A, acc.id);
    expect(history.currentBalance).toBe(250000);
    expect(sorted[sorted.length - 1].runningBalance).toBe(history.currentBalance);
  });

  it('History endpoint enforces invariant: last history point equals current balance / outstanding', async () => {
    // Bank account test
    const bank = await service.createAccount(USER_A, {
      name: 'Savings',
      kind: 'bank',
    });

    await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'adjustment',
      amount: 500000, // ₹5,000 opening
      date: '2026-10-01',
      payee: 'Opening Balance',
    });

    await service.createTransaction(USER_A, {
      accountId: bank.id,
      type: 'expense',
      amount: 120000,
      date: '2026-10-10',
    });

    const bankHistory = await service.getAccountHistory(USER_A, bank.id, {
      from: '2026-10-01',
      to: '2026-10-15',
    });

    expect(bankHistory.isMismatch).toBe(false);
    expect(bankHistory.currentBalance).toBe(380000);
    const lastBankPoint = bankHistory.history[bankHistory.history.length - 1];
    expect(lastBankPoint.balance).toBe(380000);

    // Credit card test (positive outstanding)
    const card = await service.createAccount(USER_A, {
      name: 'Visa Platinum',
      kind: 'credit_card',
      creditLimit: 10000000, // ₹1,00,000 limit
    });

    await service.createTransaction(USER_A, {
      accountId: card.id,
      type: 'expense',
      amount: 498495, // ₹4,984.95
      date: '2026-10-05',
      payee: 'Grocery Store',
    });

    const cardHistory = await service.getAccountHistory(USER_A, card.id, {
      from: '2026-10-01',
      to: '2026-10-15',
    });

    expect(cardHistory.isMismatch).toBe(false);
    expect(cardHistory.currentOutstanding).toBe(498495);
    const lastCardPoint = cardHistory.history[cardHistory.history.length - 1];
    expect(lastCardPoint.outstanding).toBe(498495);
  });

  it('Guarantees strict tenant isolation for ledger and history', async () => {
    const accB = await service.createAccount(USER_B, {
      name: "User B's Private Account",
      kind: 'bank',
    });

    // User A cannot list B's ledger
    await expect(
      service.listTransactions(USER_A, { accountId: accB.id })
    ).rejects.toThrow(NotFoundError);

    // User A cannot get B's account history
    await expect(
      service.getAccountHistory(USER_A, accB.id)
    ).rejects.toThrow(NotFoundError);
  });
});
