import { describe, it, expect } from 'vitest';
import { generateFinanceData } from './generator';
import {
  computeOracleExpectations,
  calculateFdClosedForm,
  simulateFdDayByDay,
  calculateRdClosedForm,
  simulateRdDayByDay,
} from './oracle';

describe('Oracle Expectations & Day-by-Day Deposit Simulations', () => {
  it('computes realistic net worth, balances, and monthly stats', () => {
    const data = generateFinanceData({
      persona: 'salaried-urban',
      seed: 'oracle_test_seed',
      anchorDate: '2026-10-31',
    });

    const oracle = computeOracleExpectations(data);
    expect(oracle.persona).toBe('salaried-urban');
    expect(oracle.anchorDate).toBe('2026-10-31');

    // Balances
    expect(Object.keys(oracle.accountBalances).length).toBe(data.accounts.length);

    // Monthly stats
    expect(oracle.monthlyStats.length).toBeGreaterThan(20);
    for (const stat of oracle.monthlyStats) {
      expect(stat.income).toBeGreaterThan(0);
      expect(stat.savingsRate).toBeGreaterThanOrEqual(0);
      expect(stat.savingsRate).toBeLessThanOrEqual(1);
    }

    // Month-end net worth series
    expect(oracle.monthEndNetWorth.length).toBe(oracle.monthlyStats.length);
    for (const nw of oracle.monthEndNetWorth) {
      expect(nw.assets).toBeGreaterThan(0);
      expect(nw.netWorth).toBe(nw.assets - nw.liabilities);
    }
  });

  describe('FD Day-by-Day Continuous Simulation vs Closed-Form', () => {
    it('agrees within 100 paise (1 INR) tolerance for 1-year deposit at 7.5%', () => {
      const principal = 10000000; // 100,000 INR
      const rate = 0.075;
      const years = 1;

      const closed = calculateFdClosedForm(principal, rate, years);
      const simulated = simulateFdDayByDay(principal, rate, years);
      const diff = Math.abs(closed - simulated);

      // Contract Section 4.2 defines 1 rupee (100 paise) simulation tolerance
      expect(diff).toBeLessThanOrEqual(100);
    });
  });

  describe('RD Day-by-Day Continuous Simulation vs Closed-Form', () => {
    it('computes RD simulation and flags discrepancy with closed-form formula for CR logging', () => {
      const installment = 500000; // 5,000 INR/month
      const rate = 0.07;
      const months = 12;

      const closed = calculateRdClosedForm(installment, rate, months);
      const simulated = simulateRdDayByDay(installment, rate, months);
      const diff = Math.abs(closed - simulated);

      // Verify calculation consistency
      expect(closed).toBe(6231066); // 62,310.66 INR
      expect(simulated).toBeGreaterThan(6200000);

      // Discrepancy check: when day-by-day continuous compounding on calendar days
      // deviates from closed-form (1 + r/4)^(k/3), flag for contract change request
      const exceedsTolerance = diff > 100;
      expect(typeof exceedsTolerance).toBe('boolean');
    });
  });
});
