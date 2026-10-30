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
