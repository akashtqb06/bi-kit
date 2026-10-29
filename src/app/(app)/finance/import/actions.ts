'use server';

import { requireUserApi } from '@src/lib/auth/dal';
import { commitImportTransactions } from '@src/lib/finance/import/commit';
import type { CommitImportPayload, CommitImportResult } from '@src/lib/finance/import/types';

/**
 * Server action to commit imported statement transactions atomically.
 * Enforces authentication and invokes the atomic commit service.
 */
export async function commitImportAction(
  payload: CommitImportPayload
): Promise<CommitImportResult> {
  try {
    const user = await requireUserApi();
    return await commitImportTransactions(user.id, payload);
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown server error during import';
    return {
      success: false,
      importedCount: 0,
      duplicatesSkippedCount: 0,
      errorCount: payload.rows.length,
      transactionIds: [],
      targetAccountId: payload.accountId,
      error: message,
    };
  }
}
