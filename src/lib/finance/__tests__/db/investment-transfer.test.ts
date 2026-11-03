import { beforeEach, describe, expect, it, vi } from 'vitest';
import { setupFinanceTestDb, USER_A } from './test-helper';
import type { DbFinanceService } from '../../db-service';
import { GET as getBalances } from '@src/app/api/finance/accounts/balances/route';

// Mock auth DAL to authenticate USER_A
vi.mock('@src/lib/auth/dal', () => ({
  requireUserApi: vi.fn(async () => ({
    id: USER_A,
    email: 'user_a@example.com',
    role: 'member',
  })),
}));

describe('Investment Account Transfers & Invested Amount (Cost Basis)', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  it('reflects transfers from saving account to Groww investments in invested amount and current value', async () => {
    // 1. Create Savings Account and Groww Mutual Funds account
    const savings = await service.createAccount(USER_A, {
      name: 'HDFC Savings Account',
      kind: 'bank',
      currency: 'INR',
    });

    const groww = await service.createAccount(USER_A, {
      name: 'Groww Mutual Funds',
      kind: 'mutual_fund',
      currency: 'INR',
      metadata: {
        openingContributionPaise: 28000000, // ₹2,80,000 invested initially
      },
    });

    // Initial income into Savings Account: ₹1,00,000
    await service.createTransaction(USER_A, {
      accountId: savings.id,
      type: 'income',
      amount: 10000000,
      date: '2026-10-01',
      payee: 'Salary',
    });

    // Opening valuation on Groww: ₹3,50,000 value, ₹2,80,000 cost basis
    await service.createValuation(USER_A, {
      accountId: groww.id,
      date: '2026-10-01',
      value: 35000000,
      costBasis: 28000000,
      note: 'Opening valuation recorded during setup',
    });

    // 2. Check initial balances before transfer
    const initialRes = await getBalances();
    expect(initialRes.status).toBe(200);
    const initialData = await initialRes.json();
    const growwInitial = initialData.accounts.find((a: { id: string }) => a.id === groww.id);

    expect(growwInitial).toBeDefined();
    expect(growwInitial.costBasis).toBe(28000000); // ₹2,80,000 invested
    expect(growwInitial.currentValue).toBe(35000000); // ₹3,50,000 market value
    expect(growwInitial.gain).toBe(7000000); // ₹70,000 gain
    expect(growwInitial.gainPct).toBe(25); // +25.0%

    // 3. Add transfer from savings account to Groww investments: ₹50,000
    await service.createTransaction(USER_A, {
      accountId: savings.id,
      toAccountId: groww.id,
      type: 'transfer',
      amount: 5000000,
      date: '2026-11-03',
      payee: 'Groww SIP / Lump Sum',
    });

    // 4. Check balances after transfer
    const updatedRes = await getBalances();
    expect(updatedRes.status).toBe(200);
    const updatedData = await updatedRes.json();
    const growwUpdated = updatedData.accounts.find((a: { id: string }) => a.id === groww.id);
    const savingsUpdated = updatedData.accounts.find((a: { id: string }) => a.id === savings.id);

    // Savings decreased by ₹50,000 (from ₹1,00,000 to ₹50,000)
    expect(savingsUpdated.balance).toBe(5000000);

    // Groww invested amount MUST reflect the ₹50,000 transfer:
    // ₹2,80,000 + ₹50,000 = ₹3,30,000
    expect(growwUpdated.costBasis).toBe(33000000);

    // Groww current value MUST reflect the newly deposited capital:
    // ₹3,50,000 + ₹50,000 = ₹4,00,000
    expect(growwUpdated.currentValue).toBe(40000000);

    // Gain preserves the underlying capital growth:
    // ₹4,00,000 - ₹3,30,000 = ₹70,000
    expect(growwUpdated.gain).toBe(7000000);
    expect(growwUpdated.gainPct).toBe(21.2);

    // 5. Verify Overview Stats preserves total assets and net worth
    const stats = await service.getOverviewStats(USER_A);
    // Total Assets = Savings (5,000,000) + Groww (40,000,000) = 45,000,000 paise (₹450,000)
    expect(stats.totalAssets).toBe(45000000);
    expect(stats.netWorth).toBe(45000000);

    // 6. Verify Account History chart data has no invariant mismatch
    const history = await service.getAccountHistory(USER_A, groww.id);
    expect(history.isMismatch).toBe(false);
    expect(history.currentBalance).toBe(40000000);
  });

  it('refreshes invested amount and adjusts current value based on current gain when recurring rule transfer is executed', async () => {
    // 1. Create Savings Account and Groww Mutual Funds account
    const savings = await service.createAccount(USER_A, {
      name: 'Kotak Savings Account',
      kind: 'bank',
      currency: 'INR',
    });

    const groww = await service.createAccount(USER_A, {
      name: 'Groww Mutual Funds SIP',
      kind: 'mutual_fund',
      currency: 'INR',
      metadata: {
        openingContributionPaise: 28000000,
      },
    });

    // Initial income into Savings: ₹2,00,000
    await service.createTransaction(USER_A, {
      accountId: savings.id,
      type: 'income',
      amount: 20000000,
      date: '2026-10-01',
      payee: 'Bonus',
    });

    // Opening valuation on Groww: ₹3,50,000 value, ₹2,80,000 cost basis (Gain = ₹70,000)
    await service.createValuation(USER_A, {
      accountId: groww.id,
      date: '2026-11-03',
      value: 35000000,
      costBasis: 28000000,
      note: 'Latest Groww Portfolio Snapshot',
    });

    // 2. Create recurring rule for transfer of funds to Groww mutual funds: ₹20,000
    const rule = await service.createRecurringRule(USER_A, {
      accountId: savings.id,
      toAccountId: groww.id,
      type: 'transfer',
      amount: 2000000, // ₹20,000
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-11-03',
      payee: 'Groww Monthly SIP',
      nextOccurrence: '2026-11-03',
    });

    expect(rule.id).toBeDefined();

    // 3. Generate due recurring transactions (simulating cron or auto-catchup)
    const genResult = await (await import('../../recurring')).generateDueRecurringTransactions({
      userId: USER_A,
      asOfDate: '2026-11-03',
    });
    expect(genResult.generated).toBe(1);

    // 4. Check balances via API
    const res = await getBalances();
    expect(res.status).toBe(200);
    const data = await res.json();
    const growwAcc = data.accounts.find((a: { id: string }) => a.id === groww.id);
    const savingsAcc = data.accounts.find((a: { id: string }) => a.id === savings.id);

    // Savings: ₹2,00,000 - ₹20,000 = ₹1,80,000
    expect(savingsAcc.balance).toBe(18000000);

    // Groww Invested Amount (Cost Basis): ₹2,80,000 + ₹20,000 = ₹3,00,000
    expect(growwAcc.costBasis).toBe(30000000);

    // Groww Current Value: Adjusts based on current gain (₹70,000) -> ₹3,00,000 + ₹70,000 = ₹3,70,000
    expect(growwAcc.currentValue).toBe(37000000);

    // Groww Gain: Intact at ₹70,000
    expect(growwAcc.gain).toBe(7000000);

    // Groww Gain %: (70,000 / 300,000) * 100 = 23.3%
    expect(growwAcc.gainPct).toBe(23.3);

    // Total Assets: Savings (18,000,000) + Groww (37,000,000) = 55,000,000 (preserves net worth)
    const stats = await service.getOverviewStats(USER_A);
    expect(stats.totalAssets).toBe(55000000);
    expect(stats.netWorth).toBe(55000000);
  });
});
