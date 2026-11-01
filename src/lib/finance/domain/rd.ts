/**
 * Recurring Deposit (RD) Domain Logic
 * 
 * Pure calculation and schedule generation functions for Recurring Deposits.
 * Complies with docs/finance/CONTRACT.md and docs/FINANCE_CALCULATIONS.md.
 */

export type RDCompounding = 'quarterly' | 'monthly' | 'half_yearly' | 'yearly' | 'simple';
export type RDFirstInstallmentOn = 'start_date' | 'first_installment_day';
export type RDInstallmentsMode = 'schedule' | 'recorded';

export interface RDDayHistoryItem {
  effectiveFrom: string; // 'YYYY-MM'
  day: number | 'last';
}

export interface RDLatePaymentItem {
  dueDate: string; // 'YYYY-MM-DD'
  paidDate: string; // 'YYYY-MM-DD'
}

export interface RDConfig {
  monthlyInstallment: number; // in paise
  startDate: string; // YYYY-MM-DD
  installmentDay: number | 'last'; // 1-31 or 'last'
  firstInstallmentOn?: RDFirstInstallmentOn; // default 'start_date'
  tenureMonths: number;
  maturityDate?: string; // YYYY-MM-DD (derived if omitted)
  interestRate: number; // e.g. 6.8 for 6.8% or 0.068
  compounding?: RDCompounding; // default 'quarterly'
  payFromAccountId?: string | null;
  autoDebit?: boolean;
  installmentsMode?: RDInstallmentsMode; // default 'schedule'
  installmentDayHistory?: RDDayHistoryItem[];
  skippedInstallments?: string[]; // list of YYYY-MM-DD dates
  paidLateInstallments?: RDLatePaymentItem[];
  recordedTransfers?: Array<{ date: string; amount: number }>;
}

export interface RDInstallmentItem {
  n: number; // 1-based index (1..tenureMonths)
  dueDate: string; // YYYY-MM-DD
  paidDate?: string; // YYYY-MM-DD
  amount: number; // in paise
  status: 'paid' | 'due' | 'upcoming' | 'skipped';
}

export interface RDValuationResult {
  installmentsPaid: number;
  nextInstallmentDate: string | null;
  totalDeposited: number; // in paise
  interestAccrued: number; // in paise
  currentValue: number; // in paise
  projectedMaturityValue: number; // in paise
  maturityDate: string;
  daysToMaturity: number;
  schedule: RDInstallmentItem[];
}

/**
 * Returns the exact number of days in a given Gregorian month (month is 1-based: 1 = Jan, 12 = Dec).
 */
export function getDaysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
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
 * Clamps a day-of-month (or 'last') to the maximum valid day in that month.
 */
export function clampDayToMonth(year: number, month: number, targetDay: number | 'last'): number {
  const maxDays = getDaysInMonth(year, month);
  if (targetDay === 'last') {
    return maxDays;
  }
  return Math.min(Math.max(1, targetDay), maxDays);
}

/**
 * Calculates day difference between two YYYY-MM-DD date strings.
 * (date2 - date1) in calendar days. Positive if date2 > date1.
 */
export function getDaysDifference(date1: string, date2: string): number {
  const [y1, m1, d1] = date1.split('-').map(Number);
  const [y2, m2, d2] = date2.split('-').map(Number);
  const ms1 = Date.UTC(y1, m1 - 1, d1);
  const ms2 = Date.UTC(y2, m2 - 1, d2);
  return Math.round((ms2 - ms1) / 86400000);
}

/**
 * Derives default maturity date as startDate + tenureMonths.
 * Uses calendar month addition clamping to valid days.
 */
export function deriveMaturityDate(startDate: string, tenureMonths: number): string {
  const [y, m, d] = startDate.split('-').map(Number);
  const totalMonths = y * 12 + (m - 1) + tenureMonths;
  const targetYear = Math.floor(totalMonths / 12);
  const targetMonth = (totalMonths % 12) + 1;
  const clampedDay = clampDayToMonth(targetYear, targetMonth, d);
  return formatDateUTC(targetYear, targetMonth, clampedDay);
}

/**
 * Normalizes an interest rate to decimal percentage.
 * e.g., 6.8 becomes 6.8. If input is <= 0.5 (like 0.068), treats as decimal fraction and returns 6.8.
 */
