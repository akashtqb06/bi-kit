import { describe, expect, it } from 'vitest';
import {
  calculateAccountBalance,
  getSignedTransactionEffect,
} from '../balances';
import {
  calculateCardDates,
  calculateCreditCardOutstanding,
  calculateCreditCardUtilization,
  calculateLoanOutstanding,
  isCardDueWithinDays,
} from '../credit-card';
import {
  calculateFDAccruedValue,
  calculateFDMaturity,
  calculateRDAccruedValue,
  calculateRDMaturity,
  getCompoundingFrequencyCount,
} from '../deposits';
import {
  calculateInvestmentContributions,
  calculateInvestmentCurrentValue,
  calculateInvestmentGain,
} from '../investments';
import { calculateNetWorth } from '../net-worth';

describe('Finance Domain Logic: Balances & Signed Effects', () => {
  const acc1 = 'acc_bank_1';
  const acc2 = 'acc_card_1';

  it('calculates signed effect for income, expense, transfer and adjustment', () => {
    // Expense
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, type: 'expense', amount: 5000 },
        acc1
      )
    ).toBe(-5000);

    // Income
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, type: 'income', amount: 25000 },
        acc1
      )
    ).toBe(25000);

    // Transfer: source account decreases
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, toAccountId: acc2, type: 'transfer', amount: 10000 },
        acc1
      )
    ).toBe(-10000);

    // Transfer: target account increases
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, toAccountId: acc2, type: 'transfer', amount: 10000 },
        acc2
      )
    ).toBe(10000);

    // Transfer: unrelated account unaffected
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, toAccountId: acc2, type: 'transfer', amount: 10000 },
        'acc_unrelated'
      )
    ).toBe(0);

    // Adjustment positive
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, type: 'adjustment', amount: 150, signedAmount: 150 },
        acc1
      )
    ).toBe(150);

    // Adjustment negative
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, type: 'adjustment', amount: 200, signedAmount: -200 },
        acc1
      )
    ).toBe(-200);

    // Deleted transaction has 0 effect
    expect(
      getSignedTransactionEffect(
        { accountId: acc1, type: 'income', amount: 50000, deletedAt: new Date() },
        acc1
      )
    ).toBe(0);
  });

  it('calculates ledger balance as of a date including soft-delete exclusion', () => {
    const txs = [
      { accountId: acc1, type: 'income' as const, amount: 100000, date: '2026-01-01' },
      { accountId: acc1, type: 'expense' as const, amount: 20000, date: '2026-01-05' },
      { accountId: acc1, toAccountId: acc2, type: 'transfer' as const, amount: 30000, date: '2026-01-10' },
      { accountId: acc1, type: 'expense' as const, amount: 5000, date: '2026-01-15', deletedAt: '2026-01-16' },
      { accountId: acc1, type: 'income' as const, amount: 15000, date: '2026-01-20' },
    ];

    // As of 2026-01-08: 100000 - 20000 = 80000
    expect(calculateAccountBalance(txs, acc1, '2026-01-08')).toBe(80000);

    // As of 2026-01-12: 80000 - 30000 = 50000
    expect(calculateAccountBalance(txs, acc1, '2026-01-12')).toBe(50000);

    // Final balance (2026-01-25): 50000 + 15000 = 65000 (deleted 5000 excluded)
    expect(calculateAccountBalance(txs, acc1)).toBe(65000);

    // Target account balance from transfer
    expect(calculateAccountBalance(txs, acc2)).toBe(30000);
  });
});

