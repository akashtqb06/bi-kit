import type { TransactionType } from '../constants';

export interface ValuationRecord {
  date: string;
  value: number;
  costBasis?: number | null;
}

export interface InvestmentTransactionRecord {
  accountId: string;
  toAccountId?: string | null;
  type: TransactionType;
  amount: number;
  date: string;
  deletedAt?: string | Date | null;
}

/**
 * Calculates current market value of an investment account as of a date.
 * Falls back to ledger balance if no valuation exists on or before asOfDate.
 */
export function calculateInvestmentCurrentValue(
  valuations: ValuationRecord[],
  fallbackLedgerBalance: number,
  asOfDate?: string
): number {
  const eligible = valuations
    .filter((v) => !asOfDate || v.date <= asOfDate)
    .sort((a, b) => b.date.localeCompare(a.date));

  if (eligible.length > 0) {
    return eligible[0].value;
  }

  return fallbackLedgerBalance;
}

/**
 * Calculates principal contributions into an investment account.
 * Formula: Net transfers in = sum(Transfers in) - sum(Transfers out).
 * (Direct income like dividends or fees are investment returns/expenses, not principal contributions).
 */
export function calculateInvestmentContributions(
  transactions: InvestmentTransactionRecord[],
  accountId: string,
  asOfDate?: string
): number {
  let transfersIn = 0;
  let transfersOut = 0;

  for (const tx of transactions) {
    if (tx.deletedAt != null) {
      continue;
    }
    if (asOfDate && tx.date > asOfDate) {
      continue;
    }

    if (tx.type === 'transfer') {
      if (tx.toAccountId === accountId) {
        transfersIn += Math.abs(tx.amount);
      }
      if (tx.accountId === accountId) {
        transfersOut += Math.abs(tx.amount);
      }
    }
  }

  return transfersIn - transfersOut;
}

/**
 * Calculates investment gain.
 * Gain = Current Value - Net Contributions.
 */
export function calculateInvestmentGain(
  currentValue: number,
  contributions: number
): number {
  return currentValue - contributions;
}
