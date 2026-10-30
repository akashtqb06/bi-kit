export const DEFAULT_TZ = 'Asia/Kolkata';

/** Returns YYYY-MM-DD for "today" in the given IANA timezone */
export function todayInTz(tz: string = DEFAULT_TZ): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
}

/** Returns YYYY-MM-DD for the first day of the current month in the given timezone */
export function currentMonthStartInTz(tz: string = DEFAULT_TZ): string {
  const today = todayInTz(tz); // YYYY-MM-DD
  return today.slice(0, 7) + '-01';
}

/** Returns YYYY-MM-DD for the last day of the current month in the given timezone */
export function currentMonthEndInTz(tz: string = DEFAULT_TZ): string {
  const today = todayInTz(tz);
  const [y, m] = today.split('-').map(Number);
  const lastDay = new Date(Date.UTC(y!, m!, 0)).getUTCDate(); // Day 0 of next month = last day of current
  return `${today.slice(0, 7)}-${String(lastDay).padStart(2, '0')}`;
}

/** Returns { start: YYYY-MM-DD, end: YYYY-MM-DD } for the previous month in the given timezone */
export function previousMonthRangeInTz(tz: string = DEFAULT_TZ): { start: string; end: string } {
  const today = todayInTz(tz);
  const [y, m] = today.split('-').map(Number);
  const prevMonthDate = new Date(Date.UTC(y!, m! - 1, 0)); // last day of previous month
  const prevYear = prevMonthDate.getUTCFullYear();
  const prevMonth = prevMonthDate.getUTCMonth() + 1; // 1-indexed
  const lastDay = prevMonthDate.getUTCDate();
  const mm = String(prevMonth).padStart(2, '0');
  return {
    start: `${prevYear}-${mm}-01`,
    end: `${prevYear}-${mm}-${String(lastDay).padStart(2, '0')}`,
  };
}

export type OverviewPreset =
  | 'this_month'
  | 'last_month'
  | 'last_3_months'
  | 'this_year'
  | 'custom';

/** Returns { from: YYYY-MM-DD, to: YYYY-MM-DD } for a given preset in timezone */
export function getPresetDateRange(
  preset: OverviewPreset,
  tz: string = DEFAULT_TZ
): { from: string; to: string } {
  const today = todayInTz(tz);
  const [y, m] = today.split('-').map(Number);

  switch (preset) {
    case 'this_month': {
      return {
        from: currentMonthStartInTz(tz),
        to: currentMonthEndInTz(tz),
      };
    }
    case 'last_month': {
      const pm = previousMonthRangeInTz(tz);
      return {
        from: pm.start,
        to: pm.end,
      };
    }
    case 'last_3_months': {
      // 3 full calendar months ending at current month end (e.g. Aug 1 - Oct 31)
      const targetStartMonth = new Date(Date.UTC(y, m - 3, 1));
      const startYear = targetStartMonth.getUTCFullYear();
      const startMonth = String(targetStartMonth.getUTCMonth() + 1).padStart(2, '0');
      return {
        from: `${startYear}-${startMonth}-01`,
        to: currentMonthEndInTz(tz),
      };
    }
    case 'this_year': {
      return {
        from: `${y}-01-01`,
        to: `${y}-12-31`,
      };
    }
    case 'custom':
    default: {
      return {
        from: currentMonthStartInTz(tz),
        to: currentMonthEndInTz(tz),
      };
    }
  }
}

/**
 * Returns previous period of the exact same day length ending immediately before `from`.
 */
export function getPreviousPeriodRange(
  from: string,
  to: string
): { from: string; to: string } {
  const [fy, fm, fd] = from.split('-').map(Number);
  const [ty, tm, td] = to.split('-').map(Number);
  const fromUtc = Date.UTC(fy, fm - 1, fd);
  const toUtc = Date.UTC(ty, tm - 1, td);
  const msPerDay = 86400000;
  const days = Math.max(1, Math.round((toUtc - fromUtc) / msPerDay) + 1);

  const prevToUtc = fromUtc - msPerDay;
  const prevFromUtc = prevToUtc - (days - 1) * msPerDay;

  const prevTo = new Date(prevToUtc).toISOString().slice(0, 10);
  const prevFrom = new Date(prevFromUtc).toISOString().slice(0, 10);

  return { from: prevFrom, to: prevTo };
}

const MONTH_NAMES = [
  'Jan',
  'Feb',
  'Mar',
  'Apr',
  'May',
  'Jun',
  'Jul',
  'Aug',
  'Sep',
  'Oct',
  'Nov',
  'Dec',
];

/** Formats a date range as text, e.g. "1 Nov - 30 Nov 2026" */
export function formatDateRangeDisplay(from: string, to: string): string {
  if (!from || !to) return '';
  const [y1, m1, d1] = from.split('-').map(Number);
  const [y2, m2, d2] = to.split('-').map(Number);

  const m1Name = MONTH_NAMES[m1 - 1] || '';
  const m2Name = MONTH_NAMES[m2 - 1] || '';

  if (y1 === y2) {
    if (m1 === m2 && d1 === d2) {
      return `${d1} ${m1Name} ${y1}`;
    }
    return `${d1} ${m1Name} - ${d2} ${m2Name} ${y2}`;
  }

  return `${d1} ${m1Name} ${y1} - ${d2} ${m2Name} ${y2}`;
}

