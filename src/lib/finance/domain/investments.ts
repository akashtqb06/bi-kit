import type { TransactionType } from '../constants';

export interface ValuationRecord {
  date: string;
  value: number;
  costBasis?: number | null;
  note?: string | null;
  createdAt?: string | Date | null;
}

export interface InvestmentTransactionRecord {
  accountId: string;
  toAccountId?: string | null;
  type: TransactionType;
  amount: number;
  date: string;
  deletedAt?: string | Date | null;
  createdAt?: string | Date | null;
  isRecurring?: boolean | null;
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

/**
 * Determines whether a transaction occurs after (or compounds into) a valuation anchor.
 */
export function isTxAfterValuation(
  tx: InvestmentTransactionRecord,
  anchorDate: string,
  anchorCreatedAt: number | null
): boolean {
  // 1. Transactions dated strictly after the valuation date always occurred after the anchor snapshot.
  if (tx.date > anchorDate) {
    return true;
  }

  // 2. Transactions dated strictly before the valuation date occurred before the anchor snapshot.
  if (tx.date < anchorDate) {
    return false;
  }

  // 3. For transactions on the same date as the valuation anchor (tx.date === anchorDate):
  // Compare timestamps if available.
  const txCreatedAt = tx.createdAt ? new Date(tx.createdAt).getTime() : null;
  if (anchorCreatedAt != null && txCreatedAt != null) {
    return txCreatedAt > anchorCreatedAt;
  }

  // If timestamps are not available on the same date, assume the valuation was recorded
  // as an end-of-day snapshot (occurring after same-day transactions).
  return false;
}

/**
 * Calculates investment holding metrics (cost basis, current value, gain, return rate).
 * Adheres to:
 * - Cost Basis: Net principal contributions (sum(Transfers In) - sum(Transfers Out)) plus opening contribution.
 *   Subsequent transfers (including recurring rules) add to the cost basis and preserve accumulated gain.
 * - Current Value:
 *   Cost Basis + Current Gain (or latest valuation plus net transfers after anchor).
 * - Gain = Current Value - Cost Basis.
 * - Return Rate (Gain %) = (Gain / Cost Basis) * 100.
 */
export function calculateInvestmentHolding(params: {
  openingContribution: number;
  transactions: InvestmentTransactionRecord[];
  accountId: string;
  latestValuation?: ValuationRecord | null;
  asOfDate?: string;
}): {
  costBasis: number;
  currentValue: number;
  gain: number;
  gainPct: number | undefined;
} {
  const { openingContribution, transactions, accountId, latestValuation, asOfDate } = params;

  const validTxs = transactions.filter(
    (tx) => tx.deletedAt == null && (!asOfDate || tx.date <= asOfDate)
  );

  const isOpeningValuation =
    !latestValuation ||
    latestValuation.note === 'Opening valuation recorded during setup';

  let costBasis: number;
  let currentValue: number;

  if (isOpeningValuation) {
    const netTransfers = calculateInvestmentContributions(validTxs, accountId, asOfDate);
    const initialBasis =
      latestValuation?.costBasis != null ? latestValuation.costBasis : openingContribution;
    costBasis = initialBasis + netTransfers;
    currentValue =
      latestValuation != null ? latestValuation.value + netTransfers : costBasis;
  } else {
    // Manual valuation anchor recorded on latestValuation.date.
    // Cost basis is ALWAYS derived from transactions — the stored costBasis on a
    // non-opening valuation is intentionally ignored so that "Update Value" only
    // records the current market price without overriding the transaction-based
    // invested amount.
    const anchorDate = latestValuation.date;
    const anchorCreatedAt = latestValuation.createdAt
      ? new Date(latestValuation.createdAt).getTime()
      : null;

    // All contributions up to (and including) the anchor valuation
    const allTxsUpToAnchor = validTxs.filter(
      (t) => !isTxAfterValuation(t, anchorDate, anchorCreatedAt)
    );
    const baseCost =
      openingContribution +
      calculateInvestmentContributions(allTxsUpToAnchor, accountId, anchorDate);

    // Net new transfers added after the anchor (not yet captured in the valuation)
    let netTransfersAfterAnchor = 0;
    for (const tx of validTxs) {
      if (tx.type === 'transfer' && isTxAfterValuation(tx, anchorDate, anchorCreatedAt)) {
        if (tx.toAccountId === accountId) {
          netTransfersAfterAnchor += Math.abs(tx.amount);
        }
        if (tx.accountId === accountId) {
          netTransfersAfterAnchor -= Math.abs(tx.amount);
        }
      }
    }

    costBasis = baseCost + netTransfersAfterAnchor;
    currentValue = latestValuation.value + netTransfersAfterAnchor;
  }

  costBasis = Math.max(0, costBasis);
  currentValue = Math.max(0, currentValue);
  const gain = currentValue - costBasis;
  const gainPct =
    costBasis > 0 ? Math.round((gain / costBasis) * 1000) / 10 : undefined;

  return { costBasis, currentValue, gain, gainPct };
}