export function normalizeRatePercent(rate: number): number {
  if (!rate || rate <= 0 || isNaN(rate)) return 0;
  return rate <= 0.5 ? rate * 100 : rate;
}

/**
 * Returns the compounding frequency count per year.
 */
export function getCompoundingPeriodsPerYear(compounding: RDCompounding = 'quarterly'): number {
  switch (compounding) {
    case 'monthly':
      return 12;
    case 'quarterly':
      return 4;
    case 'half_yearly':
      return 2;
    case 'yearly':
      return 1;
    case 'simple':
      return 0;
    default:
      return 4;
  }
}

/**
 * Retrieves the effective installment day for a specific year-month ('YYYY-MM')
 * based on installmentDayHistory, falling back to defaultDay.
 */
export function getEffectiveInstallmentDay(
  history: RDDayHistoryItem[] | undefined,
  defaultDay: number | 'last',
  yearMonth: string
): number | 'last' {
  if (!history || history.length === 0) {
    return defaultDay;
  }

  // Find entries with effectiveFrom <= yearMonth, sorted ascending
  const applicable = history
    .filter((h) => h.effectiveFrom <= yearMonth)
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  if (applicable.length === 0) {
    return defaultDay;
  }

  return applicable[applicable.length - 1].day;
}

/**
 * Generates the full installment schedule of length tenureMonths.
 *
 * Rules:
 * - Installment 1 = startDate (when firstInstallmentOn = 'start_date') OR
 *   the first occurrence of installmentDay after startDate (when firstInstallmentOn = 'first_installment_day').
 * - Installments 2..n fall on installmentDay in the following consecutive months,
 *   clamped to month lengths and respecting installmentDayHistory.
 * - Status:
 *   - 'skipped' if dueDate is in skippedInstallments.
 *   - In 'schedule' mode: dueDate <= asOf is 'paid', else 'upcoming'.
 *   - In 'recorded' mode: matched to recorded transfer <= asOf is 'paid', else 'due' (if <= asOf) or 'upcoming'.
 */
