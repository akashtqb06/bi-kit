import type { PfParsedRowDTO, PfAccountSummaryDTO } from '../../contract';

export type PfEntryLike = {
  entryKind: PfParsedRowDTO['entryKind'];
  periodMonth?: string | null;
  postedDate?: string | null;
  dateApprox?: boolean;
  epfWages?: number;
  epsWages?: number;
  employeeAmount: number;
  employerAmount: number;
  pensionAmount: number;
  note?: string | null;
};

export interface FyMonthInfo {
  monthKey: string; // "YYYY-MM"
  monthName: string;
  monthIndex: number; // 0 to 11 (0 = April)
}

/**
 * Returns the list of 12 "YYYY-MM" strings for a financial year, e.g. "2026-27" -> 2026-04 through 2027-03.
 */
export function getFyMonths(fy: string): string[] {
  // fy format: "2026-27"
  const startYear = parseInt(fy.slice(0, 4), 10);
  const endYear = startYear + 1;

  const months: string[] = [];
  for (let m = 4; m <= 12; m++) {
    months.push(`${startYear}-${String(m).padStart(2, '0')}`);
  }
  for (let m = 1; m <= 3; m++) {
    months.push(`${endYear}-${String(m).padStart(2, '0')}`);
  }
  return months;
}

/**
 * Determines the Financial Year string (e.g. "2026-27") for a given date or periodMonth (YYYY-MM).
 */
export function getFyFromDate(dateStr: string): string {
  const year = parseInt(dateStr.slice(0, 4), 10);
  const month = parseInt(dateStr.slice(5, 7), 10);

  if (month >= 4) {
    const nextShort = String((year + 1) % 100).padStart(2, '0');
    return `${year}-${nextShort}`;
  } else {
    const prevYear = year - 1;
    const curShort = String(year % 100).padStart(2, '0');
    return `${prevYear}-${curShort}`;
  }
}

export interface InterestAccrualMonth {
  month: string; // YYYY-MM
  startBalance: number; // in paise
  rate: number; // percentage, e.g. 8.25
  interest: number; // in paise
}

export interface FyInterestEstimate {
  fy: string;
  rate: number | null;
  hasCreditedInterest: boolean;
  totalAccruedInterest: number; // in paise
  monthlyBreakdown: InterestAccrualMonth[];
}

/**
 * Calculates current FY interest estimate.
 *
 * Rules:
 * - Each month's interest = running balance at the start of the month (employee + employer entries to date, including transfer-ins)
 *   x rate / 12 / 100.
 * - Accumulated through the FY (April to March) without compounding inside the year.
 * - Credited and added to the balance at FY end, unless the passbook already has an interest_credit row.
 * - Rate is editable per FY with no default.
 */
export function calculateFyInterestEstimate(
  entries: PfEntryLike[],
  fy: string,
  rate: number | null | undefined,
  asOfMonth?: string // e.g. "2026-10" or current month
): FyInterestEstimate {
  const hasCredited = entries.some(
    (e) => e.entryKind === 'interest_credit' && (e.periodMonth?.startsWith(fy.slice(0, 4)) || (e.postedDate && getFyFromDate(e.postedDate) === fy))
  );

  if (hasCredited || !rate || rate <= 0) {
    return {
      fy,
      rate: rate ?? null,
      hasCreditedInterest: hasCredited,
      totalAccruedInterest: 0,
      monthlyBreakdown: [],
    };
  }

  const fyMonths = getFyMonths(fy);

  // Compute opening balance before start of FY (before April of startYear)
  const startFyMonth = fyMonths[0]; // e.g. "2026-04"
  let runningPfBalance = 0;

  for (const entry of entries) {
    const entryMonth = entry.periodMonth || (entry.postedDate ? entry.postedDate.slice(0, 7) : null);
    if (entryMonth && entryMonth < startFyMonth) {
      if (entry.entryKind !== 'withdrawal') {
        runningPfBalance += entry.employeeAmount + entry.employerAmount;
      } else {
        runningPfBalance += entry.employeeAmount + entry.employerAmount; // withdrawal already negative
      }
    } else if (entry.entryKind === 'opening' && (!entryMonth || entryMonth <= startFyMonth)) {
      runningPfBalance += entry.employeeAmount + entry.employerAmount;
    }
  }

  const monthlyBreakdown: InterestAccrualMonth[] = [];
  let totalAccrued = 0;

  // Determine cutoff month for accrual calculation
  const cutoff = asOfMonth || fyMonths[fyMonths.length - 1];

  for (const month of fyMonths) {
    if (month > cutoff) {
      break;
    }

    // Month interest is calculated on running balance at the start of the month
    const monthInterestPaise = Math.round((runningPfBalance * rate) / 1200);
    monthlyBreakdown.push({
      month,
      startBalance: runningPfBalance,
      rate,
      interest: monthInterestPaise,
    });
    totalAccrued += monthInterestPaise;

    // Now advance running balance with all entries belonging to this month
    for (const entry of entries) {
      const entryMonth = entry.periodMonth || (entry.postedDate ? entry.postedDate.slice(0, 7) : null);
      if (entryMonth === month) {
        if (entry.entryKind !== 'opening') {
          runningPfBalance += entry.employeeAmount + entry.employerAmount;
        }
      }
    }
  }

  return {
    fy,
    rate,
    hasCreditedInterest: false,
    totalAccruedInterest: totalAccrued,
    monthlyBreakdown,
  };
}

/**
 * Checks staleness of the latest passbook entry.
 * When latest entry is older than 35 days, returns isStale: true with day count.
 */
export function checkPassbookStaleness(
  entries: PfEntryLike[],
  asOfDate: string
): { isStale: boolean; staleDays: number; latestDate: string | null } {
  let latestDate: string | null = null;

  for (const entry of entries) {
    const d = entry.postedDate || (entry.periodMonth ? `${entry.periodMonth}-01` : null);
    if (d && (!latestDate || d > latestDate)) {
      latestDate = d;
    }
  }

  if (!latestDate) {
    return { isStale: false, staleDays: 0, latestDate: null };
  }

  const latestTime = new Date(latestDate).getTime();
  const asOfTime = new Date(asOfDate).getTime();
  const diffDays = Math.floor((asOfTime - latestTime) / (1000 * 60 * 60 * 24));

  return {
    isStale: diffDays > 35,
    staleDays: Math.max(0, diffDays),
    latestDate,
  };
}

/**
 * Computes virtual next expected contribution from the latest posted contribution month.
 * Never stored as a database row.
 */
export function computeVirtualNextContribution(
  entries: PfEntryLike[]
): PfAccountSummaryDTO['virtualNextContribution'] {
  const contributions = entries.filter((e) => e.entryKind === 'contribution');
  if (contributions.length === 0) return null;

  // Sort descending by periodMonth or postedDate
  const sorted = [...contributions].sort((a, b) => {
    const dateA = a.periodMonth || a.postedDate || '';
    const dateB = b.periodMonth || b.postedDate || '';
    return dateB.localeCompare(dateA);
  });

  const latest = sorted[0];
  return {
    employee: latest.employeeAmount,
    employer: latest.employerAmount,
    pension: latest.pensionAmount,
  };
}
