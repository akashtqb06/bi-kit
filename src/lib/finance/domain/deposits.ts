import type { CompoundingFrequency } from '../constants';

export interface FDParams {
  principal: number; // in paise
  annualInterestRate: number; // e.g. 0.075 for 7.5% or 7.5
  compoundingFrequency: CompoundingFrequency;
  startDate: string; // YYYY-MM-DD
  tenureMonths?: number;
  maturityDate?: string; // YYYY-MM-DD
  asOfDate?: string; // YYYY-MM-DD
  manualAnchor?: {
    date: string; // YYYY-MM-DD
    value: number; // in paise
  };
}

export interface FDMaturityResult {
  maturityDate: string;
  maturityAmount: number; // in paise
  totalInterest: number; // in paise
}

export interface RDTransfer {
  date: string; // YYYY-MM-DD
  amount: number; // in paise
}

export interface RDParams {
  monthlyInstallment: number; // in paise (R)
  annualInterestRate: number; // e.g. 0.068 for 6.8% or 6.8
  startDate: string; // YYYY-MM-DD
  tenureMonths: number; // M
  asOfDate?: string; // YYYY-MM-DD
  manualAnchor?: {
    date: string; // YYYY-MM-DD
    value: number; // in paise
  };
  installmentMode?: 'assume_schedule' | 'recorded_transfers';
  recordedTransfers?: RDTransfer[];
}

export interface RDMaturityResult {
  maturityDate: string;
  maturityAmount: number; // in paise
  totalInvested: number; // in paise
  totalInterest: number; // in paise
}

/**
 * Normalizes an interest rate to decimal fraction.
 * If user entered 6.8 (meaning 6.8%), returns 0.068.
 * If user entered 0.068, returns 0.068.
 */
export function normalizeInterestRate(rate: number): number {
  if (!rate || rate <= 0 || isNaN(rate)) return 0;
  return rate > 1 ? rate / 100 : rate;
}

/**
 * Returns the compounding frequency integer n per year.
 */
export function getCompoundingFrequencyCount(freq: CompoundingFrequency): number {
  switch (freq) {
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
      return 4; // Indian default quarterly
  }
}

/**
 * Adds months to a YYYY-MM-DD date string, clamping to the last day of the intended month.
 */
export function addMonthsToDate(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  const intendedMonth = (m - 1 + months) % 12;
  const positiveIntendedMonth = intendedMonth < 0 ? intendedMonth + 12 : intendedMonth;
  if (date.getUTCMonth() !== positiveIntendedMonth) {
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), positiveIntendedMonth + 1, 0));
    return lastDay.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Computes difference in tenure (in years) between two dates using month count / 12 convention.
 */
export function getTenureInYears(startDate: string, endDate: string): number {
  if (endDate <= startDate) return 0;
  return getMonthsBetweenDates(startDate, endDate) / 12.0;
}

/**
 * Computes months between two dates (fractional exponent support).
 * Accurately measures elapsed months between installment deposit date and evaluation date.
 * If day-of-month matches or is clamped month-end, returns integer months.
 */
export function getMonthsBetweenDates(startDate: string, endDate: string): number {
  if (endDate <= startDate) return 0;
  const [y1, m1, day1] = startDate.split('-').map(Number);
  const [y2, m2, day2] = endDate.split('-').map(Number);

  let months = (y2 - y1) * 12 + (m2 - m1);
  const daysInPrevMonth = new Date(Date.UTC(y2, m2 - 1, 0)).getUTCDate();
  const daysInCurMonth = new Date(Date.UTC(y2, m2, 0)).getUTCDate();

  const isD1EndOfMonth = day1 >= new Date(Date.UTC(y1, m1, 0)).getUTCDate();
  const isD2EndOfMonth = day2 >= daysInCurMonth;
  if (isD1EndOfMonth && isD2EndOfMonth) {
    return months;
  }

  if (day2 < day1) {
    months -= 1;
    const effectiveD1 = Math.min(day1, daysInPrevMonth);
    const extraDays = day2 + (daysInPrevMonth - effectiveD1);
    return Math.max(0, months + extraDays / daysInPrevMonth);
  } else {
    const extraDays = day2 - day1;
    return Math.max(0, months + extraDays / daysInCurMonth);
  }
}

/**
 * Backward compatibility alias for integer months elapsed.
 */
export function getMonthsElapsed(startDate: string, asOfDate: string): number {
  return Math.floor(getMonthsBetweenDates(startDate, asOfDate));
}

/**
 * Computes the scheduled installment date for installment index i (0-based) from startDate.
 */
export function getScheduledInstallmentDate(startDate: string, index: number): string {
  return addMonthsToDate(startDate, index);
}

/**
 * Finds the next upcoming installment date after asOfDate, up to maturityDate.
 */
