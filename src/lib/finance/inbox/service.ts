import 'server-only';

import { and, desc, eq, inArray, sql } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
  finAccounts,
  finCategories,
  finInbox,
  finTransactions,
  payeeRules,
} from '@src/lib/db';
import { newId } from '@src/lib/db/id';
import type { ApproveItemInput } from '../ingest/schema';
import { BadRequestError } from '@src/app/api/utils';

// Re-export for convenience
export type { ApproveItemInput };

// ============================================================================
// Types
// ============================================================================

export interface InboxItemDTO {
  id: string;
  userId: string;
  idempotencyKey: string;
  source: string;
  receivedAt: string;
  date: string;
  amount: number;
  direction: 'debit' | 'credit';
  currency: string;
  merchant: string | null;
  description: string | null;
  accountHint: { last4?: string; name?: string } | null;
  reference: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'duplicate';
  matchedAccountId: string | null;
  matchedAccountName: string | null;
  suggestedCategoryId: string | null;
  suggestedCategoryName: string | null;
  duplicateWarning: Array<{ reason: string; existingId?: string }> | null;
  createdTransactionId: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PaginatedInboxResponse {
  items: InboxItemDTO[];
  pendingCount: number;
  nextCursor: string | null;
  hasMore: boolean;
}

export interface ApproveResult {
  approved: string[];
  failed: Array<{ id: string; reason: string }>;
  transactionIds: string[];
}

// ============================================================================
// List inbox
// ============================================================================

export async function listInbox(
  userId: string,
  filters: { status?: string; limit?: number; cursor?: string }
): Promise<PaginatedInboxResponse> {
  const status = (filters.status ?? 'pending') as
    | 'pending'
    | 'approved'
    | 'rejected'
    | 'duplicate';
  const limit = filters.limit ?? 50;

  // Pending count (always return regardless of status filter)
  const countResult = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(finInbox)
    .where(and(eq(finInbox.userId, userId), eq(finInbox.status, 'pending')));
  const pendingCount = countResult[0]?.count ?? 0;

  // Fetch items
  const rows = await db
    .select({
      inbox: finInbox,
      accountName: finAccounts.name,
      categoryName: finCategories.name,
    })
    .from(finInbox)
    .leftJoin(finAccounts, eq(finInbox.matchedAccountId, finAccounts.id))
    .leftJoin(finCategories, eq(finInbox.suggestedCategoryId, finCategories.id))
    .where(and(eq(finInbox.userId, userId), eq(finInbox.status, status)))
    .orderBy(desc(finInbox.receivedAt))
    .limit(limit + 1);

  const hasMore = rows.length > limit;
  const items = rows.slice(0, limit).map((row): InboxItemDTO => {
    const inbox = row.inbox;
    return {
      id: inbox.id,
      userId: inbox.userId,
      idempotencyKey: inbox.idempotencyKey,
      source: inbox.source,
      receivedAt:
        inbox.receivedAt instanceof Date
          ? inbox.receivedAt.toISOString()
          : String(inbox.receivedAt),
      date: inbox.date,
      amount: inbox.amount,
      direction: inbox.direction as 'debit' | 'credit',
      currency: inbox.currency,
      merchant: inbox.merchant ?? null,
      description: inbox.description ?? null,
      accountHint: inbox.accountHint as { last4?: string; name?: string } | null,
      reference: inbox.reference ?? null,
      status: inbox.status as InboxItemDTO['status'],
      matchedAccountId: inbox.matchedAccountId ?? null,
      matchedAccountName: row.accountName ?? null,
      suggestedCategoryId: inbox.suggestedCategoryId ?? null,
      suggestedCategoryName: row.categoryName ?? null,
      duplicateWarning: inbox.duplicateWarning as Array<{
        reason: string;
        existingId?: string;
      }> | null,
      createdTransactionId: inbox.createdTransactionId ?? null,
      createdAt:
        inbox.createdAt instanceof Date
          ? inbox.createdAt.toISOString()
          : String(inbox.createdAt),
      updatedAt:
        inbox.updatedAt instanceof Date
          ? inbox.updatedAt.toISOString()
          : String(inbox.updatedAt),
    };
  });

  return {
    items,
    pendingCount,
    nextCursor: hasMore ? rows[limit - 1].inbox.id : null,
    hasMore,
  };
}

// ============================================================================
// Approve items — creates transactions in ONE database transaction
// ============================================================================

export async function approveItems(
  userId: string,
  approvals: ApproveItemInput[]
): Promise<ApproveResult> {
  const result: ApproveResult = { approved: [], failed: [], transactionIds: [] };

  // Fetch all requested inbox items for this user
  const ids = approvals.map((a) => a.id);
  const inboxItems = await db
    .select()
    .from(finInbox)
    .where(and(eq(finInbox.userId, userId), inArray(finInbox.id, ids)));

  // Build a lookup
  const itemMap = new Map(inboxItems.map((i) => [i.id, i]));

  // Validate all items before touching the DB
  const validApprovals: Array<{
    approval: ApproveItemInput;
    inboxItem: (typeof inboxItems)[0];
    txnId: string;
    signedAmount: number;
    txnType: 'expense' | 'income';
  }> = [];

  for (const approval of approvals) {
    const inboxItem = itemMap.get(approval.id);
    if (!inboxItem) {
      result.failed.push({ id: approval.id, reason: 'Not found' });
      continue;
    }
    if (inboxItem.status !== 'pending' && inboxItem.status !== 'duplicate') {
      result.failed.push({
        id: approval.id,
        reason: `Item is already ${inboxItem.status}`,
      });
      continue;
    }

    const accountId = approval.accountId ?? inboxItem.matchedAccountId;
    if (!accountId) {
      result.failed.push({ id: approval.id, reason: 'No account specified' });
      continue;
    }

    const amount = approval.amount ?? inboxItem.amount;
    const direction = inboxItem.direction as 'debit' | 'credit';
    const txnType = direction === 'debit' ? 'expense' : 'income';
    const signedAmount = direction === 'debit' ? -amount : amount;

    validApprovals.push({
      approval: { ...approval, accountId },
      inboxItem,
      txnId: newId(),
      signedAmount,
      txnType,
    });
  }

  if (validApprovals.length === 0) {
    return result;
  }

  // Execute in a single transaction
  await db.transaction(async (trx) => {
    for (const { approval, inboxItem, txnId, signedAmount, txnType } of validApprovals) {
      const amount = approval.amount ?? inboxItem.amount;
      const accountId = approval.accountId!;
      const categoryId = approval.categoryId ?? inboxItem.suggestedCategoryId ?? null;
      const payee = approval.payee ?? inboxItem.merchant ?? null;
      const note = approval.note ?? inboxItem.description ?? null;

      // Create transaction
      await trx.insert(finTransactions).values({
        id: txnId,
        userId,
        accountId,
        categoryId: categoryId ?? undefined,
        date: inboxItem.date,
        type: txnType,
        amount,
        signedAmount,
        payee: payee ?? undefined,
        note: note ?? undefined,
        importHash: inboxItem.importHash ?? undefined,
        clientRequestId: inboxItem.idempotencyKey,
      });

      // Update inbox item
      await trx
        .update(finInbox)
        .set({
          status: 'approved',
          createdTransactionId: txnId,
          matchedAccountId: accountId,
          suggestedCategoryId: categoryId ?? undefined,
          updatedAt: new Date(),
        })
        .where(and(eq(finInbox.id, inboxItem.id), eq(finInbox.userId, userId)));
    }
  });

  // Collect results
  for (const { approval, txnId } of validApprovals) {
    result.approved.push(approval.id);
    result.transactionIds.push(txnId);
  }

  return result;
}

// ============================================================================
// Reject items
// ============================================================================

export async function rejectItems(
  userId: string,
  ids: string[]
): Promise<{ rejected: string[]; failed: Array<{ id: string; reason: string }> }> {
  const inboxItems = await db
    .select({ id: finInbox.id, status: finInbox.status })
    .from(finInbox)
    .where(and(eq(finInbox.userId, userId), inArray(finInbox.id, ids)));

  const itemMap = new Map(inboxItems.map((i) => [i.id, i]));
  const toReject: string[] = [];
  const failed: Array<{ id: string; reason: string }> = [];

  for (const id of ids) {
    const item = itemMap.get(id);
    if (!item) {
      failed.push({ id, reason: 'Not found' });
      continue;
    }
    if (item.status === 'approved') {
      failed.push({ id, reason: 'Already approved — cannot reject' });
      continue;
    }
    toReject.push(id);
  }

  if (toReject.length > 0) {
    await db
      .update(finInbox)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(and(eq(finInbox.userId, userId), inArray(finInbox.id, toReject)));
  }

  return { rejected: toReject, failed };
}

// ============================================================================
// Learn payee rule
// ============================================================================

export async function learnPayeeRule(
  userId: string,
  inboxId: string,
  categoryId: string
): Promise<void> {
  // Fetch inbox item to get merchant
  const [item] = await db
    .select({ merchant: finInbox.merchant })
    .from(finInbox)
    .where(and(eq(finInbox.id, inboxId), eq(finInbox.userId, userId)))
    .limit(1);

  if (!item?.merchant) {
    throw new BadRequestError('No merchant on this inbox item — cannot create rule');
  }

  const pattern = item.merchant.toLowerCase().trim();

  // Upsert: if pattern exists for this user, update category; else insert
  await db
    .insert(payeeRules)
    .values({
      id: newId(),
      userId,
      payeePattern: pattern,
      categoryId,
      priority: 0,
    })
    .onConflictDoUpdate({
      target: [payeeRules.userId, payeeRules.payeePattern],
      set: { categoryId, priority: sql`${payeeRules.priority} + 1` },
    });
}
