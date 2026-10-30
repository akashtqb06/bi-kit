import {
  todayInTz,
  currentMonthStartInTz,
  currentMonthEndInTz,
  previousMonthRangeInTz,
  getPresetDateRange,
  getPreviousPeriodRange,
  formatDateRangeDisplay,
} from './timezone';
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

  describe('getPresetDateRange', () => {
    it('computes this_month range accurately', () => {
      mockDateIST('2026-10-15T12:00:00.000Z');
      const range = getPresetDateRange('this_month', 'Asia/Kolkata');
      expect(range.from).toBe('2026-10-01');
      expect(range.to).toBe('2026-10-31');
    });

    it('computes last_month range accurately', () => {
      mockDateIST('2026-10-15T12:00:00.000Z');
      const range = getPresetDateRange('last_month', 'Asia/Kolkata');
      expect(range.from).toBe('2026-09-01');
      expect(range.to).toBe('2026-09-30');
    });

    it('computes last_3_months range accurately', () => {
      mockDateIST('2026-10-15T12:00:00.000Z');
      const range = getPresetDateRange('last_3_months', 'Asia/Kolkata');
      expect(range.from).toBe('2026-08-01');
      expect(range.to).toBe('2026-10-31');
    });

    it('computes this_year range accurately', () => {
      mockDateIST('2026-10-15T12:00:00.000Z');
      const range = getPresetDateRange('this_year', 'Asia/Kolkata');
      expect(range.from).toBe('2026-01-01');
      expect(range.to).toBe('2026-12-31');
    });
  });

  describe('getPreviousPeriodRange', () => {
    it('computes previous period of exact duration immediately before', () => {
      // 30 days: Oct 1 to Oct 30 -> 30 days -> prev is Sep 1 to Sep 30
      const prev = getPreviousPeriodRange('2026-10-01', '2026-10-30');
      expect(prev.to).toBe('2026-09-30');
      expect(prev.from).toBe('2026-09-01');
    });

    it('computes previous period for a single day', () => {
      const prev = getPreviousPeriodRange('2026-10-15', '2026-10-15');
      expect(prev.from).toBe('2026-10-14');
      expect(prev.to).toBe('2026-10-14');
    });
  });

  describe('formatDateRangeDisplay', () => {
    it('formats human readable range string', () => {
      const display = formatDateRangeDisplay('2026-11-01', '2026-11-30');
      expect(display).toBe('1 Nov - 30 Nov 2026');
    });

    it('formats cross-year date range correctly', () => {
      const display = formatDateRangeDisplay('2025-12-01', '2026-01-15');
      expect(display).toBe('1 Dec 2025 - 15 Jan 2026');
    });
  });
});

