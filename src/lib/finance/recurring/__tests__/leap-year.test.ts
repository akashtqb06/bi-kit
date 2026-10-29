import { describe, it, expect } from 'vitest';
import { advanceRecurringDate } from '../date-math';

describe('Recurring Rules: Leap Year Behavior', () => {
  it('handles yearly rule starting on February 29 leap day', () => {
    const anchorDay = 29;
    const anchorMonth = 2;
    let current = '2024-02-29';

    // 2025 (non-leap): clamped to Feb 28
    current = advanceRecurringDate(current, 'yearly', 1, anchorDay, anchorMonth);
    expect(current).toBe('2025-02-28');

    // 2026 (non-leap): clamped to Feb 28
    current = advanceRecurringDate(current, 'yearly', 1, anchorDay, anchorMonth);
    expect(current).toBe('2026-02-28');

    // 2027 (non-leap): clamped to Feb 28
    current = advanceRecurringDate(current, 'yearly', 1, anchorDay, anchorMonth);
    expect(current).toBe('2027-02-28');

    // 2028 (leap year): restored to Feb 29!
    current = advanceRecurringDate(current, 'yearly', 1, anchorDay, anchorMonth);
    expect(current).toBe('2028-02-29');
  });

  it('handles 4-year leap cycle interval directly', () => {
    const anchorDay = 29;
    const anchorMonth = 2;
    let current = '2024-02-29';

    // Every 4 years
    current = advanceRecurringDate(current, 'yearly', 4, anchorDay, anchorMonth);
    expect(current).toBe('2028-02-29');

    current = advanceRecurringDate(current, 'yearly', 4, anchorDay, anchorMonth);
    expect(current).toBe('2032-02-29');
  });

  it('handles monthly recurrence starting on Feb 29', () => {
    const anchorDay = 29;
    let current = '2024-02-29';

    // Mar 29, Apr 29, May 29
    current = advanceRecurringDate(current, 'monthly', 1, anchorDay);
    expect(current).toBe('2024-03-29');

    current = advanceRecurringDate(current, 'monthly', 1, anchorDay);
    expect(current).toBe('2024-04-29');

    // Advance 10 more months to Feb 2025
    current = advanceRecurringDate(current, 'monthly', 10, anchorDay);
    expect(current).toBe('2025-02-28'); // Non-leap year clamped to 28

    // Next month: March 2025 restored to 29
    current = advanceRecurringDate(current, 'monthly', 1, anchorDay);
    expect(current).toBe('2025-03-29');
  });
});
