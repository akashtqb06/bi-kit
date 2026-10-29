import { and, eq, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finCategories, finRecurringRules, finTransactions } from '@src/lib/db';
import { BadRequestError, NotFoundError } from '@src/app/api/utils';
import type { RecurringFrequency } from '../constants';
import {
  type CreateRecurringRuleDTO,
  type RecurringRuleDTO,
  type UpdateRecurringRuleDTO,
  createRecurringRuleSchema,
  updateRecurringRuleSchema,
} from '../contract';

export function mapRecurringRuleToDTO(row: typeof finRecurringRules.$inferSelect): RecurringRuleDTO {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    type: row.type as RecurringRuleDTO['type'],
    amount: Number(row.amount),
    payee: row.payee,
    note: row.note,
    frequency: row.frequency as RecurringRuleDTO['frequency'],
    interval: row.interval,
    startDate: row.startDate,
    endDate: row.endDate,
    nextOccurrence: row.nextOccurrence,
    isActive: row.isActive,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export function advanceRecurringDate(
  currentDate: string,
  frequency: RecurringFrequency,
  interval: number
): string {
  const [y, m, d] = currentDate.split('-').map((v) => parseInt(v, 10));
  const date = new Date(Date.UTC(y, m - 1, d));

  switch (frequency) {
    case 'daily':
      date.setUTCDate(date.getUTCDate() + interval);
      break;
    case 'weekly':
      date.setUTCDate(date.getUTCDate() + interval * 7);
      break;
    case 'monthly': {
      const targetMonth = m - 1 + interval;
      date.setUTCMonth(targetMonth);
      break;
    }
    case 'quarterly': {
      const targetMonth = m - 1 + interval * 3;
      date.setUTCMonth(targetMonth);
      break;
    }
    case 'yearly': {
      date.setUTCFullYear(date.getUTCFullYear() + interval);
      break;
    }
  }

  return date.toISOString().slice(0, 10);
}

export async function listRecurringRules(userId: string): Promise<RecurringRuleDTO[]> {
  const rows = await db
    .select()
    .from(finRecurringRules)
    .where(eq(finRecurringRules.userId, userId))
    .orderBy(finRecurringRules.nextOccurrence);

  return rows.map(mapRecurringRuleToDTO);
}

export async function getRecurringRule(userId: string, ruleId: string): Promise<RecurringRuleDTO> {
  const [row] = await db
    .select()
    .from(finRecurringRules)
    .where(and(eq(finRecurringRules.id, ruleId), eq(finRecurringRules.userId, userId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Recurring rule not found: ${ruleId}`);
  }

  return mapRecurringRuleToDTO(row);
}

export async function createRecurringRule(
  userId: string,
  data: CreateRecurringRuleDTO
): Promise<RecurringRuleDTO> {
  const validated = createRecurringRuleSchema.parse(data);

  // Validate account
  const [account] = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(and(eq(finAccounts.id, validated.accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${validated.accountId}`);
  }

  if (validated.type === 'transfer') {
    if (!validated.toAccountId || validated.toAccountId === validated.accountId) {
      throw new BadRequestError('Transfer recurring rule requires distinct toAccountId');
    }
    const [toAccount] = await db
      .select({ id: finAccounts.id })
      .from(finAccounts)
      .where(and(eq(finAccounts.id, validated.toAccountId), eq(finAccounts.userId, userId)))
      .limit(1);
    if (!toAccount) {
      throw new NotFoundError(`Destination account not found: ${validated.toAccountId}`);
    }
  }

  if (validated.categoryId) {
    const [cat] = await db
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(
        and(
          eq(finCategories.id, validated.categoryId),
          sql`(${finCategories.userId} = ${userId} OR ${finCategories.isSystem} = true)`
        )
      )
      .limit(1);
    if (!cat) {
      throw new NotFoundError(`Category not found: ${validated.categoryId}`);
    }
  }

  const nextOccurrence = validated.nextOccurrence || validated.startDate;

  const [row] = await db
    .insert(finRecurringRules)
    .values({
      userId,
      accountId: validated.accountId,
      toAccountId: validated.toAccountId || null,
      categoryId: validated.categoryId || null,
      type: validated.type,
      amount: validated.amount,
      payee: validated.payee || null,
      note: validated.note || null,
      frequency: validated.frequency,
      interval: validated.interval,
      startDate: validated.startDate,
      endDate: validated.endDate || null,
      nextOccurrence,
      isActive: true,
    })
    .returning();

  return mapRecurringRuleToDTO(row);
}

export async function updateRecurringRule(
  userId: string,
  ruleId: string,
  data: UpdateRecurringRuleDTO
): Promise<RecurringRuleDTO> {
  const validated = updateRecurringRuleSchema.parse(data);
  await getRecurringRule(userId, ruleId);

  const updateValues: Partial<typeof finRecurringRules.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.accountId !== undefined) updateValues.accountId = validated.accountId;
  if (validated.toAccountId !== undefined) updateValues.toAccountId = validated.toAccountId;
  if (validated.categoryId !== undefined) updateValues.categoryId = validated.categoryId;
  if (validated.amount !== undefined) updateValues.amount = validated.amount;
  if (validated.payee !== undefined) updateValues.payee = validated.payee;
  if (validated.note !== undefined) updateValues.note = validated.note;
  if (validated.frequency !== undefined) updateValues.frequency = validated.frequency;
  if (validated.interval !== undefined) updateValues.interval = validated.interval;
  if (validated.startDate !== undefined) updateValues.startDate = validated.startDate;
  if (validated.endDate !== undefined) updateValues.endDate = validated.endDate;
  if (validated.nextOccurrence !== undefined) updateValues.nextOccurrence = validated.nextOccurrence;
  if (validated.isActive !== undefined) updateValues.isActive = validated.isActive;

  const [updated] = await db
    .update(finRecurringRules)
    .set(updateValues)
    .where(and(eq(finRecurringRules.id, ruleId), eq(finRecurringRules.userId, userId)))
    .returning();

  return mapRecurringRuleToDTO(updated);
}

export async function deleteRecurringRule(userId: string, ruleId: string): Promise<void> {
  await getRecurringRule(userId, ruleId);

  // Null out recurringRuleId on generated transactions so they are preserved
  // but no longer reference the deleted rule (task spec: keep transactions with ruleId=null).
  await db
    .update(finTransactions)
    .set({ recurringRuleId: null })
    .where(and(eq(finTransactions.userId, userId), eq(finTransactions.recurringRuleId, ruleId)));

  await db
    .delete(finRecurringRules)
    .where(and(eq(finRecurringRules.id, ruleId), eq(finRecurringRules.userId, userId)));
}

/**
 * Processes due recurring rules across users and materializes transactions.
 */
export async function processRecurringRules(): Promise<{ processed: number; generated: number }> {
  const today = new Date().toISOString().slice(0, 10);

  const dueRules = await db
    .select()
    .from(finRecurringRules)
    .where(
      and(
        eq(finRecurringRules.isActive, true),
        lte(finRecurringRules.nextOccurrence, today)
      )
    );

  let generated = 0;

  for (const rule of dueRules) {
    let signedAmount = -Math.abs(Number(rule.amount));
    if (rule.type === 'income') {
      signedAmount = Math.abs(Number(rule.amount));
    }

    // Materialize transaction
    await db.insert(finTransactions).values({
      userId: rule.userId,
      accountId: rule.accountId,
      toAccountId: rule.toAccountId,
      categoryId: rule.categoryId,
      date: rule.nextOccurrence,
      type: rule.type,
      amount: Number(rule.amount),
      signedAmount,
      payee: rule.payee,
      note: rule.note,
      isRecurring: true,
      recurringRuleId: rule.id,
    });
    generated += 1;

    // Advance occurrence
    const nextDate = advanceRecurringDate(
      rule.nextOccurrence,
      rule.frequency as RecurringFrequency,
      rule.interval
    );

    const isExpired = rule.endDate && nextDate > rule.endDate;

    await db
      .update(finRecurringRules)
      .set({
        nextOccurrence: nextDate,
        isActive: !isExpired,
        updatedAt: new Date(),
      })
      .where(eq(finRecurringRules.id, rule.id));
  }

  return { processed: dueRules.length, generated };
}