export function getNextInstallmentDate(
  startDate: string,
  tenureMonths: number,
  asOfDate: string
): string | null {
  const maturityDate = addMonthsToDate(startDate, tenureMonths);
  if (asOfDate >= maturityDate) return null;

  for (let i = 0; i < tenureMonths; i++) {
    const instDate = addMonthsToDate(startDate, i);
    if (instDate > asOfDate) {
      return instDate;
    }
  }
  return null;
}

/**
 * Closed-form FD calculation with manual valuation anchor support.
 *
 * Formula:
 * - Compounded: A = P * (1 + r / n)^(n * t)
 * - Simple: A = P * (1 + r * t)
 * - If manual anchor exists:
 *   anchor compounds forward from anchor date to min(asOfDate, maturityDate).
 */
export function calculateFDAccruedValue(params: FDParams): number {
  const { principal, annualInterestRate, compoundingFrequency, startDate, asOfDate, manualAnchor } = params;

  if (principal <= 0) return 0;
  const r = normalizeInterestRate(annualInterestRate);

  let maturityDate = params.maturityDate;
  if (!maturityDate && params.tenureMonths) {
    maturityDate = addMonthsToDate(startDate, params.tenureMonths);
  }

  const effectiveAsOf = asOfDate || new Date().toISOString().slice(0, 10);

  if (effectiveAsOf <= startDate) {
    return principal;
  }

  const capDate = maturityDate && effectiveAsOf > maturityDate ? maturityDate : effectiveAsOf;
  const n = getCompoundingFrequencyCount(compoundingFrequency);

  // Manual anchor forward compounding
  if (manualAnchor && manualAnchor.date <= capDate) {
    if (capDate <= manualAnchor.date) {
      return manualAnchor.value;
    }
    const tAnchor = getTenureInYears(manualAnchor.date, capDate);
    if (n === 0) {
      return Math.round(manualAnchor.value + principal * r * tAnchor);
    }
    return Math.round(manualAnchor.value * Math.pow(1 + r / n, n * tAnchor));
  }

  const t = getTenureInYears(startDate, capDate);

  let accrued: number;
  if (n === 0) {
    accrued = principal * (1 + r * t);
  } else {
    accrued = principal * Math.pow(1 + r / n, n * t);
  }

  return Math.round(accrued);
}

/**
 * Calculates Fixed Deposit maturity date and final payout.
 */
export function calculateFDMaturity(params: {
  principal: number;
  annualInterestRate: number;
  compoundingFrequency: CompoundingFrequency;
  startDate: string;
  tenureMonths: number;
}): FDMaturityResult {
  const maturityDate = addMonthsToDate(params.startDate, params.tenureMonths);
  const maturityAmount = calculateFDAccruedValue({
    principal: params.principal,
    annualInterestRate: params.annualInterestRate,
    compoundingFrequency: params.compoundingFrequency,
    startDate: params.startDate,
    maturityDate,
    asOfDate: maturityDate,
  });

  return {
    maturityDate,
    maturityAmount,
    totalInterest: Math.max(0, maturityAmount - params.principal),
  };
}

/**
 * Computes total deposited into an RD account as of asOfDate.
 */
export function calculateRDTotalDeposited(params: {
  monthlyInstallment: number;
  startDate: string;
  tenureMonths: number;
  asOfDate?: string;
  installmentMode?: 'assume_schedule' | 'recorded_transfers';
  recordedTransfers?: RDTransfer[];
}): { totalDeposited: number; installmentsPaid: number } {
  const {
    monthlyInstallment,
    startDate,
    tenureMonths,
    asOfDate,
    installmentMode = 'assume_schedule',
    recordedTransfers = [],
  } = params;

  if (monthlyInstallment <= 0 || tenureMonths <= 0) {
    return { totalDeposited: 0, installmentsPaid: 0 };
  }

  const effectiveAsOf = asOfDate || new Date().toISOString().slice(0, 10);
  const maturityDate = addMonthsToDate(startDate, tenureMonths);
  const capDate = effectiveAsOf > maturityDate ? maturityDate : effectiveAsOf;

  if (installmentMode === 'recorded_transfers') {
    const validTransfers = recordedTransfers.filter(
      (t) => t.date <= capDate && t.amount > 0
    );
    const totalDeposited = validTransfers.reduce((sum, t) => sum + t.amount, 0);
    return { totalDeposited, installmentsPaid: validTransfers.length };
  }

  if (effectiveAsOf < startDate) {
    return { totalDeposited: 0, installmentsPaid: 0 };
  }

  let count = 0;
  for (let i = 0; i < tenureMonths; i++) {
    const instDate = addMonthsToDate(startDate, i);
    if (instDate <= capDate) {
      count++;
    } else {
      break;
    }
  }

  return {
    totalDeposited: count * monthlyInstallment,
    installmentsPaid: count,
  };
}

