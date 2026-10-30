import { todayInTz, currentMonthStartInTz, currentMonthEndInTz, previousMonthRangeInTz } from './timezone';
import { describe, it, expect, vi, afterEach } from 'vitest';

describe('timezone helpers', () => {
  const mockDateIST = (isoUtc: string) => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(isoUtc));
  };

  afterEach(() => {
    vi.useRealTimers();
  });

  it('todayInTz at 00:30 IST (UTC 19:00 prev day) returns correct IST date', () => {
    // 00:30 IST = 2026-10-30 00:30 IST = 2026-10-29 19:00 UTC
    mockDateIST('2026-10-29T19:00:00.000Z');
    expect(todayInTz('Asia/Kolkata')).toBe('2026-10-30');
  });

  it('todayInTz at 23:30 IST', () => {
    // 23:30 IST = 2026-10-30 23:30 IST = 2026-10-30 18:00 UTC
    mockDateIST('2026-10-30T18:00:00.000Z');
    expect(todayInTz('Asia/Kolkata')).toBe('2026-10-30');
  });

  it('currentMonthStartInTz in October', () => {
    mockDateIST('2026-10-15T12:00:00.000Z');
    expect(currentMonthStartInTz('Asia/Kolkata')).toBe('2026-10-01');
  });

  it('currentMonthEndInTz in October (31 days)', () => {
    mockDateIST('2026-10-15T12:00:00.000Z');
    expect(currentMonthEndInTz('Asia/Kolkata')).toBe('2026-10-31');
  });

  it('previousMonthRangeInTz at month boundary', () => {
    // November 1st IST = October still for UTC depending on time
    mockDateIST('2026-11-01T12:00:00.000Z');
    const range = previousMonthRangeInTz('Asia/Kolkata');
    expect(range.start).toBe('2026-10-01');
    expect(range.end).toBe('2026-10-31');
  });
});

