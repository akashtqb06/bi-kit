import type { TransactionType } from '../constants';

export interface BaseTransactionInput {
  accountId: string;
  toAccountId?: string | null;
  type: TransactionType;
  amount: number;
  signedAmount?: number;
  date?: string;
  deletedAt?: string | Date | null;
}

/**
 * Returns the signed delta to the balance of `targetAccountId`.
 *
 * Rules:
 * - If `targetAccountId === tx.accountId`:
 *   - expense: -amount
 *   - income: +amount
 *   - transfer: -amount (money leaving source account)
 *   - adjustment: signedAmount (or amount if signed)
 * - If `targetAccountId === tx.toAccountId` (for transfers):
 *   - transfer: +amount (money entering target account)
 * - Otherwise: 0
 */
export function getSignedTransactionEffect(
  tx: BaseTransactionInput,
  targetAccountId: string
): number {
  if (tx.deletedAt != null) {
    return 0;
  }

  const isSource = tx.accountId === targetAccountId;
  const isTarget = tx.toAccountId === targetAccountId;

  if (isSource) {
    switch (tx.type) {
      case 'expense':
        return -Math.abs(tx.amount);
      case 'income':
        return Math.abs(tx.amount);
      case 'transfer':
        return -Math.abs(tx.amount);
      case 'adjustment':
        return tx.signedAmount !== undefined ? tx.signedAmount : tx.amount;
      default:
        return 0;
    }
  }

  if (isTarget && tx.type === 'transfer') {
    return Math.abs(tx.amount);
  }

  return 0;
}

/**
 * Calculates the ledger balance of an account as of a given date (inclusive).
 */
export function calculateAccountBalance(
  transactions: BaseTransactionInput[],
  accountId: string,
  asOfDate?: string
): number {
  let balance = 0;

  for (const tx of transactions) {
    if (tx.deletedAt != null) {
      continue;
    }
    if (asOfDate && tx.date && tx.date > asOfDate) {
      continue;
    }
    balance += getSignedTransactionEffect(tx, accountId);
  }

  return balance;
}
