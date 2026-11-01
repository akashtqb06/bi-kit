import { and, eq, sql } from 'drizzle-orm';
import { db, finAccounts, finRecurringRules, finTransactions } from '@src/lib/db';
import { NotFoundError } from '@src/app/api/utils';
import { ACCOUNT_KIND_CLASS_MAP } from '../constants';
import {
  type AccountDTO,
  type AccountFilters,
  type CreateAccountDTO,
  type UpdateAccountDTO,
  createAccountSchema,
  updateAccountSchema,
} from '../contract';
import {
  generateSchedule,
  type RDConfig,
  type RDDayHistoryItem,
} from '../domain/rd';

export function mapAccountToDTO(row: typeof finAccounts.$inferSelect): AccountDTO {
  return {
    id: row.id,
    userId: row.userId,
    name: row.name,
    kind: row.kind as AccountDTO['kind'],
    class: row.class as AccountDTO['class'],
    currency: row.currency,
    creditLimit: row.creditLimit !== null ? Number(row.creditLimit) : null,
    isActive: row.isActive,
    metadata: (row.metadata || {}) as Record<string, unknown>,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listAccounts(
  userId: string,
  filters?: AccountFilters
): Promise<AccountDTO[]> {
  const conditions = [eq(finAccounts.userId, userId)];

  if (filters?.class) {
    conditions.push(eq(finAccounts.class, filters.class));
  }
  if (filters?.kind) {
    conditions.push(eq(finAccounts.kind, filters.kind));
  }
  if (filters?.isActive !== undefined) {
    conditions.push(eq(finAccounts.isActive, filters.isActive));
  }

  const rows = await db
    .select()
    .from(finAccounts)
    .where(and(...conditions))
    .orderBy(finAccounts.name);

  return rows.map(mapAccountToDTO);
}

export async function getAccount(userId: string, accountId: string): Promise<AccountDTO> {
  const [row] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  return mapAccountToDTO(row);
}

export async function syncRDAutoDebitRule(
  userId: string,
  accountId: string,
  meta: Record<string, unknown>,
  accountName: string,
  accountIsActive: boolean = true
): Promise<void> {
  const payFromAccountId = (meta.payFromAccountId as string | null) || null;
  const autoDebit = meta.autoDebit !== undefined ? Boolean(meta.autoDebit) : Boolean(payFromAccountId);
  const monthlyInstallment = Number(
    meta.monthlyInstallmentPaise ??
      meta.monthlyInstallment ??
      meta.installment ??
      meta.installmentAmount ??
      0
  );

  // If account is inactive, or autoDebit is disabled, or no payFromAccountId:
  if (!accountIsActive || !autoDebit || !payFromAccountId || monthlyInstallment <= 0) {
    await db
      .update(finRecurringRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(finRecurringRules.userId, userId),
          eq(finRecurringRules.toAccountId, accountId),
          eq(finRecurringRules.type, 'transfer')
        )
      );
    return;
  }

  const startDate = (meta.startDate as string) || new Date().toISOString().slice(0, 10);
  const tenureMonths = Number(meta.tenureMonths || 12);
  const installmentDay =
    meta.installmentDay !== undefined
      ? (meta.installmentDay as number | 'last')
      : parseInt(startDate.slice(8, 10), 10);
  const firstInstallmentOn =
    (meta.firstInstallmentOn as 'start_date' | 'first_installment_day') || 'start_date';
  const installmentDayHistory =
    (meta.installmentDayHistory as RDDayHistoryItem[] | undefined) || [];
  const skippedInstallments = (meta.skippedInstallments as string[]) || [];

  const rdConfig: RDConfig = {
    monthlyInstallment,
    startDate,
    installmentDay,
    firstInstallmentOn,
    tenureMonths,
    interestRate: Number(meta.interestRate || 6.8),
    installmentDayHistory,
    skippedInstallments,
  };

  const today = new Date().toISOString().slice(0, 10);
  const schedule = generateSchedule(rdConfig, today);
  if (schedule.length === 0) return;

  const validItems = schedule.filter((s) => s.status !== 'skipped');
  if (validItems.length === 0) return;

  const ruleStartDate = validItems[0].dueDate;
  const ruleEndDate = validItems[validItems.length - 1].dueDate;

  const domTag = installmentDay === 'last' ? 31 : installmentDay;
  const note = `RD auto-debit: ${accountName} [DOM:${domTag}]`;

  // Look for existing recurring rule
  const [existingRule] = await db
    .select()
    .from(finRecurringRules)
    .where(
      and(
        eq(finRecurringRules.userId, userId),
        eq(finRecurringRules.toAccountId, accountId),
        eq(finRecurringRules.type, 'transfer')
      )
    )
    .limit(1);

  if (existingRule) {
    const nextPending = validItems.find((s) => s.dueDate >= today);
    const nextOccurrence = nextPending ? nextPending.dueDate : ruleEndDate;

    await db
      .update(finRecurringRules)
      .set({
        accountId: payFromAccountId,
        amount: monthlyInstallment,
        startDate: ruleStartDate,
        endDate: ruleEndDate,
        nextOccurrence,
        note,
        isActive: true,
        updatedAt: new Date(),
      })
      .where(eq(finRecurringRules.id, existingRule.id));
  } else {
    await db.insert(finRecurringRules).values({
      userId,
      accountId: payFromAccountId,
      toAccountId: accountId,
      type: 'transfer',
      amount: monthlyInstallment,
      frequency: 'monthly',
      interval: 1,
      startDate: ruleStartDate,
      endDate: ruleEndDate,
      nextOccurrence: ruleStartDate,
      note,
      isActive: true,
    });
  }
}

export async function createAccount(
  userId: string,
  data: CreateAccountDTO
): Promise<AccountDTO> {
  const validated = createAccountSchema.parse(data);
  const accountClass = ACCOUNT_KIND_CLASS_MAP[validated.kind];

  const [row] = await db
    .insert(finAccounts)
    .values({
      userId,
      name: validated.name,
      kind: validated.kind,
      class: accountClass,
      currency: validated.currency || 'INR',
      creditLimit: validated.creditLimit !== undefined ? validated.creditLimit : null,
      isActive: true,
      metadata: validated.metadata || {},
    })
    .returning();

  if (row.kind === 'recurring_deposit') {
    try {
      await syncRDAutoDebitRule(
        userId,
        row.id,
        (row.metadata || {}) as Record<string, unknown>,
        row.name,
        row.isActive
      );
    } catch (err) {
      console.warn(`[createAccount] syncRDAutoDebitRule failed for ${row.id}:`, err);
    }
  }

  return mapAccountToDTO(row);
}

export async function updateAccount(
  userId: string,
  accountId: string,
  data: UpdateAccountDTO
): Promise<AccountDTO> {
  const validated = updateAccountSchema.parse(data);

  // Check account exists and belongs to user
  await getAccount(userId, accountId);

  const updateValues: Partial<typeof finAccounts.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.name !== undefined) updateValues.name = validated.name;
  if (validated.currency !== undefined) updateValues.currency = validated.currency;
  if (validated.creditLimit !== undefined) updateValues.creditLimit = validated.creditLimit;
  if (validated.isActive !== undefined) updateValues.isActive = validated.isActive;
  if (validated.metadata !== undefined) updateValues.metadata = validated.metadata;

  const [updated] = await db
    .update(finAccounts)
    .set(updateValues)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .returning();

  if (updated.kind === 'recurring_deposit') {
    try {
      await syncRDAutoDebitRule(
        userId,
        updated.id,
        (updated.metadata || {}) as Record<string, unknown>,
        updated.name,
        updated.isActive
      );
    } catch (err) {
      console.warn(`[updateAccount] syncRDAutoDebitRule failed for ${updated.id}:`, err);
    }
  }

  return mapAccountToDTO(updated);
}

export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  // Check account exists and belongs to user
  await getAccount(userId, accountId);

  // Deactivate any recurring rule pointing to this RD
  try {
    await db
      .update(finRecurringRules)
      .set({ isActive: false, updatedAt: new Date() })
      .where(
        and(
          eq(finRecurringRules.userId, userId),
          eq(finRecurringRules.toAccountId, accountId)
        )
      );
  } catch (err) {
    console.warn(`[deleteAccount] disabling recurring rules for ${accountId} failed:`, err);
  }

  // Check if any non-deleted transactions exist for this account
  const tx = await db
    .select({ id: finTransactions.id })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        and(
          sql`(${finTransactions.accountId} = ${accountId} OR ${finTransactions.toAccountId} = ${accountId})`,
          sql`${finTransactions.deletedAt} IS NULL`
        )
      )
    )
    .limit(1);

  if (tx.length > 0) {
    // Soft archive instead of delete when transactions exist
    await db
      .update(finAccounts)
      .set({ isActive: false, updatedAt: new Date() })
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));
  } else {
    // Hard delete if no transactions exist
    await db
      .delete(finAccounts)
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));
  }
}