export function generateSchedule(config: RDConfig, asOf: string): RDInstallmentItem[] {
  const {
    monthlyInstallment,
    startDate,
    installmentDay,
    firstInstallmentOn = 'start_date',
    tenureMonths,
    installmentDayHistory = [],
    skippedInstallments = [],
    paidLateInstallments = [],
    installmentsMode = 'schedule',
    recordedTransfers = [],
  } = config;

  if (tenureMonths <= 0) return [];

  const [startY, startM] = startDate.split('-').map(Number);
  const skippedSet = new Set(skippedInstallments);
  const lateMap = new Map<string, string>();
  for (const lp of paidLateInstallments) {
    lateMap.set(lp.dueDate, lp.paidDate);
  }

  const items: RDInstallmentItem[] = [];

  // Determine date of installment 1
  if (firstInstallmentOn === 'start_date') {
    // Installment 1 is exactly startDate
    items.push(createScheduleItem(1, startDate));

    // Installments 2..n fall in successive months (startM + 1, startM + 2, ...)
    for (let k = 1; k < tenureMonths; k++) {
      const totalMonths = startY * 12 + (startM - 1) + k;
      const targetYear = Math.floor(totalMonths / 12);
      const targetMonth = (totalMonths % 12) + 1;
      const ym = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`;
      const day = getEffectiveInstallmentDay(installmentDayHistory, installmentDay, ym);
      const clampedDay = clampDayToMonth(targetYear, targetMonth, day);
      const dueDate = formatDateUTC(targetYear, targetMonth, clampedDay);
      items.push(createScheduleItem(k + 1, dueDate));
    }
  } else {
    // firstInstallmentOn === 'first_installment_day'
    // Installment 1 is the first occurrence of installmentDay after startDate
    const currentMonthYM = `${String(startY).padStart(4, '0')}-${String(startM).padStart(2, '0')}`;
    const dayThisMonth = getEffectiveInstallmentDay(installmentDayHistory, installmentDay, currentMonthYM);
    const clampedDayThisMonth = clampDayToMonth(startY, startM, dayThisMonth);
    const candidateThisMonth = formatDateUTC(startY, startM, clampedDayThisMonth);

    let firstInstDate: string;
    let baseTotalMonths: number;

    if (candidateThisMonth > startDate) {
      firstInstDate = candidateThisMonth;
      baseTotalMonths = startY * 12 + (startM - 1);
    } else {
      // Move to next month
      baseTotalMonths = startY * 12 + (startM - 1) + 1;
      const targetYear = Math.floor(baseTotalMonths / 12);
      const targetMonth = (baseTotalMonths % 12) + 1;
      const nextYM = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`;
      const dayNextMonth = getEffectiveInstallmentDay(installmentDayHistory, installmentDay, nextYM);
      const clampedDayNextMonth = clampDayToMonth(targetYear, targetMonth, dayNextMonth);
      firstInstDate = formatDateUTC(targetYear, targetMonth, clampedDayNextMonth);
    }

    items.push(createScheduleItem(1, firstInstDate));

    // Installments 2..n follow from baseTotalMonths
    for (let k = 1; k < tenureMonths; k++) {
      const totalMonths = baseTotalMonths + k;
      const targetYear = Math.floor(totalMonths / 12);
      const targetMonth = (totalMonths % 12) + 1;
      const ym = `${String(targetYear).padStart(4, '0')}-${String(targetMonth).padStart(2, '0')}`;
      const day = getEffectiveInstallmentDay(installmentDayHistory, installmentDay, ym);
      const clampedDay = clampDayToMonth(targetYear, targetMonth, day);
      const dueDate = formatDateUTC(targetYear, targetMonth, clampedDay);
      items.push(createScheduleItem(k + 1, dueDate));
    }
  }

  // Match recorded transfers if mode is recorded
  const unassignedTransfers = [...recordedTransfers]
    .filter((t) => t.date <= asOf && t.amount > 0)
    .sort((a, b) => a.date.localeCompare(b.date));

  // Assign statuses
  return items.map((item) => {
    if (skippedSet.has(item.dueDate)) {
      return { ...item, status: 'skipped' };
    }

    const lateDate = lateMap.get(item.dueDate);

    if (installmentsMode === 'recorded') {
      if (unassignedTransfers.length > 0) {
        const transfer = unassignedTransfers.shift()!;
        return {
          ...item,
          status: 'paid',
          paidDate: transfer.date,
        };
      }
      return {
        ...item,
        status: item.dueDate <= asOf ? 'due' : 'upcoming',
      };
    }

    // Schedule mode (default)
    if (item.dueDate <= asOf) {
      return {
        ...item,
        status: 'paid',
        paidDate: lateDate || item.dueDate,
      };
    }

    return {
      ...item,
      status: 'upcoming',
    };
  });

  function createScheduleItem(n: number, dueDate: string): RDInstallmentItem {
    return {
      n,
      dueDate,
      amount: monthlyInstallment,
      status: 'upcoming',
    };
  }
}

/**
 * Calculates current RD value, accrued interest, and maturity projections.
 *
 * Formula:
 * - Each paid installment compounds from its ACTUAL deposit date (paidDate or dueDate):
 *     value_i = R * (1 + r / (100 * q))^(q * days / 365)
 *   where q = compounding periods per year (4 for quarterly), days = days from deposit date to asOf.
 * - Simple interest (q = 0):
 *     value_i = R * (1 + (r / 100) * (days / 365))
 * - With manual anchor (date, value):
 *     anchorCompounded = anchor * (1 + r / (100 * q))^(q * days_since_anchor / 365)
 *     Plus paid installments whose deposit date is strictly after anchor date.
 * - projectedMaturityValue compounds all scheduled installments to maturityDate.
 */
