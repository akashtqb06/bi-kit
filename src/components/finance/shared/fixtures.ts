import type { AccountDTO } from '@src/lib/finance/contract';

export interface AccountWithBalance extends AccountDTO {
  balance: number; // in paise
  outstanding: number; // in paise (for liabilities)
  utilization: number; // 0 - 1
  currentValue: number; // in paise (for investments)
  costBasis?: number; // in paise (for investments)
  gain?: number; // in paise (for investments)
  gainPct?: number; // percentage
  accruedValue?: number; // in paise (for FD/RD)
  interestEarned?: number; // in paise (for FD/RD)
  projectedMaturityAmount?: number; // in paise (for FD/RD)
  daysToMaturity?: number; // for FD/RD
  statementDay?: number; // for cards (1-31)
  dueDay?: number; // for cards (1-31)
  dueDays?: number; // for cards (offset days)
  isOffsetDays?: boolean;
  lastStatementDate?: string; // YYYY-MM-DD
  nextStatementDate?: string; // YYYY-MM-DD (next bill date)
  currentDueDate?: string; // YYYY-MM-DD
  nextDueDate?: string; // YYYY-MM-DD
  monthlyInstallment?: number; // in paise (for RD)
  installmentsPaid?: number; // for RD
  totalInstallments?: number; // for RD
  totalDeposited?: number; // in paise (for RD)
  principal?: number; // in paise (for FD)
  interestRate?: number; // percentage (e.g. 6.8)
  compoundingFrequency?: string; // for FD
  maturityDate?: string; // YYYY-MM-DD
  nextInstallmentDate?: string; // YYYY-MM-DD
}
