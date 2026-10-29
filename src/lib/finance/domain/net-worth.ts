import type { AccountClass, AccountKind } from '../constants';
import { calculateCreditCardOutstanding, calculateLoanOutstanding } from './credit-card';

export interface AccountForNetWorth {
  id: string;
  kind: AccountKind;
  class: AccountClass;
  balance: number; // in paise
  currentValue?: number | null; // in paise (for investments/deposits if available)
  isActive?: boolean;
}

export interface NetWorthBreakdown {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

/**
 * Calculates user net worth across accounts according to contract rules:
 * - Asset accounts: use currentValue if provided (e.g. for investments / deposits), otherwise ledger balance.
 * - Liability accounts:
 *   - credit_card: outstanding = max(0, -balance)
 *   - loan / other_liability: outstanding = max(0, balance)
 * - Net Worth = totalAssets - totalLiabilities
 */
export function calculateNetWorth(accounts: AccountForNetWorth[]): NetWorthBreakdown {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    if (acc.isActive === false) {
      continue;
    }

    if (acc.class === 'asset') {
      const val = acc.currentValue !== null && acc.currentValue !== undefined
        ? acc.currentValue
        : acc.balance;
      totalAssets += Math.max(0, val);
    } else if (acc.class === 'liability') {
      let outstanding = 0;
      if (acc.kind === 'credit_card') {
        outstanding = calculateCreditCardOutstanding(acc.balance);
      } else {
        outstanding = calculateLoanOutstanding(acc.balance);
      }
      totalLiabilities += outstanding;
    }
  }

  return {
    totalAssets,
    totalLiabilities,
    netWorth: totalAssets - totalLiabilities,
  };
}
