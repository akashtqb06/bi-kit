import { and, eq, inArray, isNull, or } from 'drizzle-orm';
import { db, finAccounts, finCategories, finTransactions } from '@src/lib/db';
import { newId } from '@src/lib/db/id';
import type { CommitImportPayload, CommitImportResult } from './types';

/**
 * Commits a batch of imported statement transactions in a single database transaction.
 * Enforces strict user isolation, verifies target account ownership, eliminates race-condition
 * duplicates via importHash, and returns an atomic execution summary.
 */
export async function commitImportTransactions(
  userId: string,
  payload: CommitImportPayload
): Promise<CommitImportResult> {
  const { accountId, rows } = payload;

  if (!rows || rows.length === 0) {
    return {
      success: true,
      importedCount: 0,
      duplicatesSkippedCount: 0,
      errorCount: 0,
      transactionIds: [],
      targetAccountId: accountId,
    };
  }

  // 1. Verify target account ownership
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    return {
      success: false,
      importedCount: 0,
      duplicatesSkippedCount: 0,
      errorCount: rows.length,
      transactionIds: [],
      targetAccountId: accountId,
      error: `Target account not found or access denied: ${accountId}`,
    };
  }

  // 2. Query existing hashes to prevent duplicate entries
  const hashes = rows.map((r) => r.importHash).filter(Boolean);
  const existingHashSet = new Set<string>();

  if (hashes.length > 0) {
    const existing = await db
      .select({ importHash: finTransactions.importHash })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          inArray(finTransactions.importHash, hashes),
          isNull(finTransactions.deletedAt)
        )
      );

    for (const row of existing) {
      if (row.importHash) {
        existingHashSet.add(row.importHash);
      }
    }
  }

  // 3. Verify category IDs exist and belong to user or system
  const categoryIds = rows
    .map((r) => r.categoryId)
    .filter((id): id is string => Boolean(id));
  const validCategorySet = new Set<string>();

  if (categoryIds.length > 0) {
    const cats = await db
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(
        and(
          inArray(finCategories.id, categoryIds),
          or(eq(finCategories.userId, userId), eq(finCategories.isSystem, true))
        )
      );
    for (const c of cats) {
      validCategorySet.add(c.id);
    }
  }

  const rowsToInsert: Array<typeof finTransactions.$inferInsert> = [];
  let duplicatesSkipped = 0;
  let errorCount = 0;
  const transactionIds: string[] = [];

  for (const r of rows) {
    if (!r.date || !r.amountPaise || r.amountPaise <= 0) {
      errorCount++;
      continue;
    }

    if (existingHashSet.has(r.importHash)) {
      duplicatesSkipped++;
      continue;
    }

    // Add to set to avoid intra-batch duplicates
    existingHashSet.add(r.importHash);

    const txId = newId();
    transactionIds.push(txId);

    const signedAmount =
      r.type === 'expense'
        ? -Math.abs(r.amountPaise)
        : Math.abs(r.amountPaise);

    const resolvedCategoryId =
      r.categoryId && validCategorySet.has(r.categoryId) ? r.categoryId : null;

    rowsToInsert.push({
      id: txId,
      userId,
      accountId,
      date: r.date,
      type: r.type,
      amount: r.amountPaise,
      signedAmount,
      categoryId: resolvedCategoryId,
      payee: r.payee || r.description.slice(0, 100),
      note: r.note || r.description,
      importHash: r.importHash,
      clientRequestId: `import-${txId}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  // 3. Atomic commit in a single database transaction
  if (rowsToInsert.length > 0) {
    await db.transaction(async (tx) => {
      await tx.insert(finTransactions).values(rowsToInsert);

      // Save new categorization rules in account metadata if provided
      if (payload.newRules && payload.newRules.length > 0) {
        const currentMeta = (account.metadata || {}) as Record<string, unknown>;
        const existingRules = Array.isArray(currentMeta.importRules)
          ? currentMeta.importRules
          : [];
        const mergedRules = [...existingRules, ...payload.newRules];

        await tx
          .update(finAccounts)
          .set({
            metadata: {
              ...currentMeta,
              importRules: mergedRules,
            },
            updatedAt: new Date(),
          })
          .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));
      }
    });
  }

  return {
    success: true,
    importedCount: rowsToInsert.length,
    duplicatesSkippedCount: duplicatesSkipped,
    errorCount,
    transactionIds,
    targetAccountId: accountId,
  };
}
