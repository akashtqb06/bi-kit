import 'server-only';

import { and, desc, eq, gte, isNull, lte } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
  finAccounts,
  finInbox,
  finTransactions,
  payeeRules,
} from '@src/lib/db';
import { newId } from '@src/lib/db/id';
import { type IngestItem, type IngestItemInput, ingestItemSchema } from './schema';

// ============================================================================
// Types
// ============================================================================

export interface IngestResult {
  idempotencyKey: string;
  status: 'accepted' | 'duplicate' | 'error';
  inboxId?: string;
  duplicate: boolean;
  reason?: string;
}

interface DuplicateWarning {
  reason: string;
  existingId?: string;
}

// ============================================================================
// Account matching
// ============================================================================

/**
 * Try to match an account by last4 (from metadata.labelLast4) or name.
 * Returns the first matching active account owned by userId, or null.
 */
async function matchAccount(
  userId: string,
  hint: IngestItem['accountHint']
): Promise<string | null> {
  if (!hint) return null;

  const accounts = await db
    .select({ id: finAccounts.id, name: finAccounts.name, metadata: finAccounts.metadata })
    .from(finAccounts)
    .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)));

  if (hint.last4) {
    const byLast4 = accounts.find(
      (a) =>
        typeof a.metadata === 'object' &&
        a.metadata !== null &&
        (a.metadata as Record<string, unknown>)['labelLast4'] === hint.last4
    );
    if (byLast4) return byLast4.id;
  }

  if (hint.name) {
    const normalized = hint.name.toLowerCase().trim();
    const byName = accounts.find((a) => a.name.toLowerCase().trim() === normalized);
    if (byName) return byName.id;

    // Fuzzy: check if account name contains the hint or vice versa
    const fuzzy = accounts.find(
      (a) =>
        a.name.toLowerCase().includes(normalized) ||
        normalized.includes(a.name.toLowerCase())
    );
    if (fuzzy) return fuzzy.id;
  }

  return null;
}

// ============================================================================
// Category suggestion via payee rules
// ============================================================================

async function suggestCategory(userId: string, merchant?: string, description?: string): Promise<string | null> {
  if (!merchant && !description) return null;

  const rules = await db
    .select({ payeePattern: payeeRules.payeePattern, categoryId: payeeRules.categoryId })
    .from(payeeRules)
    .where(eq(payeeRules.userId, userId))
    .orderBy(desc(payeeRules.priority));

  const searchText = [merchant, description]
    .filter(Boolean)
    .join(' ')
    .toLowerCase();

  for (const rule of rules) {
    if (searchText.includes(rule.payeePattern.toLowerCase())) {
      return rule.categoryId;
    }
  }

  return null;
}

// ============================================================================
// Levenshtein-based similarity for duplicate detection
// ============================================================================

function levenshtein(a: string, b: string): number {
  const m = a.length;
  const n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, (_, i) =>
    Array.from({ length: n + 1 }, (_, j) => (i === 0 ? j : j === 0 ? i : 0))
  );
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] =
        a[i - 1] === b[j - 1]
          ? dp[i - 1][j - 1]
          : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

function isSimilarPayee(a: string | null | undefined, b: string | null | undefined): boolean {
  if (!a && !b) return true;
  if (!a || !b) return false;
  const na = a.toLowerCase().trim();
  const nb = b.toLowerCase().trim();
  if (na === nb) return true;
  const dist = levenshtein(na, nb);
  const maxLen = Math.max(na.length, nb.length);
  return maxLen > 0 && dist / maxLen < 0.3; // 70% similarity threshold
}

// ============================================================================
// Duplicate detection
// ============================================================================

/**
 * Check if a similar transaction already exists in fin_transactions:
 * - Same userId, same amount, same direction, date within ±1 day, similar payee
 * - OR same importHash
 */