export function rdValue(
  config: RDConfig,
  asOf: string,
  anchor?: { date: string; value: number }
): RDValuationResult {
  const schedule = generateSchedule(config, asOf);
  const tenureMonths = config.tenureMonths;
  const maturityDate = config.maturityDate || deriveMaturityDate(config.startDate, tenureMonths);
  const rPercent = normalizeRatePercent(config.interestRate);
  const q = getCompoundingPeriodsPerYear(config.compounding || 'quarterly');

  const daysToMaturity = Math.max(0, getDaysDifference(asOf, maturityDate));

  // Determine paid installments
  const paidItems = schedule.filter((s) => s.status === 'paid');
  const installmentsPaid = paidItems.length;

  // Next installment date (first upcoming installment strictly > asOf)
  const nextItem = schedule.find((s) => s.dueDate > asOf && s.status !== 'skipped');
  const nextInstallmentDate = nextItem ? nextItem.dueDate : null;

  // Compound factor function
  function compoundAmount(principal: number, days: number): number {
    if (days <= 0 || principal <= 0 || rPercent <= 0) {
      return principal;
    }
    if (q === 0) {
      // Simple interest
      return principal * (1 + (rPercent / 100) * (days / 365.0));
    }
    const periodRate = rPercent / (100 * q);
    const exponent = q * (days / 365.0);
    return principal * Math.pow(1 + periodRate, exponent);
  }

  // Calculate current value and total deposited
  let currentValue = 0;
  let totalDeposited = 0;

  if (anchor && anchor.date <= asOf) {
    const daysSinceAnchor = Math.max(0, getDaysDifference(anchor.date, asOf));
    const anchorCompounded = compoundAmount(anchor.value, daysSinceAnchor);

    // Only add installments paid strictly after anchor.date
    let postAnchorDeposits = 0;
    let postAnchorCompounded = 0;

    for (const item of paidItems) {
      const actualDepositDate = item.paidDate || item.dueDate;
      if (actualDepositDate > anchor.date) {
        const days = Math.max(0, getDaysDifference(actualDepositDate, asOf));
        postAnchorDeposits += item.amount;
        postAnchorCompounded += compoundAmount(item.amount, days);
      }
    }

    currentValue = Math.round(anchorCompounded + postAnchorCompounded);

    // Total deposited: installments paid up to anchor date + installments after anchor date
    const preAnchorInstallments = paidItems.filter(
      (item) => (item.paidDate || item.dueDate) <= anchor.date
    );
    totalDeposited = preAnchorInstallments.reduce((sum, item) => sum + item.amount, 0) + postAnchorDeposits;
    if (totalDeposited === 0) {
      totalDeposited = anchor.value;
    }
  } else {
    // No anchor
    let sumVal = 0;
    for (const item of paidItems) {
      const actualDepositDate = item.paidDate || item.dueDate;
      const days = Math.max(0, getDaysDifference(actualDepositDate, asOf));
      totalDeposited += item.amount;
      sumVal += compoundAmount(item.amount, days);
    }
    currentValue = Math.round(sumVal);
  }

  const interestAccrued = Math.max(0, currentValue - totalDeposited);

  // Projected maturity value: all non-skipped installments compounded to maturityDate
  let projectedMaturityValue = 0;
  for (const item of schedule) {
    if (item.status === 'skipped') continue;

    // If already paid, compound from actual paidDate; if future, compound from dueDate
    const depositDate = item.status === 'paid' ? (item.paidDate || item.dueDate) : item.dueDate;
    const daysToMat = Math.max(0, getDaysDifference(depositDate, maturityDate));
    projectedMaturityValue += compoundAmount(item.amount, daysToMat);
  }
  projectedMaturityValue = Math.round(projectedMaturityValue);

  return {
    installmentsPaid,
    nextInstallmentDate,
    totalDeposited,
    interestAccrued,
    currentValue,
    projectedMaturityValue,
    maturityDate,
    daysToMaturity,
    schedule,
  };
}

/**
 * Appends a change of installment day to installmentDayHistory without modifying past dates.
 * Returns a new RDConfig object.
 */
export function changeInstallmentDay(
  config: RDConfig,
  newDay: number | 'last',
  effectiveFrom: string // 'YYYY-MM' or 'YYYY-MM-DD'
): RDConfig {
  const normEffective = effectiveFrom.slice(0, 7); // normalize to YYYY-MM
  const startMonth = config.startDate.slice(0, 7);
  const existingHistory = config.installmentDayHistory ? [...config.installmentDayHistory] : [];

  // If existing history is empty, seed it with the baseline day from startDate
  if (existingHistory.length === 0) {
    existingHistory.push({
      effectiveFrom: startMonth,
      day: config.installmentDay,
    });
  }

  // Filter out any existing entry with the exact same effectiveFrom month
  const updatedHistory = existingHistory
    .filter((h) => h.effectiveFrom !== normEffective)
    .concat({ effectiveFrom: normEffective, day: newDay })
    .sort((a, b) => a.effectiveFrom.localeCompare(b.effectiveFrom));

  return {
    ...config,
    installmentDay: newDay,
    installmentDayHistory: updatedHistory,
  };
}
