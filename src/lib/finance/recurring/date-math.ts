import type { RecurringFrequency } from '../constants';
import type { RecurringRuleDTO } from '../contract';
import type { OccurrenceProjection } from './types';

/**
 * Checks whether a given Gregorian year is a leap year.
 */
export function isLeapYear(year: number): boolean {
  return (year % 4 === 0 && year % 100 !== 0) || year % 400 === 0;
}

/**
 * Returns the exact number of days in a given month (month is 1-based: 1 = Jan, 12 = Dec).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/**
 * Clamps a target day-of-month to the maximum valid day in that month.
 * e.g., Day 31 clamped to Feb 2024 (leap year) -> 29, Feb 2025 -> 28, Apr 2024 -> 30.
 */
export function clampDayToMonth(year: number, month: number, targetDay: number): number {
  const maxDays = getDaysInMonth(year, month);
  return Math.min(Math.max(1, targetDay), maxDays);
}

/**
 * Formats year, month (1-based), and day into an ISO date string (YYYY-MM-DD).
 */
export function formatDateUTC(year: number, month: number, day: number): string {
  const yStr = String(year).padStart(4, '0');
  const mStr = String(month).padStart(2, '0');
  const dStr = String(day).padStart(2, '0');
  return `${yStr}-${mStr}-${dStr}`;
}

/**
 * Extracts the anchor day of month for a recurring rule.
 * Checks for a `[DOM:XX]` tag in the note if available, otherwise falls back
 * to the day component of the rule's `startDate`.
 */
export function extractAnchorDay(rule: { startDate: string; note?: string | null }): number {
  if (rule.note) {
    const match = rule.note.match(/\[DOM:(\d{1,2})\]/);
    if (match) {
      const parsed = parseInt(match[1], 10);
      if (parsed >= 1 && parsed <= 31) {
        return parsed;
      }
    }
  }

  const [, , dStr] = rule.startDate.split('-');
  return parseInt(dStr, 10);
}

/**
 * Extracts the anchor month for yearly recurrences (1-12).
 */
export function extractAnchorMonth(rule: { startDate: string }): number {
  const [, mStr] = rule.startDate.split('-');
  return parseInt(mStr, 10);
}

/**
 * Advances a recurring occurrence date according to frequency, interval, and day-of-month clamping.
 * Preserves anchor day of month across months of varying lengths (e.g., 31st -> Feb 28 -> Mar 31).
 */
export function advanceRecurringDate(
  currentDate: string,
  frequency: RecurringFrequency,
  interval: number = 1,
  anchorDay?: number,
  anchorMonth?: number
): string {
  const [y, m, d] = currentDate.split('-').map((v) => parseInt(v, 10));
  const safeInterval = Math.max(1, interval);
  const targetDay = anchorDay ?? d;

  switch (frequency) {
    case 'daily': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + safeInterval);
      return dt.toISOString().slice(0, 10);
    }
    case 'weekly': {
      const dt = new Date(Date.UTC(y, m - 1, d));
      dt.setUTCDate(dt.getUTCDate() + safeInterval * 7);
      return dt.toISOString().slice(0, 10);
    }
    case 'monthly': {
      const totalMonths = y * 12 + (m - 1) + safeInterval;
      const targetYear = Math.floor(totalMonths / 12);
      const targetM = (totalMonths % 12) + 1;
      const clampedDay = clampDayToMonth(targetYear, targetM, targetDay);
      return formatDateUTC(targetYear, targetM, clampedDay);
    }
    case 'quarterly': {
      const totalMonths = y * 12 + (m - 1) + safeInterval * 3;
      const targetYear = Math.floor(totalMonths / 12);
      const targetM = (totalMonths % 12) + 1;
      const clampedDay = clampDayToMonth(targetYear, targetM, targetDay);
      return formatDateUTC(targetYear, targetM, clampedDay);
    }
    case 'yearly': {
      const targetYear = y + safeInterval;
      const targetM = anchorMonth ?? m;
      const clampedDay = clampDayToMonth(targetYear, targetM, targetDay);
      return formatDateUTC(targetYear, targetM, clampedDay);
    }
  }
}

/**
 * Computes calendar difference in full days between two ISO date strings (targetDate - fromDate).
 */
export function daysBetween(fromDate: string, targetDate: string): number {
  const [y1, m1, d1] = fromDate.split('-').map(Number);
  const [y2, m2, d2] = targetDate.split('-').map(Number);
  const utc1 = Date.UTC(y1, m1 - 1, d1);
  const utc2 = Date.UTC(y2, m2 - 1, d2);
  const msPerDay = 24 * 60 * 60 * 1000;
  return Math.round((utc2 - utc1) / msPerDay);
}

/**
 * Projects all upcoming occurrences for active recurring rules over the specified horizon (default 60 days).
 */
export function projectUpcomingOccurrences(
  rules: RecurringRuleDTO[],
  fromDate: string = new Date().toISOString().slice(0, 10),
  daysAhead: number = 60
): OccurrenceProjection[] {
  const [fy, fm, fd] = fromDate.split('-').map(Number);
  const limitDateUtc = Date.UTC(fy, fm - 1, fd) + daysAhead * 24 * 60 * 60 * 1000;
  const limitDate = new Date(limitDateUtc).toISOString().slice(0, 10);

  const projections: OccurrenceProjection[] = [];

  for (const rule of rules) {
    if (!rule.isActive) continue;

    const anchorDay = extractAnchorDay(rule);
    const anchorMonth = extractAnchorMonth(rule);

    let occurrence = rule.nextOccurrence;

    // Safety counter to guard against infinite loops
    let iterations = 0;
    const maxIterations = 200;

    while (occurrence <= limitDate && iterations < maxIterations) {
      iterations++;

      if (rule.endDate && occurrence > rule.endDate) {
        break;
      }

      if (occurrence >= fromDate) {
        const daysUntil = daysBetween(fromDate, occurrence);
        const name = rule.payee || (rule.note ? rule.note.replace(/\[DOM:\d+\]/, '').trim() : '') || 'Recurring Rule';

        projections.push({
          id: `${rule.id}_${occurrence}`,
          ruleId: rule.id,
          ruleName: name || 'Recurring Rule',
          date: occurrence,
          daysUntil,
          type: rule.type,
          amount: rule.amount,
          payee: rule.payee,
          note: rule.note ? rule.note.replace(/\[DOM:\d+\]/, '').trim() || null : null,
          accountId: rule.accountId,
          toAccountId: rule.toAccountId,
          categoryId: rule.categoryId,
          frequency: rule.frequency,
          interval: rule.interval,
          isActive: rule.isActive,
        });
      }

      const nextOcc = advanceRecurringDate(
        occurrence,
        rule.frequency,
        rule.interval,
        anchorDay,
        anchorMonth
      );

      if (nextOcc <= occurrence) {
        // Prevent infinite progression
        break;
      }
      occurrence = nextOcc;
    }
  }

  // Sort projections chronologically
  return projections.sort((a, b) => a.date.localeCompare(b.date));
}
