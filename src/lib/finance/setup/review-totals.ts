import type { DraftAccount, ReviewTotals, AccountWarning } from './types';
import { ACCOUNT_KIND_CLASS_MAP } from '../constants';
import { calculateFDAccruedValue, calculateRDAccruedValue } from '../domain/deposits';

/**
 * Calculates review totals and warnings for draft accounts.
 * Client-safe pure computation without database dependencies.
 */
export function calculateReviewTotals(
  accounts: DraftAccount[],
  trackingStartDate: string
): ReviewTotals {
  let totalAssetsPaise = 0;
  let totalLiabilitiesPaise = 0;
  const warnings: AccountWarning[] = [];
  const seenNames = new Set<string>();

  for (const acc of accounts) {
    // 1. Check duplicate account names
    const normalizedName = acc.name.trim().toLowerCase();
    if (seenNames.has(normalizedName)) {
      warnings.push({
        accountId: acc.id,
        accountName: acc.name,
        type: 'duplicate_name',
        message: `Duplicate account name "${acc.name}". Please use unique names for accounts.`,
      });
    }
    seenNames.add(normalizedName);

    const kindClass = ACCOUNT_KIND_CLASS_MAP[acc.kind];

    if (kindClass === 'liability') {
      // Cards & loans: positive owed
      const owed = Math.max(0, acc.owedPaise || 0);
      totalLiabilitiesPaise += owed;

      // Card owed above limit warning
      if (
        acc.kind === 'credit_card' &&
        acc.creditLimitPaise !== undefined &&
        acc.creditLimitPaise > 0 &&
        owed > acc.creditLimitPaise
      ) {
        warnings.push({
          accountId: acc.id,
          accountName: acc.name,
          type: 'card_over_limit',
          message: `Credit card "${acc.name}" has an amount owed exceeding its credit limit.`,
        });
      }
    } else {
      // Assets
      if (acc.kind === 'fixed_deposit') {
        const principal = acc.principalPaise || acc.balancePaise || 0;
        let val = acc.currentValuePaise;
        if (val === undefined && principal > 0 && acc.startDate) {
          val = calculateFDAccruedValue({
            principal,
            annualInterestRate: (acc.interestRate || 0) / 100,
            compoundingFrequency: acc.compoundingFrequency ?? 'quarterly',
            startDate: acc.startDate,
            maturityDate: acc.maturityDate,
            asOfDate: trackingStartDate,
          });
        }
        totalAssetsPaise += Math.max(0, val || principal);

        if (acc.startDate && acc.maturityDate && acc.maturityDate <= acc.startDate) {
          warnings.push({
            accountId: acc.id,
            accountName: acc.name,
            type: 'fd_maturity_before_start',
            message: `Fixed deposit "${acc.name}" maturity date (${acc.maturityDate}) cannot be before or equal to start date (${acc.startDate}).`,
          });
        }
      } else if (acc.kind === 'recurring_deposit') {
        const installment = acc.monthlyInstallmentPaise || 0;
        let val = acc.currentValuePaise;
        if (val === undefined && installment > 0 && acc.startDate && acc.tenureMonths) {
          val = calculateRDAccruedValue({
            monthlyInstallment: installment,
            annualInterestRate: (acc.interestRate || 0) / 100,
            startDate: acc.startDate,
            tenureMonths: acc.tenureMonths,
            asOfDate: trackingStartDate,
          });
        }
        totalAssetsPaise += Math.max(0, val || 0);
      } else if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
        const val = acc.currentValuePaise || acc.balancePaise || 0;
        totalAssetsPaise += Math.max(0, val);
      } else {
        // Cash, Bank, Other asset
        const bal = acc.balancePaise || 0;
        if (acc.kind === 'cash' && bal < 0) {
          warnings.push({
            accountId: acc.id,
            accountName: acc.name,
            type: 'negative_cash',
            message: `Cash account "${acc.name}" has a negative balance (₹${(bal / 100).toFixed(2)}).`,
          });
        }
        totalAssetsPaise += bal;
      }
    }
  }

  return {
    totalAssetsPaise,
    totalLiabilitiesPaise,
    netWorthPaise: totalAssetsPaise - totalLiabilitiesPaise,
    warnings,
  };
}

