import type { DateFormat } from './types';

const MONTH_NAMES: Record<string, string> = {
  jan: '01',
  feb: '02',
  mar: '03',
  apr: '04',
  may: '05',
  jun: '06',
  jul: '07',
  aug: '08',
  sep: '09',
  oct: '10',
  nov: '11',
  dec: '12',
};

/**
 * Automatically detects the date format from a sample of date strings found in the CSV.
 */
export function detectDateFormat(samples: string[]): DateFormat {
  const cleanSamples = samples
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length >= 6);

  if (cleanSamples.length === 0) {
    return 'DD/MM/YYYY'; // Default Indian banking format
  }

  // Count matches for different patterns
  let isoCount = 0;
  let dmySlashCount = 0;
  let dmyDashCount = 0;
  let mdySlashCount = 0;
  let ymdSlashCount = 0;
  let textMonthCount = 0;

  for (const s of cleanSamples) {
    if (/^\d{4}-\d{2}-\d{2}$/.test(s)) {
      isoCount++;
      continue;
    }
    if (/^\d{4}\/\d{2}\/\d{2}$/.test(s)) {
      ymdSlashCount++;
      continue;
    }
    if (/^\d{1,2}[-\/\s][a-zA-Z]{3}[-\/\s]\d{2,4}$/.test(s)) {
      textMonthCount++;
      continue;
    }

    // Check DD-MM-YYYY vs YYYY-MM-DD
    const dashMatch = s.match(/^(\d{1,2})-(\d{1,2})-(\d{4})$/);
    if (dashMatch) {
      dmyDashCount++;
      continue;
    }

    // Check DD/MM/YYYY vs MM/DD/YYYY
    const slashMatch = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
    if (slashMatch) {
      const part1 = parseInt(slashMatch[1], 10);
      const part2 = parseInt(slashMatch[2], 10);
      if (part1 > 12) {
        dmySlashCount += 2;
      } else if (part2 > 12) {
        mdySlashCount += 2;
      } else {
        dmySlashCount++;
      }
      continue;
    }
  }

  if (textMonthCount > 0) return 'DD MMM YYYY';
  if (isoCount > 0 && isoCount >= dmySlashCount && isoCount >= dmyDashCount) return 'YYYY-MM-DD';
  if (ymdSlashCount > 0 && ymdSlashCount >= dmySlashCount) return 'YYYY/MM/DD';
  if (dmyDashCount > 0 && dmyDashCount >= dmySlashCount) return 'DD-MM-YYYY';
  if (mdySlashCount > dmySlashCount) return 'MM/DD/YYYY';

  return 'DD/MM/YYYY';
}

/**
 * Parses a date string given a specific DateFormat and returns an ISO YYYY-MM-DD string.
 * Returns null if the date is invalid.
 */
export function parseDateToISO(value: string, format: DateFormat): string | null {
  if (!value) return null;
  const clean = value.trim().replace(/^["']|["']$/g, '');
  if (!clean) return null;

  let year: number;
  let month: number;
  let day: number;

  if (format === 'YYYY-MM-DD') {
    const match = clean.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
    if (!match) return null;
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    day = parseInt(match[3], 10);
  } else if (format === 'YYYY/MM/DD') {
    const match = clean.match(/^(\d{4})\/(\d{1,2})\/(\d{1,2})$/);
    if (!match) return null;
    year = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    day = parseInt(match[3], 10);
  } else if (format === 'DD/MM/YYYY') {
    const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return null;
    day = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
  } else if (format === 'DD-MM-YYYY') {
    const match = clean.match(/^(\d{1,2})-(\d{1,2})-(\d{2,4})$/);
    if (!match) return null;
    day = parseInt(match[1], 10);
    month = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
  } else if (format === 'MM/DD/YYYY') {
    const match = clean.match(/^(\d{1,2})\/(\d{1,2})\/(\d{2,4})$/);
    if (!match) return null;
    month = parseInt(match[1], 10);
    day = parseInt(match[2], 10);
    year = parseInt(match[3], 10);
  } else if (format === 'DD MMM YYYY' || format === 'DD-MMM-YYYY') {
    const match = clean.match(/^(\d{1,2})[-\/\s]([a-zA-Z]{3})[-\/\s](\d{2,4})$/);
    if (!match) return null;
    day = parseInt(match[1], 10);
    const mStr = match[2].toLowerCase();
    const mNum = MONTH_NAMES[mStr];
    if (!mNum) return null;
    month = parseInt(mNum, 10);
    year = parseInt(match[3], 10);
  } else {
    return null;
  }

  // Two-digit year expansion (e.g. 26 -> 2026)
  if (year < 100) {
    year += year < 70 ? 2000 : 1900;
  }

  // Validate range
  if (month < 1 || month > 12) return null;
  if (day < 1 || day > 31) return null;

  // Validate actual date existence (e.g., Feb 30, April 31)
  const d = new Date(Date.UTC(year, month - 1, day));
  if (
    d.getUTCFullYear() !== year ||
    d.getUTCMonth() !== month - 1 ||
    d.getUTCDate() !== day
  ) {
    return null;
  }

  const mm = String(month).padStart(2, '0');
  const dd = String(day).padStart(2, '0');
  return `${year}-${mm}-${dd}`;
}
