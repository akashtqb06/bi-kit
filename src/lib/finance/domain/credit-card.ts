/**
 * Credit card and liability calculation helpers.
 *
 * Contract conventions:
 * - Credit card balance is negative when money is owed.
 * - Outstanding = max(0, -balance).
 * - Loans balance is positive when money is owed.
 * - Loan Outstanding = max(0, balance).
 * - Credit Limit is stored in minor units (paise).
 * - Utilization = outstanding / creditLimit (clamped between 0.0 and 1.0; 0 if creditLimit <= 0).
 */

export function calculateCreditCardOutstanding(balance: number): number {
  return Math.max(0, -balance);
}

export function calculateCreditCardUtilization(
  balance: number,
  creditLimit: number | null | undefined
): number {
  if (!creditLimit || creditLimit <= 0) {
    return 0;
  }
  const outstanding = calculateCreditCardOutstanding(balance);
  const utilization = outstanding / creditLimit;
  return Math.min(1.0, Math.max(0.0, utilization));
}

export function calculateLoanOutstanding(balance: number): number {
  return Math.max(0, balance);
}

/**
 * Returns a valid YYYY-MM-DD date string with day clamped to the last day of the given month.
 */
function clampDateToMonth(year: number, monthIndex: number, desiredDay: number): string {
  // Days in month: day 0 of monthIndex + 1 gives last day of monthIndex
  const daysInMonth = new Date(Date.UTC(year, monthIndex + 1, 0)).getUTCDate();
  const day = Math.min(desiredDay, daysInMonth);
  const m = String(monthIndex + 1).padStart(2, '0');
  const d = String(day).padStart(2, '0');
  return `${year}-${m}-${d}`;
}

export interface CardDatesResult {
  lastStatementDate: string;
  nextStatementDate: string;
  currentDueDate: string;
  nextDueDate: string;
}

/**
 * Calculates credit card statement and payment due dates relative to an asOfDate.
 *
 * @param statementDay Day of month (1-31) when statement is generated.
 * @param dueDay Day of month (1-31) or offset days when payment is due.
 * @param asOfDate Current date in YYYY-MM-DD format.
 * @param options If isOffsetDays is true, dueDay is treated as days after statement date (e.g. 20 days).
 */
export function calculateCardDates(
  statementDay: number,
  dueDay: number,
  asOfDate: string,
  options?: { isOffsetDays?: boolean }
): CardDatesResult {
  const [yearStr, monthStr, dayStr] = asOfDate.split('-');
  const y = parseInt(yearStr, 10);
  const m = parseInt(monthStr, 10) - 1; // 0-indexed
  const d = parseInt(dayStr, 10);

  // Determine last statement and next statement
  let lastStatementYear = y;
  let lastStatementMonth = m;
  let nextStatementYear = y;
  let nextStatementMonth = m;

  if (d < statementDay) {
    // Current month's statement hasn't occurred yet
    nextStatementYear = y;
    nextStatementMonth = m;

    lastStatementMonth = m - 1;
    if (lastStatementMonth < 0) {
      lastStatementMonth = 11;
      lastStatementYear -= 1;
    }
  } else {
    // Current month's statement has already generated (or is today)
    lastStatementYear = y;
    lastStatementMonth = m;

    nextStatementMonth = m + 1;
    if (nextStatementMonth > 11) {
      nextStatementMonth = 0;
      nextStatementYear += 1;
    }
  }

  const lastStatementDate = clampDateToMonth(lastStatementYear, lastStatementMonth, statementDay);
  const nextStatementDate = clampDateToMonth(nextStatementYear, nextStatementMonth, statementDay);

  // Compute due date from a given statement date
  function computeDueDate(stmtDate: string, sYear: number, sMonth: number): string {
    if (options?.isOffsetDays) {
      const dt = new Date(`${stmtDate}T00:00:00Z`);
      dt.setUTCDate(dt.getUTCDate() + dueDay);
      return dt.toISOString().slice(0, 10);
    }

    // Due day is a calendar day of the month
    // If dueDay <= statementDay, due date is in the month following the statement
    let dueYear = sYear;
    let dueMonth = sMonth;
    if (dueDay <= statementDay) {
      dueMonth += 1;
      if (dueMonth > 11) {
        dueMonth = 0;
        dueYear += 1;
      }
    }
    return clampDateToMonth(dueYear, dueMonth, dueDay);
  }

  const currentDueDate = computeDueDate(lastStatementDate, lastStatementYear, lastStatementMonth);
  const nextDueDate = computeDueDate(nextStatementDate, nextStatementYear, nextStatementMonth);

  return {
    lastStatementDate,
    nextStatementDate,
    currentDueDate,
    nextDueDate,
  };
}

/**
 * Checks if a credit card has a payment due in the next N days from asOfDate.
 */
export function isCardDueWithinDays(
  statementDay: number,
  dueDay: number,
  asOfDate: string,
  daysWindow = 10,
  options?: { isOffsetDays?: boolean }
): { isDue: boolean; dueDate: string; daysRemaining: number } {
  const dates = calculateCardDates(statementDay, dueDay, asOfDate, options);
  const asOfTime = new Date(`${asOfDate}T00:00:00Z`).getTime();

  // Check currentDueDate first
  const currentDueTime = new Date(`${dates.currentDueDate}T00:00:00Z`).getTime();
  const diffDaysCurrent = Math.round((currentDueTime - asOfTime) / (86400 * 1000));

  if (diffDaysCurrent >= 0 && diffDaysCurrent <= daysWindow) {
    return { isDue: true, dueDate: dates.currentDueDate, daysRemaining: diffDaysCurrent };
  }

  // Check nextDueDate in case currentDueDate already passed
  const nextDueTime = new Date(`${dates.nextDueDate}T00:00:00Z`).getTime();
  const diffDaysNext = Math.round((nextDueTime - asOfTime) / (86400 * 1000));

  if (diffDaysNext >= 0 && diffDaysNext <= daysWindow) {
    return { isDue: true, dueDate: dates.nextDueDate, daysRemaining: diffDaysNext };
  }

  return { isDue: false, dueDate: dates.currentDueDate, daysRemaining: diffDaysCurrent };
}
