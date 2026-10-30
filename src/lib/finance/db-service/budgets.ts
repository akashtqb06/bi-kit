import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db, finBudgets, finCategories, finTransactions } from '@src/lib/db';
import { NotFoundError } from '@src/app/api/utils';
import { getDeterministicCategoryColor } from '../colors';
import {
  type BudgetDTO,
  type BudgetFilters,
  type BudgetProgressDTO,
  type CreateBudgetDTO,
  type UpdateBudgetDTO,
  createBudgetSchema,
  updateBudgetSchema,
} from '../contract';

export function mapBudgetToDTO(row: typeof finBudgets.$inferSelect): BudgetDTO {
  return {
    id: row.id,
    userId: row.userId,
    categoryId: row.categoryId,
    amount: Number(row.amount),
    period: row.period as BudgetDTO['period'],
    startDate: row.startDate,
    endDate: row.endDate,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Computes current period date boundaries for a given budget period.
 */
function getPeriodBoundaries(period: 'monthly' | 'quarterly' | 'yearly', asOf = new Date()): {
  startDate: string;
  endDate: string;
} {
  const y = asOf.getUTCFullYear();
  const m = asOf.getUTCMonth(); // 0-indexed

  if (period === 'monthly') {
    const start = `${y}-${String(m + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, m + 1, 0)).getUTCDate();
    const end = `${y}-${String(m + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate: start, endDate: end };
  }

  if (period === 'quarterly') {
    const quarter = Math.floor(m / 3);
    const startMonth = quarter * 3;
    const endMonth = startMonth + 2;
    const start = `${y}-${String(startMonth + 1).padStart(2, '0')}-01`;
    const lastDay = new Date(Date.UTC(y, endMonth + 1, 0)).getUTCDate();
    const end = `${y}-${String(endMonth + 1).padStart(2, '0')}-${String(lastDay).padStart(2, '0')}`;
    return { startDate: start, endDate: end };
  }

  // yearly
  return {
    startDate: `${y}-01-01`,
    endDate: `${y}-12-31`,
  };
}

export async function listBudgets(
  userId: string,
  filters?: BudgetFilters
): Promise<{ budgets: BudgetDTO[]; progress: BudgetProgressDTO[] }> {
  const conditions = [eq(finBudgets.userId, userId)];

  if (filters?.period) {
    conditions.push(eq(finBudgets.period, filters.period));
  }

  const today = new Date().toISOString().slice(0, 10);
  if (filters?.activeOnly) {
    conditions.push(
      sql`(${finBudgets.endDate} IS NULL OR ${finBudgets.endDate} >= ${today})`
    );
  }

  const budgetRows = await db
    .select({
      budget: finBudgets,
      categoryName: finCategories.name,
      categoryColor: finCategories.color,
    })
    .from(finBudgets)
    .innerJoin(finCategories, eq(finBudgets.categoryId, finCategories.id))
    .where(and(...conditions))
    .orderBy(finBudgets.startDate);

  const budgets: BudgetDTO[] = [];
  const progress: BudgetProgressDTO[] = [];

  for (const { budget, categoryName, categoryColor } of budgetRows) {
    budgets.push(mapBudgetToDTO(budget));

    const boundaries = getPeriodBoundaries(budget.period as 'monthly' | 'quarterly' | 'yearly');

    // Sum transactions in this category for the current period
    const [spentRow] = await db
      .select({
        totalSpent: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.categoryId, budget.categoryId),
          eq(finTransactions.type, 'expense'),
          isNull(finTransactions.deletedAt),
          gte(finTransactions.date, boundaries.startDate),
          lte(finTransactions.date, boundaries.endDate)
        )
      );

    const spentAmount = Number(spentRow?.totalSpent || 0);
    const budgetedAmount = Number(budget.amount);
    const remainingAmount = budgetedAmount - spentAmount;
    const percentageUsed = budgetedAmount > 0
      ? Number(((spentAmount / budgetedAmount) * 100).toFixed(2))
      : 0;

    progress.push({
      budgetId: budget.id,
      categoryId: budget.categoryId,
      categoryName,
      categoryColor: categoryColor || getDeterministicCategoryColor(categoryName),
      period: budget.period as BudgetProgressDTO['period'],
      budgetedAmount,
      spentAmount,
      remainingAmount,
      percentageUsed,
    });
  }

  return { budgets, progress };
}

export async function getBudget(userId: string, budgetId: string): Promise<BudgetDTO> {
  const [row] = await db
    .select()
    .from(finBudgets)
    .where(and(eq(finBudgets.id, budgetId), eq(finBudgets.userId, userId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Budget not found: ${budgetId}`);
  }

  return mapBudgetToDTO(row);
}

export async function createBudget(userId: string, data: CreateBudgetDTO): Promise<BudgetDTO> {
  const validated = createBudgetSchema.parse(data);

  // Validate category exists and is accessible
  const [category] = await db
    .select({ id: finCategories.id })
    .from(finCategories)
    .where(
      and(
        eq(finCategories.id, validated.categoryId),
        sql`(${finCategories.userId} = ${userId} OR ${finCategories.isSystem} = true)`
      )
    )
    .limit(1);

  if (!category) {
    throw new NotFoundError(`Category not found: ${validated.categoryId}`);
  }

  const [row] = await db
    .insert(finBudgets)
    .values({
      userId,
      categoryId: validated.categoryId,
      amount: validated.amount,
      period: validated.period,
      startDate: validated.startDate,
      endDate: validated.endDate || null,
    })
    .returning();

  return mapBudgetToDTO(row);
}

export async function updateBudget(
  userId: string,
  budgetId: string,
  data: UpdateBudgetDTO
): Promise<BudgetDTO> {
  const validated = updateBudgetSchema.parse(data);
  await getBudget(userId, budgetId);

  const updateValues: Partial<typeof finBudgets.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.amount !== undefined) updateValues.amount = validated.amount;
  if (validated.period !== undefined) updateValues.period = validated.period;
  if (validated.startDate !== undefined) updateValues.startDate = validated.startDate;
  if (validated.endDate !== undefined) updateValues.endDate = validated.endDate;

  const [updated] = await db
    .update(finBudgets)
    .set(updateValues)
    .where(and(eq(finBudgets.id, budgetId), eq(finBudgets.userId, userId)))
    .returning();

  return mapBudgetToDTO(updated);
}

export async function deleteBudget(userId: string, budgetId: string): Promise<void> {
  await getBudget(userId, budgetId);

  await db
    .delete(finBudgets)
    .where(and(eq(finBudgets.id, budgetId), eq(finBudgets.userId, userId)));
}