describe('Finance Domain Logic: Credit Cards & Liabilities', () => {
  it('computes credit card outstanding and utilization correctly', () => {
    // When balance is -15000 (150 INR owed)
    expect(calculateCreditCardOutstanding(-15000)).toBe(15000);
    // When balance is positive (overpaid)
    expect(calculateCreditCardOutstanding(5000)).toBe(0);
    // When balance is 0
    expect(calculateCreditCardOutstanding(0)).toBe(0);

    // Utilization: 15000 out of 50000 limit = 0.30
    expect(calculateCreditCardUtilization(-15000, 50000)).toBeCloseTo(0.3, 4);

    // Utilization clamped at 1.0 when over limit
    expect(calculateCreditCardUtilization(-60000, 50000)).toBe(1.0);

    // Utilization 0 when limit is 0 or negative or null
    expect(calculateCreditCardUtilization(-10000, 0)).toBe(0);
    expect(calculateCreditCardUtilization(-10000, null)).toBe(0);
    expect(calculateCreditCardUtilization(5000, 50000)).toBe(0);
  });

  it('computes loan outstanding correctly', () => {
    expect(calculateLoanOutstanding(50000000)).toBe(50000000);
    expect(calculateLoanOutstanding(-1000)).toBe(0);
  });

  it('computes credit card statement and due dates', () => {
    // Today is 2026-10-28, statement day is 15th, due day is 5th of next month
    const dates = calculateCardDates(15, 5, '2026-10-28');
    expect(dates.lastStatementDate).toBe('2026-10-15');
    expect(dates.nextStatementDate).toBe('2026-11-15');
    expect(dates.currentDueDate).toBe('2026-11-05');
    expect(dates.nextDueDate).toBe('2026-12-05');

    // Due check within 10 days: from Oct 28 to Nov 5 is 8 days -> due
    const dueCheck = isCardDueWithinDays(15, 5, '2026-10-28', 10);
    expect(dueCheck.isDue).toBe(true);
    expect(dueCheck.daysRemaining).toBe(8);

    // End-of-month clamp test (Feb 28 in non-leap year)
    const febDates = calculateCardDates(31, 31, '2026-02-10');
    expect(febDates.nextStatementDate).toBe('2026-02-28');
  });
});

describe('Finance Domain Logic: Investment Calculations', () => {
  it('determines current value fallback to ledger and latest valuation', () => {
    const valuations = [
      { date: '2026-01-01', value: 100000 },
      { date: '2026-02-01', value: 110000 },
      { date: '2026-03-01', value: 108000 },
    ];

    // Fallback when no valuations exist
    expect(calculateInvestmentCurrentValue([], 50000)).toBe(50000);

    // Latest as of 2026-02-15
    expect(calculateInvestmentCurrentValue(valuations, 50000, '2026-02-15')).toBe(110000);

    // Latest overall
    expect(calculateInvestmentCurrentValue(valuations, 50000)).toBe(108000);
  });

  it('calculates net contributions and gains', () => {
    const invAcc = 'acc_mf_1';
    const txs = [
      // Transfer in (SIP investment)
      { accountId: 'acc_bank', toAccountId: invAcc, type: 'transfer' as const, amount: 500000, date: '2026-01-01' },
      // Transfer in
      { accountId: 'acc_bank', toAccountId: invAcc, type: 'transfer' as const, amount: 200000, date: '2026-02-01' },
      // Transfer out (partial redemption)
      { accountId: invAcc, toAccountId: 'acc_bank', type: 'transfer' as const, amount: 100000, date: '2026-03-01' },
      // Direct dividend income (counts as return, NOT principal contribution)
      { accountId: invAcc, type: 'income' as const, amount: 15000, date: '2026-03-15' },
    ];

    const contributions = calculateInvestmentContributions(txs, invAcc);
    // 500000 + 200000 - 100000 = 600000
    expect(contributions).toBe(600000);

    // Current value is 750000
    const gain = calculateInvestmentGain(750000, contributions);
    expect(gain).toBe(150000);
  });
});