async function detectDuplicates(
  userId: string,
  item: IngestItem,
  importHash: string
): Promise<DuplicateWarning[]> {
  const warnings: DuplicateWarning[] = [];

  // Check importHash against existing transactions
  const byHash = await db
    .select({ id: finTransactions.id })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.importHash, importHash),
        isNull(finTransactions.deletedAt)
      )
    )
    .limit(1);

  if (byHash.length > 0) {
    warnings.push({ reason: 'import_hash_match', existingId: byHash[0].id });
    return warnings; // definitive duplicate
  }

  // Check fin_inbox for same idempotencyKey (handled at service level)

  // Check similar transactions: same amount, within ±1 day
  const itemDate = new Date(item.date);
  const dayBefore = new Date(itemDate);
  dayBefore.setDate(dayBefore.getDate() - 1);
  const dayAfter = new Date(itemDate);
  dayAfter.setDate(dayAfter.getDate() + 1);

  const similarTxns = await db
    .select({
      id: finTransactions.id,
      payee: finTransactions.payee,
      date: finTransactions.date,
      amount: finTransactions.amount,
      type: finTransactions.type,
    })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.amount, item.amount),
        gte(finTransactions.date, dayBefore.toISOString().split('T')[0]),
        lte(finTransactions.date, dayAfter.toISOString().split('T')[0]),
        isNull(finTransactions.deletedAt)
      )
    )
    .limit(10);

  for (const txn of similarTxns) {
    if (isSimilarPayee(item.merchant, txn.payee)) {
      warnings.push({
        reason: 'similar_transaction',
        existingId: txn.id,
      });
      break;
    }
  }

  return warnings;
}

// ============================================================================
// Import hash
// ============================================================================

function buildImportHash(userId: string, item: IngestItem): string {
  const key = `${userId}:${item.source}:${item.date}:${item.amount}:${item.direction}:${item.merchant ?? ''}`;
  // Use a simple deterministic hash (no crypto needed for import dedup)
  let h = 0;
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h + key.charCodeAt(i)) | 0;
  }
  return `ingest_${Math.abs(h).toString(16).padStart(8, '0')}`;
}

// ============================================================================
// Main ingest function
// ============================================================================

export async function ingestItems(
  userId: string,
  items: IngestItemInput[]
): Promise<IngestResult[]> {
  const results: IngestResult[] = [];

  for (const rawItem of items) {
    try {
      const item = ingestItemSchema.parse(rawItem);
      results.push(await ingestSingleItem(userId, item));
    } catch (err) {
      console.error('[Ingest] Failed to process item', rawItem.idempotencyKey, err);
      results.push({
        idempotencyKey: rawItem.idempotencyKey,
        status: 'error',
        duplicate: false,
        reason: 'Internal processing error',
      });
    }
  }

  return results;
}

async function ingestSingleItem(
  userId: string,
  item: IngestItem
): Promise<IngestResult> {
  // 1. Idempotency check: return existing inbox item if key already used
  const existing = await db
    .select({ id: finInbox.id, status: finInbox.status })
    .from(finInbox)
    .where(
      and(eq(finInbox.userId, userId), eq(finInbox.idempotencyKey, item.idempotencyKey))
    )
    .limit(1);

  if (existing.length > 0) {
    return {
      idempotencyKey: item.idempotencyKey,
      status: existing[0].status === 'duplicate' ? 'duplicate' : 'accepted',
      inboxId: existing[0].id,
      duplicate: existing[0].status === 'duplicate',
    };
  }

  // 2. Build import hash
  const importHash = buildImportHash(userId, item);

  // 3. Detect duplicates
  const duplicateWarnings = await detectDuplicates(userId, item, importHash);
  const isDuplicate = duplicateWarnings.some((w) => w.reason === 'import_hash_match');

  // 4. Match account
  const matchedAccountId = await matchAccount(userId, item.accountHint);

  // 5. Suggest category
  const suggestedCategoryId = await suggestCategory(userId, item.merchant, item.description);

  // 6. Insert into fin_inbox
  const id = newId();
  await db.insert(finInbox).values({
    id,
    userId,
    idempotencyKey: item.idempotencyKey,
    source: item.source,
    receivedAt: new Date(item.receivedAt),
    date: item.date,
    amount: item.amount,
    direction: item.direction,
    currency: item.currency,
    merchant: item.merchant ?? null,
    description: item.description ?? null,
    accountHint: item.accountHint ?? null,
    reference: item.reference ?? null,
    raw: item.raw ?? null,
    status: isDuplicate ? 'duplicate' : 'pending',
    matchedAccountId: matchedAccountId ?? null,
    suggestedCategoryId: suggestedCategoryId ?? null,
    duplicateWarning: duplicateWarnings.length > 0 ? duplicateWarnings : null,
    importHash,
    createdTransactionId: null,
  });

  return {
    idempotencyKey: item.idempotencyKey,
    status: isDuplicate ? 'duplicate' : 'accepted',
    inboxId: id,
    duplicate: isDuplicate,
  };
}
