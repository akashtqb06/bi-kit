import type { BudgetDTO, CategoryDTO, TransactionDTO } from '../contract';
import type {
  CategoryBudgetProgress,
  CopyBudgetCandidate,
  CopyLastMonthPlan,
  RolloverOptions,
  TotalBudgetSummary,
} from './types';

/**
 * Returns the current calendar month formatted as 'YYYY-MM'.
 */
export function getCurrentMonthString(date = new Date()): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  return `${y}-${m}`;
}

/**
 * Calculates previous month string in 'YYYY-MM' format.
 */
export function getPreviousMonthString(monthStr: string): string {
  const [yearStr, mStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(mStr, 10);

  if (month === 1) {
    month = 12;
    year -= 1;
  } else {
    month -= 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Calculates next month string in 'YYYY-MM' format.
 */
export function getNextMonthString(monthStr: string): string {
  const [yearStr, mStr] = monthStr.split('-');
  let year = parseInt(yearStr, 10);
  let month = parseInt(mStr, 10);

  if (month === 12) {
    month = 1;
    year += 1;
  } else {
    month += 1;
  }

  return `${year}-${String(month).padStart(2, '0')}`;
}

/**
 * Returns ISO date boundaries [startDate, endDate] for a given month 'YYYY-MM'.
 */
export function getMonthDateRange(monthStr: string): { startDate: string; endDate: string } {
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);

  // Month is 1-indexed, passing next month and 0 day gets the last day of target month
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const startDate = `${yearStr}-${mStr}-01`;
  const endDate = `${yearStr}-${mStr}-${String(lastDay).padStart(2, '0')}`;

  return { startDate, endDate };
}

/**
 * Formats a 'YYYY-MM' string into a friendly label like "October 2026".
 */
export function formatMonthLabel(monthStr: string): string {
  const [yearStr, mStr] = monthStr.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(mStr, 10);

  const date = new Date(Date.UTC(year, month - 1, 1));
  return date.toLocaleDateString('en-US', { month: 'long', year: 'numeric', timeZone: 'UTC' });
}

export interface CalculateSpendOptions {
  categoryId: string;
  transactions: TransactionDTO[];
  startDate: string;
  endDate: string;
}

export interface SpendBreakdown {
  spentAmount: number; // in paise
  expenseAmount: number; // in paise
  refundAmount: number; // in paise
  transactionCount: number;
}

/**
 * Computes category spend for a given date window.
 *
 * Rules:
 * - Soft-deleted transactions (deletedAt != null) are strictly excluded.
 * - Transactions outside the date window [startDate, endDate] are excluded.
 * - 'expense' transactions with matching categoryId add to expenseAmount.
 * - 'income' transactions with matching categoryId (e.g. refunds credited to the category)
 *   add to refundAmount and deduct from the net spend.
 * - 'transfer' transactions NEVER count toward budget spending under any circumstance.
 * - 'adjustment' transactions do not count toward category budget spend.
 * - Net spend is non-negative: Math.max(0, expenseAmount - refundAmount).
 */
export function calculateCategorySpend(options: CalculateSpendOptions): SpendBreakdown {
  const { categoryId, transactions, startDate, endDate } = options;

  let expenseAmount = 0;
  let refundAmount = 0;
  let transactionCount = 0;

  for (const txn of transactions) {
    // 1. Exclude soft-deleted
    if (txn.deletedAt) continue;

    // 2. Date window check
    if (txn.date < startDate || txn.date > endDate) continue;

    // 3. Category match
    if (txn.categoryId !== categoryId) continue;

    // 4. Transfers NEVER count toward budget spending!
    if (txn.type === 'transfer') continue;

    // 5. Adjustments do not count toward category budget spend
    if (txn.type === 'adjustment') continue;

    // 6. Expense
    if (txn.type === 'expense') {
      expenseAmount += Math.abs(txn.amount);
      transactionCount += 1;
    }

    // 7. Income (Refunds credited to the category)
    if (txn.type === 'income') {
      refundAmount += Math.abs(txn.amount);
      transactionCount += 1;
    }
  }

  const spentAmount = Math.max(0, expenseAmount - refundAmount);

  return {
    spentAmount,
    expenseAmount,
    refundAmount,
    transactionCount,
  };
}

export interface ProgressComputationInput {
  budget: BudgetDTO;
  categoryName: string;
  categoryColor?: string | null;
  categoryIcon?: string | null;
  transactions: TransactionDTO[];
  monthStr: string; // 'YYYY-MM'
  rolloverAmount?: number;
  rolloverEnabled?: boolean;
}

/**
 * Calculates full progress for an individual budget item in a specific month.
 */
export function calculateBudgetProgress(input: ProgressComputationInput): CategoryBudgetProgress {
  const {
    budget,
    categoryName,
    categoryColor,
    categoryIcon,
    transactions,
    monthStr,
    rolloverAmount = 0,
    rolloverEnabled = false,
  } = input;

  const { startDate, endDate } = getMonthDateRange(monthStr);

  const { spentAmount, transactionCount } = calculateCategorySpend({
    categoryId: budget.categoryId,
    transactions,
    startDate,
    endDate,
  });

  const budgetedAmount = budget.amount;
  const effectiveRollover = rolloverEnabled ? rolloverAmount : 0;
  const effectiveBudget = Math.max(0, budgetedAmount + effectiveRollover);

  const remainingAmount = Math.max(0, effectiveBudget - spentAmount);
  const overspentAmount = Math.max(0, spentAmount - effectiveBudget);

  let percentageUsed = 0;
  if (effectiveBudget > 0) {
    percentageUsed = Number(((spentAmount / effectiveBudget) * 100).toFixed(2));
  } else if (spentAmount > 0) {
    percentageUsed = 100;
  }

  const isOverBudget = spentAmount > effectiveBudget;
  const isNearLimit = !isOverBudget && percentageUsed >= 80;

  const status: CategoryBudgetProgress['status'] = isOverBudget
    ? 'over_budget'
    : isNearLimit
      ? 'warning'
      : 'ok';

  return {
    budgetId: budget.id,
    categoryId: budget.categoryId,
    categoryName,
    categoryColor,
    categoryIcon,
    period: budget.period,
    startDate: budget.startDate,
    endDate: budget.endDate,
    budgetedAmount,
    rolloverAmount,
    effectiveBudget,
    spentAmount,
    remainingAmount,
    overspentAmount,
    percentageUsed,
    status,
    isOverBudget,
    isNearLimit,
    transactionCount,
  };
}

export interface RolloverComputationParams {
  categoryBudgets: BudgetDTO[];
  transactions: TransactionDTO[];
  currentMonth: string; // 'YYYY-MM'
  options?: RolloverOptions;
}

/**
 * Computes rollover amounts for each category from the previous month.
 * Returns a map of categoryId -> rolloverAmount in paise.
 *
 * If prior month budget existed:
 *   surplus = priorEffectiveBudget - priorSpent
 *   positive surplus = unspent budget carried forward into current month
 *   negative surplus (if allowDeficits is true) = deficit reducing current month budget
 */
export function computeCategoryRollovers(params: RolloverComputationParams): Map<string, number> {
  const { categoryBudgets, transactions, currentMonth, options } = params;
  const rolloverMap = new Map<string, number>();

  if (!options?.enabled) {
    return rolloverMap;
  }

  const prevMonth = getPreviousMonthString(currentMonth);
  const { startDate: prevStart, endDate: prevEnd } = getMonthDateRange(prevMonth);

  // Find all budgets relevant to the previous month
  const prevMonthBudgets = categoryBudgets.filter((b) => {
    return b.startDate.slice(0, 7) === prevMonth;
  });

  for (const b of prevMonthBudgets) {
    const { spentAmount } = calculateCategorySpend({
      categoryId: b.categoryId,
      transactions,
      startDate: prevStart,
      endDate: prevEnd,
    });

    const surplus = b.amount - spentAmount;
    let rolloverValue = surplus;

    if (!options.allowDeficits && surplus < 0) {
      rolloverValue = 0;
    }

    rolloverMap.set(b.categoryId, rolloverValue);
  }

  return rolloverMap;
}

export interface TotalSummaryParams {
  month: string;
  items: CategoryBudgetProgress[];
}

/**
 * Calculates aggregate total summary across all category budgets for the month.
 */
export function calculateTotalBudgetSummary(params: TotalSummaryParams): TotalBudgetSummary {
  const { month, items } = params;

  let totalBudgeted = 0;
  let totalEffectiveBudget = 0;
  let totalSpent = 0;
  let totalRemaining = 0;
  let totalOverspent = 0;

  let overBudgetCount = 0;
  let warningCount = 0;
  let onTrackCount = 0;

  for (const item of items) {
    totalBudgeted += item.budgetedAmount;
    totalEffectiveBudget += item.effectiveBudget;
    totalSpent += item.spentAmount;
    totalRemaining += item.remainingAmount;
    totalOverspent += item.overspentAmount;

    if (item.status === 'over_budget') {
      overBudgetCount += 1;
    } else if (item.status === 'warning') {
      warningCount += 1;
    } else {
      onTrackCount += 1;
    }
  }

  let percentageUsed = 0;
  if (totalEffectiveBudget > 0) {
    percentageUsed = Number(((totalSpent / totalEffectiveBudget) * 100).toFixed(2));
  } else if (totalSpent > 0) {
    percentageUsed = 100;
  }

  const isTotalOver = totalSpent > totalEffectiveBudget;
  const isTotalNearLimit = !isTotalOver && percentageUsed >= 80;

  const status: TotalBudgetSummary['status'] = isTotalOver
    ? 'over_budget'
    : isTotalNearLimit
      ? 'warning'
      : 'ok';

  return {
    month,
    totalBudgeted,
    totalEffectiveBudget,
    totalSpent,
    totalRemaining,
    totalOverspent,
    percentageUsed,
    status,
    totalBudgetsCount: items.length,
    overBudgetCount,
    warningCount,
    onTrackCount,
  };
}

export interface CopyPlanParams {
  allBudgets: BudgetDTO[];
  categories: CategoryDTO[];
  currentMonth: string; // 'YYYY-MM'
}

/**
 * Identifies budgets configured in the previous month that are missing in the current month.
 */
export function planCopyLastMonthBudgets(params: CopyPlanParams): CopyLastMonthPlan {
  const { allBudgets, categories, currentMonth } = params;
  const previousMonth = getPreviousMonthString(currentMonth);

  const categoryMap = new Map(categories.map((c) => [c.id, c.name]));

  // Budgets for current month
  const currentMonthCategoryIds = new Set(
    allBudgets
      .filter((b) => b.startDate.slice(0, 7) === currentMonth)
      .map((b) => b.categoryId)
  );

  // Budgets configured in previous month
  const prevMonthBudgets = allBudgets.filter((b) => {
    return b.startDate.slice(0, 7) === previousMonth;
  });

  const candidates: CopyBudgetCandidate[] = [];

  for (const b of prevMonthBudgets) {
    // If not already in current month
    if (!currentMonthCategoryIds.has(b.categoryId)) {
      candidates.push({
        categoryId: b.categoryId,
        categoryName: categoryMap.get(b.categoryId) || 'Unknown Category',
        amount: b.amount,
        period: b.period,
        sourceBudgetId: b.id,
      });
    }
  }

  return {
    previousMonth,
    currentMonth,
    canCopy: candidates.length > 0,
    candidates,
    alreadyExistingCategoryIds: Array.from(currentMonthCategoryIds),
  };
}
