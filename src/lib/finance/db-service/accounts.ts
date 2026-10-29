import { and, eq, sql } from 'drizzle-orm';
import { db, finAccounts, finTransactions } from '@src/lib/db';
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

  return mapAccountToDTO(updated);
}

export async function deleteAccount(userId: string, accountId: string): Promise<void> {
  // Check account exists and belongs to user
  await getAccount(userId, accountId);

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

