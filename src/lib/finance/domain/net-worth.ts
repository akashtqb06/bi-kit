import type { AccountClass, AccountKind } from '../constants';
import { calculateCreditCardOutstanding, calculateLoanOutstanding } from './credit-card';

export interface AccountForNetWorth {
  id: string;
  kind: AccountKind;
  class: AccountClass;
  balance: number; // in paise
  currentValue?: number | null; // in paise (for investments/deposits if available)
  isActive?: boolean;
  pensionMemo?: number | null; // in paise (for EPF/VPF EPS pension)
}

export interface NetWorthBreakdown {
  totalAssets: number;
  totalLiabilities: number;
  netWorth: number;
}

export interface NetWorthOptions {
  includeEpsInNetWorth?: boolean;
}

/**
 * Calculates user net worth across accounts according to contract rules:
 * - Asset accounts: use currentValue if provided (e.g. for investments / deposits), otherwise ledger balance.
 * - For EPF / VPF accounts: PF balance (employee + employer) is included in net worth. EPS pension memo
 *   is excluded by default and included only if options.includeEpsInNetWorth is true.
 * - Liability accounts:
 *   - credit_card: outstanding = max(0, -balance)
 *   - loan / other_liability: outstanding = max(0, balance)
 * - Net Worth = totalAssets - totalLiabilities
 */
export function calculateNetWorth(
  accounts: AccountForNetWorth[],
  options?: NetWorthOptions
): NetWorthBreakdown {
  let totalAssets = 0;
  let totalLiabilities = 0;

  for (const acc of accounts) {
    if (acc.isActive === false) {
      continue;
    }

    if (acc.class === 'asset') {
      let val = acc.currentValue !== null && acc.currentValue !== undefined
        ? acc.currentValue
        : acc.balance;

      if ((acc.kind === 'epf' || acc.kind === 'vpf') && options?.includeEpsInNetWorth && acc.pensionMemo) {
        val += acc.pensionMemo;
      }

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
