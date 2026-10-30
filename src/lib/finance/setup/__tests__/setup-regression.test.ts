import { beforeEach, describe, expect, it } from 'vitest';
import { setupFinanceTestDb, USER_A } from '../../__tests__/db/test-helper';
import { completeSetup } from '../service';
import type { DbFinanceService } from '../../db-service';
import type { CompleteSetupPayload } from '../types';
import { todayInTz, DEFAULT_TZ } from '../../timezone';

describe('Setup End-to-End Regression Test on PGlite', () => {
  let service: DbFinanceService;
  const today = todayInTz(DEFAULT_TZ);

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  it('runs complete setup, verifies net worth, gains, utilization, and subsequent transactions', async () => {
    const payload: CompleteSetupPayload = {
      preferences: {
        timezone: 'Asia/Kolkata',
        baseCurrency: 'INR',
        trackingStartDate: today,
        weekStartsOn: 1,
      },
      categories: {
        disabledDefaults: [],
        customCategories: [{ name: 'Groceries', type: 'expense' }],
      },
      accounts: [
        {
          name: 'Cash Wallet',
          kind: 'cash',
          balancePaise: 500000, // ₹5,000
          owedPaise: 0,
        },
        {
          name: 'HDFC Bank',
          kind: 'bank',
          balancePaise: 8500000, // ₹85,000
          owedPaise: 0,
        },
        {
          name: 'ICICI Credit Card',
          kind: 'credit_card',
          balancePaise: 0,
          owedPaise: 1200000, // ₹12,000 owed
          creditLimitPaise: 10000000, // ₹100,000 limit
          statementDay: 15,
          dueDay: 5,
        },
        {
          name: 'HDFC FD',
          kind: 'fixed_deposit',
          balancePaise: 0,
          owedPaise: 0,
          principalPaise: 10000000, // ₹100,000
          currentValuePaise: 10000000,
        },
        {
          name: 'Zerodha Mutual Funds',
          kind: 'mutual_fund',
          balancePaise: 0,
          owedPaise: 0,
          totalInvestedPaise: 22000000, // ₹220,000 cost basis
          currentValuePaise: 25000000, // ₹250,000 current value
        },
      ],
    };

    const result = await completeSetup(USER_A, payload);
    expect(result.success).toBe(true);
    expect(result.accountsCreated).toBe(5);

    // Initial Overview Stats verification
    const initialStats = await service.getOverviewStats(USER_A);
    // Expected:
    // assets = 500000 + 8500000 + 10000000 + 25000000 = 44000000p (₹440,000)
    // liabilities = 1200000p (₹12,000)
    // netWorth = 44000000 - 1200000 = 42800000p (₹428,000)
    expect(initialStats.totalAssets).toBe(44000000);
    expect(initialStats.totalLiabilities).toBe(1200000);
    expect(initialStats.netWorth).toBe(42800000);

    // Fetch accounts to check individual metrics
    const accounts = await service.listAccounts(USER_A);
    const bankAccount = accounts.find((a) => a.name === 'HDFC Bank')!;
    const cardAccount = accounts.find((a) => a.name === 'ICICI Credit Card')!;
    const mfAccount = accounts.find((a) => a.name === 'Zerodha Mutual Funds')!;

    expect(bankAccount).toBeDefined();
    expect(cardAccount).toBeDefined();
    expect(mfAccount).toBeDefined();

    // Check valuations for mutual funds
    const mfValuations = await service.listValuations(USER_A, { accountId: mfAccount.id });
    expect(mfValuations.length).toBe(1);
    const mfVal = mfValuations[0]!;
    expect(mfVal.value).toBe(25000000);
    expect(mfVal.costBasis).toBe(22000000);
    const mfGain = mfVal.value - (mfVal.costBasis ?? 0);
    expect(mfGain).toBe(3000000); // ₹30,000 gain

    // Check credit card utilization
    const creditLimit = cardAccount.creditLimit ?? 0;
    expect(creditLimit).toBe(10000000);
    const cardOwed = 1200000;
    const utilization = cardOwed / creditLimit;
    expect(utilization).toBe(0.12); // 12%

    // Now add transactions:
    // 1. Bank expense: 120000p (₹1,200)
    await service.createTransaction(USER_A, {
      accountId: bankAccount.id,
      type: 'expense',
      amount: 120000,
      date: today,
      payee: 'Groceries',
    });

    // 2. Card spend: 80000p (₹800)
    await service.createTransaction(USER_A, {
      accountId: cardAccount.id,
      type: 'expense',
      amount: 80000,
      date: today,
      payee: 'Dining',
    });

    // Verify updated stats after transactions:
    // bank balance = 8500000 - 120000 = 8380000p
    // CC owed = 1200000 + 80000 = 1280000p
    // assets = 500000 + 8380000 + 10000000 + 25000000 = 43880000p
    // liabilities = 1280000p
    // netWorth = 43880000 - 1280000 = 42600000p
    const updatedStats = await service.getOverviewStats(USER_A);
    expect(updatedStats.totalAssets).toBe(43880000);
    expect(updatedStats.totalLiabilities).toBe(1280000);
    expect(updatedStats.netWorth).toBe(42600000);
  });
});