describe('Finance Domain Logic: Fixed Deposit & Recurring Deposit', () => {
  it('calculates FD accrued value with all 5 compounding modes', () => {
    const principal = 10000000; // 100,000 INR = 10,000,000 paise
    const rate = 0.08; // 8% p.a.
    const startDate = '2025-01-01';

    // 1 year later
    const asOfDate = '2026-01-01';

    // Compounding frequency helper
    expect(getCompoundingFrequencyCount('monthly')).toBe(12);
    expect(getCompoundingFrequencyCount('quarterly')).toBe(4);
    expect(getCompoundingFrequencyCount('half_yearly')).toBe(2);
    expect(getCompoundingFrequencyCount('yearly')).toBe(1);
    expect(getCompoundingFrequencyCount('simple')).toBe(0);

    // Simple interest: P * (1 + 0.08 * 1) = 10,800,000
    const valSimple = calculateFDAccruedValue({
      principal,
      annualInterestRate: rate,
      compoundingFrequency: 'simple',
      startDate,
      asOfDate,
    });
    expect(valSimple).toBe(10800000);

    // Quarterly compounding: 10,000,000 * (1 + 0.08/4)^4 = 10,824,322 paise
    const valQuarterly = calculateFDAccruedValue({
      principal,
      annualInterestRate: rate,
      compoundingFrequency: 'quarterly',
      startDate,
      asOfDate,
    });
    expect(valQuarterly).toBe(10824322);

    // Monthly compounding: 10,000,000 * (1 + 0.08/12)^12 = 10,829,995 paise
    const valMonthly = calculateFDAccruedValue({
      principal,
      annualInterestRate: rate,
      compoundingFrequency: 'monthly',
      startDate,
      asOfDate,
    });
    expect(valMonthly).toBe(10829995);

    // Maturity helper
    const maturity = calculateFDMaturity({
      principal,
      annualInterestRate: rate,
      compoundingFrequency: 'quarterly',
      startDate,
      tenureMonths: 12,
    });
    expect(maturity.maturityDate).toBe('2026-01-01');
    expect(maturity.maturityAmount).toBe(10824322);
    expect(maturity.totalInterest).toBe(824322);
  });

  it('calculates RD maturity and intermediate accrued value', () => {
    // 5,000 INR per month = 500,000 paise
    // 12 months at 7.5% p.a.
    const monthlyInstallment = 500000;
    const rate = 0.075;
    const startDate = '2025-01-01';

    const rdMaturity = calculateRDMaturity({
      monthlyInstallment,
      annualInterestRate: rate,
      startDate,
      tenureMonths: 12,
    });

    expect(rdMaturity.totalInvested).toBe(6000000);
    // Closed form sum: quarterly compounded RD for 12 months
    // Sum_{k=1}^12 500000 * (1 + 0.075/4)^(k/3) ≈ 6,249,152 paise
    expect(rdMaturity.maturityAmount).toBeGreaterThan(6240000);
    expect(rdMaturity.maturityAmount).toBeLessThan(6260000);
    expect(rdMaturity.totalInterest).toBe(rdMaturity.maturityAmount - rdMaturity.totalInvested);

    // Accrued value at month 6
    const accrued6 = calculateRDAccruedValue({
      monthlyInstallment,
      annualInterestRate: rate,
      startDate,
      tenureMonths: 12,
      asOfDate: '2025-07-01',
    });
    expect(accrued6).toBeGreaterThan(3000000);
    expect(accrued6).toBeLessThan(rdMaturity.maturityAmount);
  });
});

describe('Finance Domain Logic: Net Worth', () => {
  it('computes net worth across asset and liability accounts', () => {
    const accounts = [
      { id: '1', kind: 'bank' as const, class: 'asset' as const, balance: 250000 },
      { id: '2', kind: 'cash' as const, class: 'asset' as const, balance: 15000 },
      // Investment account uses currentValue
      { id: '3', kind: 'stocks' as const, class: 'asset' as const, balance: 500000, currentValue: 650000 },
      // Credit card: balance -30000 (outstanding 30000)
      { id: '4', kind: 'credit_card' as const, class: 'liability' as const, balance: -30000 },
      // Loan: balance 200000 (outstanding 200000)
      { id: '5', kind: 'loan' as const, class: 'liability' as const, balance: 200000 },
      // Inactive account is ignored
      { id: '6', kind: 'bank' as const, class: 'asset' as const, balance: 100000, isActive: false },
    ];

    const result = calculateNetWorth(accounts);
    // Assets: 250000 + 15000 + 650000 = 915000
    expect(result.totalAssets).toBe(915000);
    // Liabilities: 30000 + 200000 = 230000
    expect(result.totalLiabilities).toBe(230000);
    // Net Worth: 915000 - 230000 = 685000
    expect(result.netWorth).toBe(685000);
  });
});
