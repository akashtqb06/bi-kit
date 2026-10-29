import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';
import { MockFinanceService } from '../mock-service';
import type { OracleExpectations } from './oracle';

describe('Oracle Parity Tests', () => {
  const oraclePath = path.resolve(process.cwd(), 'fixtures/finance/salaried-urban/oracle.json');
  const oracleRaw = fs.readFileSync(oraclePath, 'utf8');
  const oracle: OracleExpectations = JSON.parse(oracleRaw);

  const mockService = new MockFinanceService('salaried-urban', '2026-10-31');

  it('verifies account balances match oracle.json expectations', async () => {
    const accounts = await mockService.listAccounts('test_user');
    const transactionsRes = await mockService.listTransactions('test_user', { limit: 200 });
    expect(transactionsRes.transactions.length).toBeGreaterThan(0);

    // Compute mock service balances
    const allTxns: typeof transactionsRes.transactions = [];
    let cursor: string | undefined = undefined;
    let hasMore = true;
    while (hasMore) {
      const res = await mockService.listTransactions('test_user', { limit: 200, cursor: cursor || undefined });
      allTxns.push(...res.transactions);
      hasMore = res.hasMore;
      cursor = res.nextCursor || undefined;
      if (!cursor) break;
    }

    const balances: Record<string, number> = {};
    for (const a of accounts) balances[a.id] = 0;

    for (const t of allTxns) {
      if (t.type === 'expense') balances[t.accountId] -= t.amount;
      else if (t.type === 'income') balances[t.accountId] += t.amount;
      else if (t.type === 'transfer') {
        balances[t.accountId] -= t.amount;
        if (t.toAccountId) balances[t.toAccountId] = (balances[t.toAccountId] || 0) + t.amount;
      } else if (t.type === 'adjustment') {
        balances[t.accountId] += t.signedAmount;
      }
    }

    for (const [accId, expectedBal] of Object.entries(oracle.accountBalances)) {
      expect(balances[accId]).toBe(expectedBal);
    }
  });

  it('verifies overview stats match oracle.json calculations', async () => {
    const stats = await mockService.getOverviewStats('test_user');
    const lastMonthEnd = oracle.monthEndNetWorth[oracle.monthEndNetWorth.length - 1];

    expect(stats.netWorth).toBe(lastMonthEnd.netWorth);
    expect(stats.totalAssets).toBe(lastMonthEnd.assets);
    expect(stats.totalLiabilities).toBe(lastMonthEnd.liabilities);

    const currentMonthStats = oracle.monthlyStats.find((s) => s.month === '2026-10');
    if (currentMonthStats) {
      expect(stats.monthlyIncome).toBe(currentMonthStats.income);
      expect(stats.monthlyExpense).toBe(currentMonthStats.expense);
      expect(stats.savingsRate).toBe(currentMonthStats.savingsRate);
    }
  });

  it('verifies month-end net worth series parity', async () => {
    const history = await mockService.getNetWorthHistory('test_user', {
      interval: 'monthly',
      startDate: '2024-01-01',
      endDate: '2026-10-31',
    });

    expect(history.length).toBe(oracle.monthEndNetWorth.length);
    for (let i = 0; i < history.length; i++) {
      expect(history[i].netWorth).toBe(oracle.monthEndNetWorth[i].netWorth);
      expect(history[i].assets).toBe(oracle.monthEndNetWorth[i].assets);
      expect(history[i].liabilities).toBe(oracle.monthEndNetWorth[i].liabilities);
    }
  });
});
