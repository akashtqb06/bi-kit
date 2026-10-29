import type { BudgetPeriod } from '../constants';

export type BudgetStatus = 'ok' | 'warning' | 'over_budget';

export interface CategoryBudgetProgress {
  budgetId: string;
  categoryId: string;
  categoryName: string;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  period: BudgetPeriod;
  startDate: string;
  endDate?: string | null;
  budgetedAmount: number; // base budgeted amount in paise
  rolloverAmount: number; // surplus (+) or deficit (-) from previous month in paise
  effectiveBudget: number; // budgetedAmount + (rolloverEnabled ? rolloverAmount : 0)
  spentAmount: number; // net spent in paise (expenses - refunds)
  remainingAmount: number; // Math.max(0, effectiveBudget - spentAmount) in paise
  overspentAmount: number; // Math.max(0, spentAmount - effectiveBudget) in paise
  percentageUsed: number; // (spentAmount / effectiveBudget) * 100
  status: BudgetStatus;
  isOverBudget: boolean;
  isNearLimit: boolean; // >= 80% and <= 100%
  transactionCount: number;
}

export interface TotalBudgetSummary {
  month: string; // 'YYYY-MM'
  totalBudgeted: number; // in paise
  totalEffectiveBudget: number; // in paise
  totalSpent: number; // in paise
  totalRemaining: number; // in paise
  totalOverspent: number; // in paise
  percentageUsed: number;
  status: BudgetStatus;
  totalBudgetsCount: number;
  overBudgetCount: number;
  warningCount: number;
  onTrackCount: number;
}

export interface CopyBudgetCandidate {
  categoryId: string;
  categoryName: string;
  amount: number;
  period: BudgetPeriod;
  sourceBudgetId: string;
}

export interface CopyLastMonthPlan {
  previousMonth: string; // 'YYYY-MM'
  currentMonth: string; // 'YYYY-MM'
  canCopy: boolean;
  candidates: CopyBudgetCandidate[];
  alreadyExistingCategoryIds: string[];
}

export interface RolloverOptions {
  enabled: boolean;
  allowDeficits?: boolean; // if false, negative surplus is capped at 0 (never lowers next month budget)
}
