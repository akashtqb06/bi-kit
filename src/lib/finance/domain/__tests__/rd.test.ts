import { describe, it, expect } from 'vitest';
import {
  generateSchedule,
  rdValue,
  changeInstallmentDay,
  getDaysDifference,
  deriveMaturityDate,
  type RDConfig,
} from '../rd';

describe('Recurring Deposit (RD) Domain Logic', () => {
  describe('User Example - Core Schedule & Status', () => {
    // Main case from user specification:
    // RD started on 18 Aug 2026 with installments on the 2nd of every month, 12 months.
    const baseConfig: RDConfig = {
      monthlyInstallment: 500000, // 5,000 INR in paise
      startDate: '2026-08-18',
      installmentDay: 2,
      firstInstallmentOn: 'start_date',
      tenureMonths: 12,
      interestRate: 6.8,
      compounding: 'quarterly',
    };

    it('generates the exact 12-month installment schedule and derived maturity date', () => {
      const schedule = generateSchedule(baseConfig, '2026-11-01');
      expect(schedule).toHaveLength(12);

      const expectedDates = [
        '2026-08-18', // 1: startDate
        '2026-09-02', // 2: Sep 2
        '2026-10-02', // 3: Oct 2
        '2026-11-02', // 4: Nov 2
        '2026-12-02', // 5: Dec 2
        '2027-01-02', // 6: Jan 2
        '2027-02-02', // 7: Feb 2
        '2027-03-02', // 8: Mar 2
        '2027-04-02', // 9: Apr 2
        '2027-05-02', // 10: May 2
        '2027-06-02', // 11: Jun 2
        '2027-07-02', // 12: Jul 2
      ];

      expect(schedule.map((s) => s.dueDate)).toEqual(expectedDates);

      const maturity = deriveMaturityDate(baseConfig.startDate, baseConfig.tenureMonths);
      expect(maturity).toBe('2027-08-18');
    });

    it('evaluates status correctly as of 2026-11-01 (3 paid, next 2026-11-02)', () => {
      const res = rdValue(baseConfig, '2026-11-01');
      expect(res.installmentsPaid).toBe(3);
      expect(res.nextInstallmentDate).toBe('2026-11-02');
      expect(res.totalDeposited).toBe(1500000); // 3 * 5000 INR = 15,000 INR
    });

    it('evaluates status correctly as of 2026-11-02 (4 paid, next 2026-12-02)', () => {
      const res = rdValue(baseConfig, '2026-11-02');
      expect(res.installmentsPaid).toBe(4);
      expect(res.nextInstallmentDate).toBe('2026-12-02');
      expect(res.totalDeposited).toBe(2000000); // 4 * 5000 INR = 20,000 INR
    });

    it('generates schedule with firstInstallmentOn: first_installment_day', () => {
      const config: RDConfig = {
        ...baseConfig,
        firstInstallmentOn: 'first_installment_day',
      };
      const schedule = generateSchedule(config, '2026-11-01');
      expect(schedule).toHaveLength(12);

      // Start is 2026-08-18, day is 2. First occurrence after Aug 18 is 2026-09-02.
      expect(schedule[0].dueDate).toBe('2026-09-02');
      expect(schedule[1].dueDate).toBe('2026-10-02');
      expect(schedule[11].dueDate).toBe('2027-08-02');
    });
  });

  describe('Day Clamping, Leap Years, and Last Day of Month', () => {
    it('clamps day 31 to 30-day months and Feb 28 in non-leap year', () => {
      const config: RDConfig = {
        monthlyInstallment: 100000,
        startDate: '2025-01-31',
        installmentDay: 31,
        firstInstallmentOn: 'start_date',
        tenureMonths: 5,
        interestRate: 7.0,
      };

      const schedule = generateSchedule(config, '2025-06-01');
      const dates = schedule.map((s) => s.dueDate);
      expect(dates).toEqual([
        '2025-01-31',
        '2025-02-28', // Feb 2025 has 28 days
        '2025-03-31', // Mar has 31 days
        '2025-04-30', // Apr has 30 days
        '2025-05-31', // May has 31 days
      ]);
    });

    it('clamps day 31 to Feb 29 in a leap year (2024)', () => {
      const config: RDConfig = {
        monthlyInstallment: 100000,
        startDate: '2024-01-31',
        installmentDay: 31,
        firstInstallmentOn: 'start_date',
        tenureMonths: 3,
        interestRate: 7.0,
      };

      const schedule = generateSchedule(config, '2024-04-01');
      expect(schedule[1].dueDate).toBe('2024-02-29'); // Leap day
    });

    it('supports "last" day option correctly across all months', () => {
      const config: RDConfig = {
        monthlyInstallment: 100000,
        startDate: '2026-01-15',
        installmentDay: 'last',
        firstInstallmentOn: 'start_date',
        tenureMonths: 4,
        interestRate: 7.0,
      };

      const schedule = generateSchedule(config, '2026-05-01');
      const dates = schedule.map((s) => s.dueDate);
      expect(dates).toEqual([
        '2026-01-15', // 1: startDate
        '2026-02-28', // 2: Feb last
        '2026-03-31', // 3: Mar last
        '2026-04-30', // 4: Apr last
      ]);
    });
  });

  describe('Installment Day History and Date Changes', () => {
    it('leaves earlier dates unchanged when changing installment day from an effective month', () => {
      const initialConfig: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 6.8,
      };

      // Change day to 15 effective from November 2026 (2026-11)
      const updatedConfig = changeInstallmentDay(initialConfig, 15, '2026-11');
      const schedule = generateSchedule(updatedConfig, '2027-08-18');

      // Before November: remains on 2nd
      expect(schedule[0].dueDate).toBe('2026-08-18'); // start
      expect(schedule[1].dueDate).toBe('2026-09-02');
      expect(schedule[2].dueDate).toBe('2026-10-02');

      // From November onwards: shifts to 15th
      expect(schedule[3].dueDate).toBe('2026-11-15');
      expect(schedule[4].dueDate).toBe('2026-12-15');
      expect(schedule[5].dueDate).toBe('2027-01-15');
      expect(schedule[11].dueDate).toBe('2027-07-15');
    });
  });

  describe('Skipped & Boundary Tenures', () => {
    it('handles skipped installments without altering other installments', () => {
      const config: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 6,
        interestRate: 6.8,
        skippedInstallments: ['2026-10-02'],
      };

      const res = rdValue(config, '2026-11-01');
      const schedule = res.schedule;
      expect(schedule[2].dueDate).toBe('2026-10-02');
      expect(schedule[2].status).toBe('skipped');
      // Only Aug 18 and Sep 2 are paid
      expect(res.installmentsPaid).toBe(2);
      expect(res.totalDeposited).toBe(1000000);
    });

    it('handles tenure 1 month', () => {
      const config: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 1,
        interestRate: 6.8,
      };

      const schedule = generateSchedule(config, '2026-08-18');
      expect(schedule).toHaveLength(1);
      expect(schedule[0].dueDate).toBe('2026-08-18');
    });

    it('handles tenure 60 months (5 years)', () => {
      const config: RDConfig = {
        monthlyInstallment: 200000,
        startDate: '2025-01-01',
        installmentDay: 1,
        firstInstallmentOn: 'start_date',
        tenureMonths: 60,
        interestRate: 7.1,
      };

      const schedule = generateSchedule(config, '2030-01-01');
      expect(schedule).toHaveLength(60);
      expect(schedule[59].dueDate).toBe('2029-12-01');
      const mat = deriveMaturityDate(config.startDate, config.tenureMonths);
      expect(mat).toBe('2030-01-01');
    });
  });

  describe('Valuation Math & Continuous Simulation Cross-Check', () => {
    it('produces exact reported numbers for 5,000/mo, 6.8%, quarterly, 12 months', () => {
      const config: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 6.8,
        compounding: 'quarterly',
      };

      // Maturity calculation
      const atMaturity = rdValue(config, '2027-08-18');
      expect(atMaturity.totalDeposited).toBe(6000000); // 60,000 INR in paise
      expect(atMaturity.projectedMaturityValue).toBe(6241054); // ₹62,410.54
      expect(atMaturity.interestAccrued).toBe(241054); // ₹2,410.54

      // As of 2026-11-01 (3 paid)
      const asOf1 = rdValue(config, '2026-11-01');
      expect(asOf1.installmentsPaid).toBe(3);
      expect(asOf1.totalDeposited).toBe(1500000); // ₹15,000
      expect(asOf1.currentValue).toBe(1515327); // ₹15,153.27
      expect(asOf1.interestAccrued).toBe(15327); // ₹153.27
      expect(asOf1.nextInstallmentDate).toBe('2026-11-02');

      // As of 2026-11-02 (4 paid)
      const asOf2 = rdValue(config, '2026-11-02');
      expect(asOf2.installmentsPaid).toBe(4);
      expect(asOf2.totalDeposited).toBe(2000000); // ₹20,000
      expect(asOf2.currentValue).toBe(2015607); // ₹20,156.07
      expect(asOf2.interestAccrued).toBe(15607); // ₹156.07
      expect(asOf2.nextInstallmentDate).toBe('2026-12-02');
    });

    it('cross-checks rdValue against day-by-day continuous compounding simulation within 1 rupee tolerance', () => {
      const config: RDConfig = {
        monthlyInstallment: 1000000, // 10,000 INR
        startDate: '2026-01-10',
        installmentDay: 10,
        firstInstallmentOn: 'start_date',
        tenureMonths: 24,
        interestRate: 7.25,
        compounding: 'quarterly',
      };

      const asOf = '2027-03-15';
      const res = rdValue(config, asOf);

      // Simulation: Day-by-day calculation summing for each installment
      // with exact daily compounding: value = R * (1 + r/(100*4))^(4 * days/365)
      const schedule = generateSchedule(config, asOf);
      let simTotal = 0;
      for (const item of schedule) {
        if (item.status === 'paid') {
          const days = getDaysDifference(item.dueDate, asOf);
          const val = item.amount * Math.pow(1 + 7.25 / 400, (4 * days) / 365.0);
          simTotal += val;
        }
      }

      // Difference in paise should be within 100 paise (1 Rupee)
      const diffPaise = Math.abs(res.currentValue - Math.round(simTotal));
      expect(diffPaise).toBeLessThanOrEqual(100);
    });

    it('handles zero interest rate correctly', () => {
      const config: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 0,
      };

      const res = rdValue(config, '2026-11-01');
      expect(res.currentValue).toBe(1500000);
      expect(res.interestAccrued).toBe(0);
      expect(res.projectedMaturityValue).toBe(6000000);
    });

    it('handles manual anchor accurately by compounding anchor forward and adding subsequent installments', () => {
      const config: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 6.8,
        compounding: 'quarterly',
      };

      // Passbook anchor recorded on 2026-10-15: ₹15,100.00 (1,510,000 paise)
      const anchor = { date: '2026-10-15', value: 1510000 };
      const res = rdValue(config, '2026-11-05', anchor);

      // On 2026-11-05:
      // Anchor (₹15,100) has compounded from 2026-10-15 to 2026-11-05 (21 days)
      // Plus 4th installment (2026-11-02) compounded from 2026-11-02 to 2026-11-05 (3 days)
      expect(res.installmentsPaid).toBe(4);
      expect(res.currentValue).toBeGreaterThan(1510000 + 500000);
    });

    it('calculates value in recorded mode strictly from actual transfers', () => {
      const config: RDConfig = {
        monthlyInstallment: 500000,
        startDate: '2026-08-18',
        installmentDay: 2,
        firstInstallmentOn: 'start_date',
        tenureMonths: 12,
        interestRate: 6.8,
        installmentsMode: 'recorded',
        recordedTransfers: [
          { date: '2026-08-18', amount: 500000 },
          { date: '2026-09-05', amount: 500000 }, // paid on 5th
        ],
      };

      const res = rdValue(config, '2026-11-01');
      expect(res.installmentsPaid).toBe(2);
      expect(res.totalDeposited).toBe(1000000);
      expect(res.schedule[0].status).toBe('paid');
      expect(res.schedule[1].status).toBe('paid');
      expect(res.schedule[1].paidDate).toBe('2026-09-05');
      expect(res.schedule[2].status).toBe('due'); // 3rd installment overdue
    });
  });
});
