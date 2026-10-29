import { and, desc, eq, gte, inArray, isNull, lte, or, sql } from 'drizzle-orm';
import { db, finAccounts, finCategories, finTransactions } from '@src/lib/db';
import { BadRequestError, NotFoundError } from '@src/app/api/utils';
import {
  type CreateTransactionDTO,
  type PaginatedTransactionsResponse,
  type TransactionDTO,
  type TransactionFilters,
  type UpdateTransactionDTO,
  createTransactionSchema,
  updateTransactionSchema,
} from '../contract';

export function mapTransactionToDTO(row: typeof finTransactions.$inferSelect): TransactionDTO {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    toAccountId: row.toAccountId,
    categoryId: row.categoryId,
    date: row.date,
    type: row.type as TransactionDTO['type'],
    amount: Number(row.amount),
    signedAmount: Number(row.signedAmount),
    payee: row.payee,
    note: row.note,
    tags: row.tags,
    clientRequestId: row.clientRequestId,
    importHash: row.importHash,
    isRecurring: row.isRecurring,
    recurringRuleId: row.recurringRuleId,
    deletedAt: row.deletedAt instanceof Date ? row.deletedAt.toISOString() : (row.deletedAt ? String(row.deletedAt) : null),
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

function computeSignedAmount(
  type: 'expense' | 'income' | 'transfer' | 'adjustment',
  amount: number,
  explicitSignedAmount?: number
): number {
  switch (type) {
    case 'expense':
      return -Math.abs(amount);
    case 'income':
      return Math.abs(amount);
    case 'transfer':
      return -Math.abs(amount);
    case 'adjustment':
      return explicitSignedAmount !== undefined ? explicitSignedAmount : amount;
  }
}

export async function createTransaction(
  userId: string,
  data: CreateTransactionDTO,
  options?: { clientRequestId?: string }
): Promise<TransactionDTO> {
  const validated = createTransactionSchema.parse(data);
  const clientReqId = options?.clientRequestId || validated.clientRequestId;

  // Idempotency check: if clientRequestId matches existing transaction, return it directly
  if (clientReqId) {
    const [existing] = await db
      .select()
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.clientRequestId, clientReqId),
          isNull(finTransactions.deletedAt)
        )
      )
      .limit(1);

    if (existing) {
      return mapTransactionToDTO(existing);
    }
  }

  // Validate source account ownership
  const [sourceAccount] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, validated.accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!sourceAccount) {
    throw new NotFoundError(`Source account not found: ${validated.accountId}`);
  }

  // Validate target account for transfers
  if (validated.type === 'transfer') {
    if (!validated.toAccountId) {
      throw new BadRequestError('Transfer transactions require a destination account');
    }
    if (validated.toAccountId === validated.accountId) {
      throw new BadRequestError('Destination account must be different from source account');
    }

    const [targetAccount] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, validated.toAccountId), eq(finAccounts.userId, userId)))
      .limit(1);

    if (!targetAccount) {
      throw new NotFoundError(`Destination account not found: ${validated.toAccountId}`);
    }

    if (sourceAccount.currency !== targetAccount.currency) {
      throw new BadRequestError(
        `Cross-currency transfers are not supported (${sourceAccount.currency} to ${targetAccount.currency})`
      );
    }
  }

  // Validate category if provided
  if (validated.categoryId) {
    const [category] = await db
      .select()
      .from(finCategories)
      .where(
        and(
          eq(finCategories.id, validated.categoryId),
          or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true))
        )
      )
      .limit(1);

    if (!category) {
      throw new NotFoundError(`Category not found: ${validated.categoryId}`);
    }
  }

  const signedAmount = computeSignedAmount(validated.type, validated.amount);

  const [row] = await db
    .insert(finTransactions)
    .values({
      userId,
      accountId: validated.accountId,
      toAccountId: validated.type === 'transfer' ? validated.toAccountId : null,
      categoryId: validated.categoryId || null,
      date: validated.date,
      type: validated.type,
      amount: validated.amount,
      signedAmount,
      payee: validated.payee || null,
      note: validated.note || null,
      tags: validated.tags || null,
      clientRequestId: clientReqId || null,
      isRecurring: validated.isRecurring || false,
      recurringRuleId: validated.recurringRuleId || null,
    })
    .returning();

  return mapTransactionToDTO(row);
}

export async function getTransaction(userId: string, transactionId: string): Promise<TransactionDTO> {
  const [row] = await db
    .select()
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.id, transactionId),
        eq(finTransactions.userId, userId),
        isNull(finTransactions.deletedAt)
      )
    )
    .limit(1);

  if (!row) {
    throw new NotFoundError(`Transaction not found: ${transactionId}`);
  }

  return mapTransactionToDTO(row);
}

