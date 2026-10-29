import type { CompoundingFrequency } from '../constants';

export interface FDParams {
  principal: number; // in paise
  annualInterestRate: number; // e.g. 0.075 for 7.5%
  compoundingFrequency: CompoundingFrequency;
  startDate: string; // YYYY-MM-DD
  tenureMonths?: number;
  maturityDate?: string; // YYYY-MM-DD
  asOfDate?: string; // YYYY-MM-DD
}

export interface FDMaturityResult {
  maturityDate: string;
  maturityAmount: number; // in paise
  totalInterest: number; // in paise
}

export interface RDParams {
  monthlyInstallment: number; // in paise (P)
  annualInterestRate: number; // e.g. 0.075 for 7.5%
  startDate: string; // YYYY-MM-DD
  tenureMonths: number; // M
  asOfDate?: string; // YYYY-MM-DD
}

export interface RDMaturityResult {
  maturityDate: string;
  maturityAmount: number; // in paise
  totalInvested: number; // in paise
  totalInterest: number; // in paise
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
 * Adds months to a YYYY-MM-DD date string.
 */
export function addMonthsToDate(dateStr: string, months: number): string {
  const [y, m, d] = dateStr.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1 + months, d));
  // If date rolled over due to month length (e.g. Feb 30 -> Mar 2), clamp to last day of intended month
  const intendedMonth = (m - 1 + months) % 12;
  const positiveIntendedMonth = intendedMonth < 0 ? intendedMonth + 12 : intendedMonth;
  if (date.getUTCMonth() !== positiveIntendedMonth) {
    // Clamped to last day of intended month
    const lastDay = new Date(Date.UTC(date.getUTCFullYear(), positiveIntendedMonth + 1, 0));
    return lastDay.toISOString().slice(0, 10);
  }
  return date.toISOString().slice(0, 10);
}

/**
 * Computes difference in fractional years (365-day convention) between two dates.
 */
export function getTenureInYears(startDate: string, endDate: string): number {
  const start = new Date(`${startDate}T00:00:00Z`).getTime();
  const end = new Date(`${endDate}T00:00:00Z`).getTime();
  if (end <= start) return 0;
  const days = (end - start) / (86400 * 1000);
  return days / 365.0;
}

/**
 * Computes the number of months elapsed from startDate to asOfDate.
 */
export function getMonthsElapsed(startDate: string, asOfDate: string): number {
  const [sy, sm, sd] = startDate.split('-').map((v) => parseInt(v, 10));
  const [ey, em, ed] = asOfDate.split('-').map((v) => parseInt(v, 10));

  let months = (ey - sy) * 12 + (em - sm);
  if (ed < sd) {
    months -= 1;
  }
  return Math.max(0, months);
}

/**
 * Closed-form FD calculation.
 * Formula:
 * - Compounded: A = P * (1 + r/n)^(n * t)
 * - Simple: A = P * (1 + r * t)
 * Rounding to nearest integer paise.
 */
export function calculateFDAccruedValue(params: FDParams): number {
  const { principal, annualInterestRate, compoundingFrequency, startDate, asOfDate } = params;

  if (principal <= 0) return 0;

  // Determine maturity date
  let maturityDate = params.maturityDate;
  if (!maturityDate && params.tenureMonths) {
    maturityDate = addMonthsToDate(startDate, params.tenureMonths);
  }

  const effectiveAsOf = asOfDate || new Date().toISOString().slice(0, 10);

  if (effectiveAsOf <= startDate) {
    return principal;
  }

  // If asOfDate is past maturityDate, interest stops accumulating after maturity
  const capDate = maturityDate && effectiveAsOf > maturityDate ? maturityDate : effectiveAsOf;
  const t = getTenureInYears(startDate, capDate);

  const n = getCompoundingFrequencyCount(compoundingFrequency);

  let accrued: number;
  if (n === 0) {
    // Simple Interest
    accrued = principal * (1 + annualInterestRate * t);
  } else {
    // Compound Interest
    accrued = principal * Math.pow(1 + annualInterestRate / n, n * t);
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
    totalInterest: maturityAmount - params.principal,
  };
}

/**
 * Closed-form Recurring Deposit (RD) calculation.
 * Formula:
 * A = sum_{k=1}^M P * (1 + r/4)^(k / 3)
 * Where k is the number of months each installment remains invested.
 *
 * For accrued value as of an intermediate date:
 * Installments deposited so far are m = min(tenureMonths, monthsElapsed + 1).
 * Accrued = sum_{j=1}^m P * (1 + r/4)^((m - j + 1) / 3)
 */
export function calculateRDAccruedValue(params: RDParams): number {
  const { monthlyInstallment, annualInterestRate, startDate, tenureMonths, asOfDate } = params;

  if (monthlyInstallment <= 0 || tenureMonths <= 0) return 0;

  const effectiveAsOf = asOfDate || new Date().toISOString().slice(0, 10);

  if (effectiveAsOf < startDate) {
    return 0;
  }

  const maturityDate = addMonthsToDate(startDate, tenureMonths);
  if (effectiveAsOf >= maturityDate) {
    return calculateRDMaturity(params).maturityAmount;
  }

  // Installment count deposited so far (1st on startDate, 2nd month 1, etc.)
  const monthsCompleted = getMonthsElapsed(startDate, effectiveAsOf);
  const installmentsPaid = Math.min(tenureMonths, monthsCompleted + 1);

  let accrued = 0;
  for (let j = 1; j <= installmentsPaid; j++) {
    const k = installmentsPaid - j + 1; // months this installment has been compounding
    accrued += monthlyInstallment * Math.pow(1 + annualInterestRate / 4, k / 3);
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

  let maturityAmount = 0;
  for (let k = 1; k <= tenureMonths; k++) {
    maturityAmount += monthlyInstallment * Math.pow(1 + annualInterestRate / 4, k / 3);
  }

  const roundedMaturity = Math.round(maturityAmount);
  const totalInvested = monthlyInstallment * tenureMonths;

  return {
    maturityDate,
    maturityAmount: roundedMaturity,
    totalInvested,
    totalInterest: roundedMaturity - totalInvested,
  };
}
