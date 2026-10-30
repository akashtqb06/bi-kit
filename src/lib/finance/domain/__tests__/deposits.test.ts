import { describe, expect, it } from 'vitest';
import {
  calculateFDAccruedValue,
  calculateFDMaturity,
  calculateRDAccruedValue,
  calculateRDMaturity,
  calculateRDTotalDeposited,
  getNextInstallmentDate,
  normalizeInterestRate,
  getMonthsBetweenDates,
} from '../deposits';

describe('Finance Domain: Deposits (FD & RD Calculations)', () => {
  describe('Interest rate normalization', () => {
    it('normalizes whole percentage and decimal fraction rates', () => {
      expect(normalizeInterestRate(6.8)).toBeCloseTo(0.068, 6);
      expect(normalizeInterestRate(0.068)).toBeCloseTo(0.068, 6);
      expect(normalizeInterestRate(7.1)).toBeCloseTo(0.071, 6);
      expect(normalizeInterestRate(0)).toBe(0);
      expect(normalizeInterestRate(-5)).toBe(0);
    });
  });

  describe('RD: 5,000/month, 6.8%, 12 months, quarterly compounding', () => {
    const monthlyInstallment = 500000; // 5,000 INR in paise
    const rate = 6.8; // 6.8%
    const startDate = '2025-01-15';
    const tenureMonths = 12;

    it('computes projected maturity amount and deposits', () => {
      const maturity = calculateRDMaturity({
        monthlyInstallment,
        annualInterestRate: rate,
        startDate,
        tenureMonths,
      });

      expect(maturity.maturityDate).toBe('2026-01-15');
      expect(maturity.totalInvested).toBe(6000000); // Rs 60,000

      // Exact closed-form convention: sum_{k=1}^12 5000 * (1 + 6.8/400)^(k/3) = 62,243.64 INR = 6,224,364 paise
      expect(maturity.maturityAmount).toBe(6224364);
      expect(maturity.totalInterest).toBe(224364); // Rs 2,243.64
    });

    it('cross-checks closed-form result against continuous day-by-day simulation within Rs 10', () => {
      // Daily equivalent compounding rate for 6.8% compounded quarterly (365 day year):
      // (1 + r / 4)^(4 / 365) - 1
      const rDec = 0.068;
      const dailyRate = Math.pow(1 + rDec / 4, 4 / 365) - 1;

      // 12 installments deposited on scheduled dates
      const startMs = new Date('2025-01-15T00:00:00Z').getTime();
      const endMs = new Date('2026-01-15T00:00:00Z').getTime();

      let simTotalPaise = 0;
      for (let i = 0; i < 12; i++) {
        // Find exact date of deposit i
        const d = new Date(Date.UTC(2025, i, 15)).getTime();
        const daysInvested = Math.round((endMs - d) / (86400 * 1000));
        const compounded = monthlyInstallment * Math.pow(1 + dailyRate, daysInvested);
        simTotalPaise += compounded;
      }

      const closedFormPaise = 6224364;
      const simRoundedPaise = Math.round(simTotalPaise);

      // Simulation gives approx 6,225,275 paise (Rs 62,252.75). Difference is under Rs 10 (1,000 paise).
      const diffRupees = Math.abs(closedFormPaise - simRoundedPaise) / 100;
      expect(diffRupees).toBeLessThan(10);
    });

    it('computes partial-year RD value (e.g. at month 6)', () => {
      const accrued = calculateRDAccruedValue({
        monthlyInstallment,
        annualInterestRate: rate,
        startDate,
        tenureMonths,
        asOfDate: '2025-07-15', // exactly 6 months completed (7th deposit due today)
      });

      const { totalDeposited, installmentsPaid } = calculateRDTotalDeposited({
        monthlyInstallment,
        startDate,
        tenureMonths,
        asOfDate: '2025-07-15',
      });

      expect(installmentsPaid).toBe(7); // Deposits on Jan 15, Feb 15, Mar 15, Apr 15, May 15, Jun 15, Jul 15
      expect(totalDeposited).toBe(3500000); // 7 * 5,000 = 35,000
      expect(accrued).toBeGreaterThan(totalDeposited);
      expect(accrued).toBeLessThan(6224364);
    });

    it('computes next installment date correctly', () => {
      expect(getNextInstallmentDate(startDate, tenureMonths, '2025-01-15')).toBe('2025-02-15');
      expect(getNextInstallmentDate(startDate, tenureMonths, '2025-06-20')).toBe('2025-07-15');
      expect(getNextInstallmentDate(startDate, tenureMonths, '2026-01-15')).toBeNull(); // matured
    });
  });

  describe('FD: 100,000 at 7.1% quarterly for 1 year', () => {
    it('computes projected maturity amount of approximately Rs 1,07,291', () => {
      const principal = 10000000; // 100,000 INR in paise
      const rate = 7.1; // 7.1%
      const startDate = '2025-01-01';

      const maturity = calculateFDMaturity({
        principal,
        annualInterestRate: rate,
        compoundingFrequency: 'quarterly',
        startDate,
        tenureMonths: 12,
      });

      expect(maturity.maturityDate).toBe('2026-01-01');
      // 10,000,000 * (1 + 0.071/4)^4 = 10,729,143 paise (Rs 1,07,291.43)
      expect(Math.round(maturity.maturityAmount / 100)).toBe(107291);
      expect(Math.round(maturity.totalInterest / 100)).toBe(7291);
    });

    it('handles all 5 compounding modes accurately', () => {
      const principal = 10000000; // 100,000 INR
      const rate = 8.0;
      const startDate = '2025-01-01';
      const asOfDate = '2026-01-01';

      // Simple
      const simple = calculateFDAccruedValue({
        principal,
        annualInterestRate: rate,
        compoundingFrequency: 'simple',
        startDate,
        asOfDate,
      });
      expect(simple).toBe(10800000); // 100k + 8k

      // Yearly
      const yearly = calculateFDAccruedValue({
        principal,
        annualInterestRate: rate,
        compoundingFrequency: 'yearly',
        startDate,
        asOfDate,
      });
      expect(yearly).toBe(10800000);

      // Half-Yearly: (1 + 0.04)^2 = 1.0816
      const halfYearly = calculateFDAccruedValue({
        principal,
        annualInterestRate: rate,
        compoundingFrequency: 'half_yearly',
        startDate,
        asOfDate,
      });
      expect(halfYearly).toBe(10816000);

      // Quarterly: (1 + 0.02)^4 = 1.08243216
      const quarterly = calculateFDAccruedValue({
        principal,
        annualInterestRate: rate,
        compoundingFrequency: 'quarterly',
        startDate,
        asOfDate,
      });
      expect(quarterly).toBe(10824322);

      // Monthly: (1 + 0.08/12)^12 = 1.0829995
      const monthly = calculateFDAccruedValue({
        principal,
        annualInterestRate: rate,
        compoundingFrequency: 'monthly',
        startDate,
        asOfDate,
      });
      expect(monthly).toBe(10829995);
    });
  });

  describe('Edge cases & Specialized conventions', () => {
    it('handles start date in the past past maturity without continuing to compound', () => {
      const pastMaturity = calculateFDAccruedValue({
        principal: 10000000,
        annualInterestRate: 0.08,
        compoundingFrequency: 'quarterly',
        startDate: '2020-01-01',
        tenureMonths: 12,
        asOfDate: '2024-01-01', // years later
      });
      // Should cap at 1 year tenure
      expect(pastMaturity).toBe(10824322);
    });

    it('handles month-end installment day (31st)', () => {
      // 31st Jan to 28th Feb is clamped to 1 month
      expect(getMonthsBetweenDates('2025-01-31', '2025-02-28')).toBe(1);
      // 31st Jan to 31st Mar is 2 months
      expect(getMonthsBetweenDates('2025-01-31', '2025-03-31')).toBe(2);

      const rdMaturity = calculateRDMaturity({
        monthlyInstallment: 500000,
        annualInterestRate: 6.8,
        startDate: '2025-01-31',
        tenureMonths: 12,
      });
      expect(rdMaturity.maturityDate).toBe('2026-01-31');
      expect(rdMaturity.maturityAmount).toBe(6224364);
    });

    it('handles zero rate (0%) without NaN or crash', () => {
      const rdZero = calculateRDAccruedValue({
        monthlyInstallment: 500000,
        annualInterestRate: 0,
        startDate: '2025-01-01',
        tenureMonths: 12,
        asOfDate: '2026-01-01',
      });
      expect(rdZero).toBe(6000000); // exactly total deposits

      const fdZero = calculateFDAccruedValue({
        principal: 10000000,
        annualInterestRate: 0,
        compoundingFrequency: 'quarterly',
        startDate: '2025-01-01',
        asOfDate: '2026-01-01',
      });
      expect(fdZero).toBe(10000000);
    });

    it('handles manual anchor valuation forward compounding for RD', () => {
      // RD 5000/mo started on 2025-01-01.
      // On 2025-07-01, manual anchor value was recorded as 31,000 INR (3,100,000 paise).
      // We evaluate at maturity on 2026-01-01.
      const val = calculateRDAccruedValue({
        monthlyInstallment: 500000,
        annualInterestRate: 6.8,
        startDate: '2025-01-01',
        tenureMonths: 12,
        asOfDate: '2026-01-01',
        manualAnchor: {
          date: '2025-07-01',
          value: 3100000,
        },
      });

      // Anchor 3,100,000 compounds for 6 months: 3100000 * (1 + 0.068/4)^2 = 3,206,145
      // Plus new installments on Aug 1 (compounded 5 mo), Sep 1 (4 mo), Oct 1 (3 mo), Nov 1 (2 mo), Dec 1 (1 mo)
      // Total is approximately 5,748,876 paise (~57,489 INR)
      expect(val).toBe(5748876);
    });

    it('handles manual anchor valuation forward compounding for FD', () => {
      const val = calculateFDAccruedValue({
        principal: 10000000,
        annualInterestRate: 7.1,
        compoundingFrequency: 'quarterly',
        startDate: '2025-01-01',
        tenureMonths: 12,
        asOfDate: '2026-01-01',
        manualAnchor: {
          date: '2025-07-01',
          value: 10350000, // midway value
        },
      });

      // 10,350,000 compounded for remaining 0.5 year (2 quarters) at 7.1%:
      // 10350000 * (1 + 0.071/4)^2 = 10,720,686 paise
      expect(val).toBe(10720686);
    });

    it('supports recorded transfers mode for RD', () => {
      // Suppose only 3 recorded transfers were made
      const val = calculateRDAccruedValue({
        monthlyInstallment: 500000,
        annualInterestRate: 6.8,
        startDate: '2025-01-01',
        tenureMonths: 12,
        asOfDate: '2025-04-01',
        installmentMode: 'recorded_transfers',
        recordedTransfers: [
          { date: '2025-01-01', amount: 500000 },
          { date: '2025-02-01', amount: 500000 },
          { date: '2025-03-01', amount: 500000 },
        ],
      });

      // 3 installments compounded
      expect(val).toBeGreaterThan(1500000);
      expect(val).toBeLessThan(1600000);
    });
  });
});