export async function updateTransaction(
  userId: string,
  transactionId: string,
  data: UpdateTransactionDTO
): Promise<TransactionDTO> {
  const validated = updateTransactionSchema.parse(data);
  const existing = await getTransaction(userId, transactionId);

  const effectiveType = validated.type || existing.type;
  const effectiveAmount = validated.amount !== undefined ? validated.amount : existing.amount;
  const effectiveAccountId = validated.accountId || existing.accountId;
  const effectiveToAccountId = validated.toAccountId !== undefined ? validated.toAccountId : existing.toAccountId;

  // Validate accounts if changed
  if (effectiveAccountId !== existing.accountId) {
    const [source] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, effectiveAccountId), eq(finAccounts.userId, userId)))
      .limit(1);
    if (!source) throw new NotFoundError(`Account not found: ${effectiveAccountId}`);
  }

  if (effectiveType === 'transfer') {
    if (!effectiveToAccountId || effectiveToAccountId === effectiveAccountId) {
      throw new BadRequestError('Transfer requires distinct destination account');
    }
    const [target] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, effectiveToAccountId), eq(finAccounts.userId, userId)))
      .limit(1);
    if (!target) throw new NotFoundError(`Destination account not found: ${effectiveToAccountId}`);
  }

  if (validated.categoryId) {
    const [category] = await db
      .select()
      .from(finCategories)
      .where(
        and(
          eq(finCategories.id, validated.categoryId),
          or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true))
        )
      )
      .limit(1);
    if (!category) throw new NotFoundError(`Category not found: ${validated.categoryId}`);
  }

  const signedAmount = computeSignedAmount(effectiveType, effectiveAmount);

  const updateValues: Partial<typeof finTransactions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (validated.accountId !== undefined) updateValues.accountId = validated.accountId;
  if (validated.toAccountId !== undefined) updateValues.toAccountId = validated.toAccountId;
  if (validated.categoryId !== undefined) updateValues.categoryId = validated.categoryId;
  if (validated.date !== undefined) updateValues.date = validated.date;
  if (validated.type !== undefined) updateValues.type = validated.type;
  if (validated.amount !== undefined) {
    updateValues.amount = validated.amount;
    updateValues.signedAmount = signedAmount;
  } else if (validated.type !== undefined) {
    updateValues.signedAmount = signedAmount;
  }
  if (validated.payee !== undefined) updateValues.payee = validated.payee;
  if (validated.note !== undefined) updateValues.note = validated.note;
  if (validated.tags !== undefined) updateValues.tags = validated.tags;

  const [updated] = await db
    .update(finTransactions)
    .set(updateValues)
    .where(
      and(
        eq(finTransactions.id, transactionId),
        eq(finTransactions.userId, userId),
        isNull(finTransactions.deletedAt)
      )
    )
    .returning();

  return mapTransactionToDTO(updated);
}

export async function deleteTransaction(userId: string, transactionId: string): Promise<void> {
  // Ensure transaction exists and belongs to user
  await getTransaction(userId, transactionId);

  await db
    .update(finTransactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(finTransactions.id, transactionId), eq(finTransactions.userId, userId)));
}

export async function bulkDeleteTransactions(userId: string, transactionIds: string[]): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const res = await db
    .update(finTransactions)
    .set({ deletedAt: new Date(), updatedAt: new Date() })
    .where(
      and(
        eq(finTransactions.userId, userId),
        inArray(finTransactions.id, transactionIds),
        isNull(finTransactions.deletedAt)
      )
    )
    .returning({ id: finTransactions.id });

  return res.length;
}

export async function bulkUpdateTransactions(
  userId: string,
  transactionIds: string[],
  data: UpdateTransactionDTO
): Promise<number> {
  if (transactionIds.length === 0) return 0;

  const updateValues: Partial<typeof finTransactions.$inferInsert> = {
    updatedAt: new Date(),
  };

  if (data.note !== undefined) updateValues.note = data.note;
  if (data.payee !== undefined) updateValues.payee = data.payee;
  if (data.tags !== undefined) updateValues.tags = data.tags;
  if (data.categoryId !== undefined) updateValues.categoryId = data.categoryId;

  const res = await db
    .update(finTransactions)
    .set(updateValues)
    .where(
      and(
        eq(finTransactions.userId, userId),
        inArray(finTransactions.id, transactionIds),
        isNull(finTransactions.deletedAt)
      )
    )
    .returning({ id: finTransactions.id });

  return res.length;
}

export async function listTransactions(
  userId: string,
  filters?: TransactionFilters
): Promise<PaginatedTransactionsResponse> {
  const limit = filters?.limit ?? 50;
  const conditions = [
    eq(finTransactions.userId, userId),
    isNull(finTransactions.deletedAt),
  ];

  if (filters?.accountId) {
    conditions.push(
      or(
        eq(finTransactions.accountId, filters.accountId),
        eq(finTransactions.toAccountId, filters.accountId)
      )!
    );
  }

  if (filters?.categoryId) {
    conditions.push(eq(finTransactions.categoryId, filters.categoryId));
  }

  if (filters?.type) {
    conditions.push(eq(finTransactions.type, filters.type));
  }

  if (filters?.startDate) {
    conditions.push(gte(finTransactions.date, filters.startDate));
  }

  if (filters?.endDate) {
    conditions.push(lte(finTransactions.date, filters.endDate));
  }

  if (filters?.search) {
    const term = `%${filters.search}%`;
    conditions.push(
      or(
        sql`${finTransactions.payee} ILIKE ${term}`,
        sql`${finTransactions.note} ILIKE ${term}`
      )!
    );
  }

  // Cursor pagination: date desc, id desc
  if (filters?.cursor) {
    try {
      const decoded = Buffer.from(filters.cursor, 'base64').toString('utf8');
      const [cursorDate, cursorId] = decoded.split(':');
      if (cursorDate && cursorId) {
        conditions.push(
          sql`(${finTransactions.date} < ${cursorDate} OR (${finTransactions.date} = ${cursorDate} AND ${finTransactions.id} < ${cursorId}))`
        );
      }
    } catch {
      // Ignore malformed cursor
    }
  }

  // Fetch limit + 1 to check hasMore
  const rows = await db
    .select()
    .from(finTransactions)
    .where(and(...conditions))
    .orderBy(desc(finTransactions.date), desc(finTransactions.id))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = hasMore ? rows.slice(0, limit) : rows;

  let nextCursor: string | null = null;
  if (hasMore && items.length > 0) {
    const last = items[items.length - 1];
    nextCursor = Buffer.from(`${last.date}:${last.id}`).toString('base64');
  }

  return {
    transactions: items.map(mapTransactionToDTO),
    nextCursor,
    hasMore,
  };
}