/**
 * Closed-form Recurring Deposit (RD) calculation complying with docs/FINANCE_CALCULATIONS.md.
 *
 * Convention:
 * - Installments are deposited monthly on the installment day from start date up to min(asOfDate, maturityDate).
 * - Each installment compounds quarterly at r/4 per quarter with fractional exponent months/3:
 *     value(asOf) = sum over installments of R * (1 + r / 400)^(months since that deposit / 3).
 * - Rate r is nominal annual percent (e.g. 6.8). With decimal fraction rDec = 0.068, formula is (1 + rDec / 4)^(months / 3).
 * - If manualAnchor exists:
 *     value = anchor * (1 + rDec / 4)^(months between anchor and asOf / 3) + new installments after anchor date.
 */
export function calculateRDAccruedValue(params: RDParams): number {
  const {
    monthlyInstallment,
    annualInterestRate,
    startDate,
    tenureMonths,
    asOfDate,
    manualAnchor,
    installmentMode = 'assume_schedule',
    recordedTransfers = [],
  } = params;

  if (monthlyInstallment <= 0 || tenureMonths <= 0) return 0;

  const r = normalizeInterestRate(annualInterestRate);
  const effectiveAsOf = asOfDate || new Date().toISOString().slice(0, 10);

  if (effectiveAsOf < startDate) {
    return 0;
  }

  const maturityDate = addMonthsToDate(startDate, tenureMonths);
  const capDate = effectiveAsOf > maturityDate ? maturityDate : effectiveAsOf;

  // Rate factor: (1 + r / 4) where r is decimal fraction (equivalent to 1 + rPercent / 400)
  const quarterFactor = 1 + r / 4;

  // Mode: Recorded transfers only
  if (installmentMode === 'recorded_transfers') {
    if (manualAnchor && manualAnchor.date <= capDate) {
      const anchorMonths = getMonthsBetweenDates(manualAnchor.date, capDate);
      let total = manualAnchor.value * Math.pow(quarterFactor, anchorMonths / 3);

      for (const t of recordedTransfers) {
        if (t.date > manualAnchor.date && t.date <= capDate && t.amount > 0) {
          const m = getMonthsBetweenDates(t.date, capDate);
          total += t.amount * Math.pow(quarterFactor, m / 3);
        }
      }
      return Math.round(total);
    }

    let total = 0;
    for (const t of recordedTransfers) {
      if (t.date <= capDate && t.amount > 0) {
        const m = getMonthsBetweenDates(t.date, capDate);
        total += t.amount * Math.pow(quarterFactor, m / 3);
      }
    }
    return Math.round(total);
  }

  // Mode: Assume schedule (default)
  // If manual anchor exists at or before capDate
  if (manualAnchor && manualAnchor.date <= capDate) {
    const anchorMonths = getMonthsBetweenDates(manualAnchor.date, capDate);
    let total = manualAnchor.value * Math.pow(quarterFactor, anchorMonths / 3);

    // Add scheduled installments that occur strictly after manualAnchor.date
    for (let i = 0; i < tenureMonths; i++) {
      const instDate = addMonthsToDate(startDate, i);
      if (instDate > manualAnchor.date && instDate <= capDate) {
        const m = getMonthsBetweenDates(instDate, capDate);
        total += monthlyInstallment * Math.pow(quarterFactor, m / 3);
      }
    }
    return Math.round(total);
  }

  // Standard schedule from start date
  let accrued = 0;
  for (let i = 0; i < tenureMonths; i++) {
    const instDate = addMonthsToDate(startDate, i);
    if (instDate <= capDate) {
      const monthsSinceDeposit = getMonthsBetweenDates(instDate, capDate);
      accrued += monthlyInstallment * Math.pow(quarterFactor, monthsSinceDeposit / 3);
    }
  }

  return Math.round(accrued);
}

/**
 * Calculates Recurring Deposit maturity payout.
 */
export function calculateRDMaturity(params: {
  monthlyInstallment: number;
  annualInterestRate: number;
  startDate: string;
  tenureMonths: number;
}): RDMaturityResult {
  const { monthlyInstallment, annualInterestRate, startDate, tenureMonths } = params;
  const maturityDate = addMonthsToDate(startDate, tenureMonths);

  const maturityAmount = calculateRDAccruedValue({
    monthlyInstallment,
    annualInterestRate,
    startDate,
    tenureMonths,
    asOfDate: maturityDate,
    installmentMode: 'assume_schedule',
  });

  const totalInvested = monthlyInstallment * tenureMonths;

  return {
    maturityDate,
    maturityAmount,
    totalInvested,
    totalInterest: Math.max(0, maturityAmount - totalInvested),
  };
}
