import { describe, it, expect } from 'vitest';
import {
  calculateFyInterestEstimate,
  checkPassbookStaleness,
  computeVirtualNextContribution,
  getFyFromDate,
  getFyMonths,
  type PfEntryLike,
} from '../interest';

describe('EPF Interest Estimation and Staleness Tests', () => {
  it('correctly maps FY and generates 12 financial year months (April - March)', () => {
    expect(getFyFromDate('2026-05-15')).toBe('2026-27');
    expect(getFyFromDate('2027-02-10')).toBe('2026-27');
    expect(getFyFromDate('2026-03-31')).toBe('2025-26');

    const months = getFyMonths('2026-27');
    expect(months.length).toBe(12);
    expect(months[0]).toBe('2026-04');
    expect(months[11]).toBe('2027-03');
  });

  it('matches prompt estimate vector: running balance 1,00,000 at 8.25% yields 687.50 month 1; after 4,800 contribution yields 720.50 month 2', () => {
    // 1,00,000 rupees = 10,000,000 paise opening
    // 4,800 contribution in month 1 (2026-04)
    const entries: PfEntryLike[] = [
      {
        entryKind: 'opening',
        periodMonth: '2026-04',
        postedDate: '2026-04-01',
        dateApprox: false,
        epfWages: 0,
        epsWages: 0,
        employeeAmount: 7000000, // 70,000
        employerAmount: 3000000, // 30,000
        pensionAmount: 0,
      },
      {
        entryKind: 'contribution',
        periodMonth: '2026-04',
        postedDate: '2026-04-30',
        dateApprox: false,
        epfWages: 4000000,
        epsWages: 1500000,
        employeeAmount: 300000, // 3,000
        employerAmount: 180000, // 1,800 (total employee + employer = 4,800)
        pensionAmount: 125000,
      },
    ];

    // Compute estimate through Month 2 (2026-05)
    const est = calculateFyInterestEstimate(entries, '2026-27', 8.25, '2026-05');

    expect(est.monthlyBreakdown.length).toBe(2);

    // Month 1 (2026-04): start balance = 1,00,000 (10,000,000 paise)
    // Interest = 687.50 rupees = 68750 paise
    const m1 = est.monthlyBreakdown[0];
    expect(m1.month).toBe('2026-04');
    expect(m1.startBalance).toBe(10000000);
    expect(m1.interest).toBe(68750);

    // Month 2 (2026-05): start balance = 1,00,000 + 4,800 = 1,04,800 (10,480,000 paise)
    // Interest = 720.50 rupees = 72050 paise
    const m2 = est.monthlyBreakdown[1];
    expect(m2.month).toBe('2026-05');
    expect(m2.startBalance).toBe(10480000);
    expect(m2.interest).toBe(72050);

    expect(est.totalAccruedInterest).toBe(68750 + 72050);
  });

  it('suppresses estimate if rate is not set (rate editable per FY with no default)', () => {
    const entries: PfEntryLike[] = [
      {
        entryKind: 'opening',
        periodMonth: '2026-04',
        employeeAmount: 10000000,
        employerAmount: 0,
        pensionAmount: 0,
      },
    ];

    const est = calculateFyInterestEstimate(entries, '2026-27', null);
    expect(est.totalAccruedInterest).toBe(0);
    expect(est.monthlyBreakdown.length).toBe(0);
    expect(est.rate).toBeNull();
  });

  it('suppresses estimate when passbook already contains an interest_credit entry for that FY', () => {
    const entries: PfEntryLike[] = [
      {
        entryKind: 'opening',
        periodMonth: '2026-04',
        employeeAmount: 10000000,
        employerAmount: 0,
        pensionAmount: 0,
      },
      {
        entryKind: 'interest_credit',
        periodMonth: '2026-27',
        postedDate: '2027-03-31',
        employeeAmount: 825000,
        employerAmount: 0,
        pensionAmount: 0,
      },
    ];

    const est = calculateFyInterestEstimate(entries, '2026-27', 8.25);
    expect(est.hasCreditedInterest).toBe(true);
    expect(est.totalAccruedInterest).toBe(0);
  });

  it('correctly calculates staleness when latest entry is older than 35 days', () => {
    const freshEntries: PfEntryLike[] = [
      {
        entryKind: 'contribution',
        postedDate: '2026-10-20',
        employeeAmount: 50000,
        employerAmount: 30000,
        pensionAmount: 12000,
      },
    ];

    // As of 2026-11-02 (13 days later) => not stale
    const freshCheck = checkPassbookStaleness(freshEntries, '2026-11-02');
    expect(freshCheck.isStale).toBe(false);
    expect(freshCheck.staleDays).toBe(13);

    // As of 2026-12-05 (46 days later) => stale
    const staleCheck = checkPassbookStaleness(freshEntries, '2026-12-05');
    expect(staleCheck.isStale).toBe(true);
    expect(staleCheck.staleDays).toBe(46);
  });

  it('computes virtual next expected contribution without saving rows', () => {
    const entries: PfEntryLike[] = [
      {
        entryKind: 'contribution',
        periodMonth: '2026-05',
        employeeAmount: 336000,
        employerAmount: 211000,
        pensionAmount: 125000,
      },
      {
        entryKind: 'contribution',
        periodMonth: '2026-10',
        employeeAmount: 560000,
        employerAmount: 396200,
        pensionAmount: 163800,
      },
    ];

    const nextForecast = computeVirtualNextContribution(entries);
    expect(nextForecast).not.toBeNull();
    expect(nextForecast?.employee).toBe(560000);
    expect(nextForecast?.employer).toBe(396200);
    expect(nextForecast?.pension).toBe(163800);
  });
});
