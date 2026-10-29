import { describe, it, expect } from 'vitest';
import {
  advanceRecurringDate,
  clampDayToMonth,
  getDaysInMonth,
  isLeapYear,
} from '../date-math';

describe('Recurring Rules: Month-End Clamping', () => {
  it('correctly reports days in month and leap years', () => {
    expect(isLeapYear(2024)).toBe(true);
    expect(isLeapYear(2025)).toBe(false);
    expect(isLeapYear(2026)).toBe(false);
    expect(isLeapYear(2028)).toBe(true);
    expect(isLeapYear(2000)).toBe(true);
    expect(isLeapYear(1900)).toBe(false);

    // Days in each month
    expect(getDaysInMonth(2024, 1)).toBe(31);
    expect(getDaysInMonth(2024, 2)).toBe(29); // Leap year
    expect(getDaysInMonth(2025, 2)).toBe(28); // Non-leap year
    expect(getDaysInMonth(2024, 3)).toBe(31);
    expect(getDaysInMonth(2024, 4)).toBe(30);
    expect(getDaysInMonth(2024, 5)).toBe(31);
    expect(getDaysInMonth(2024, 6)).toBe(30);
    expect(getDaysInMonth(2024, 7)).toBe(31);
    expect(getDaysInMonth(2024, 8)).toBe(31);
    expect(getDaysInMonth(2024, 9)).toBe(30);
    expect(getDaysInMonth(2024, 10)).toBe(31);
    expect(getDaysInMonth(2024, 11)).toBe(30);
    expect(getDaysInMonth(2024, 12)).toBe(31);
  });

  it('clamps day 31 across all 12 months in a leap year (2024)', () => {
    const anchorDay = 31;
    let current = '2024-01-31';

    const expectedSequence = [
      '2024-02-29', // Feb clamped to 29
      '2024-03-31', // Mar restored to 31
      '2024-04-30', // Apr clamped to 30
      '2024-05-31', // May restored to 31
      '2024-06-30', // Jun clamped to 30
      '2024-07-31', // Jul 31
      '2024-08-31', // Aug 31
      '2024-09-30', // Sep clamped to 30
      '2024-10-31', // Oct 31
      '2024-11-30', // Nov clamped to 30
      '2024-12-31', // Dec 31
      '2025-01-31', // Jan 31
    ];

    for (const expected of expectedSequence) {
      current = advanceRecurringDate(current, 'monthly', 1, anchorDay);
      expect(current).toBe(expected);
    }
  });

  it('clamps day 31 in a non-leap year (2025) to Feb 28 and restores to Mar 31', () => {
    const anchorDay = 31;
    const jan31 = '2025-01-31';
    const feb = advanceRecurringDate(jan31, 'monthly', 1, anchorDay);
    expect(feb).toBe('2025-02-28');

    const mar = advanceRecurringDate(feb, 'monthly', 1, anchorDay);
    expect(mar).toBe('2025-03-31');

    const apr = advanceRecurringDate(mar, 'monthly', 1, anchorDay);
    expect(apr).toBe('2025-04-30');
  });

  it('clamps day 30 correctly (Feb clamped to 28/29, April has 30)', () => {
    const anchorDay = 30;
    const jan30 = '2024-01-30';
    const feb2024 = advanceRecurringDate(jan30, 'monthly', 1, anchorDay);
    expect(feb2024).toBe('2024-02-29');

    const mar2024 = advanceRecurringDate(feb2024, 'monthly', 1, anchorDay);
    expect(mar2024).toBe('2024-03-30');

    const jan2025 = '2025-01-30';
    const feb2025 = advanceRecurringDate(jan2025, 'monthly', 1, anchorDay);
    expect(feb2025).toBe('2025-02-28');
  });

  it('handles quarterly intervals with day 31 clamping', () => {
    const anchorDay = 31;
    let current = '2024-01-31';

    current = advanceRecurringDate(current, 'quarterly', 1, anchorDay);
    expect(current).toBe('2024-04-30'); // April clamped to 30

    current = advanceRecurringDate(current, 'quarterly', 1, anchorDay);
    expect(current).toBe('2024-07-31'); // July restored to 31

    current = advanceRecurringDate(current, 'quarterly', 1, anchorDay);
    expect(current).toBe('2024-10-31'); // October 31

    current = advanceRecurringDate(current, 'quarterly', 1, anchorDay);
    expect(current).toBe('2025-01-31'); // January 31
  });

  it('clampDayToMonth bounds values strictly between 1 and daysInMonth', () => {
    expect(clampDayToMonth(2024, 2, 0)).toBe(1);
    expect(clampDayToMonth(2024, 2, 35)).toBe(29);
    expect(clampDayToMonth(2025, 2, 35)).toBe(28);
    expect(clampDayToMonth(2024, 4, 31)).toBe(30);
  });
});
