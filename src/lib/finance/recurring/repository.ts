/**
 * Recurring rules repository — higher-level helpers built on top of
 * db-service/recurring.ts CRUD functions.  Provides:
 *   - pauseRecurringRule / resumeRecurringRule (thin wrappers around updateRecurringRule)
 *   - getUpcomingOccurrences   (projectUpcomingOccurrences scoped to one userId)
 *   - generateDueTransactions  (idempotent back-fill via generateDueRecurringTransactions)
 *
 * DbFinanceService in db-service/index.ts delegates to these helpers (via
 * db-service/recurring.ts) for the core CRUD, and can call these helpers
 * directly for the higher-level operations.
 */

import {
  listRecurringRules,
  getRecurringRule,
  updateRecurringRule,
} from '../db-service/recurring';
import { projectUpcomingOccurrences } from './date-math';
import { generateDueRecurringTransactions } from './generator';
import type { OccurrenceProjection, GenerationResult } from './types';
import type { RecurringRuleDTO } from '../contract';

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------

/**
 * Pauses a recurring rule (sets isActive = false).
 * Scoped to the owner: will throw NotFoundError if ruleId belongs to a
 * different userId.
 */
export async function pauseRecurringRule(
  userId: string,
  ruleId: string
): Promise<RecurringRuleDTO> {
  // getRecurringRule enforces userId scope, updateRecurringRule re-checks it.
  await getRecurringRule(userId, ruleId);
  return updateRecurringRule(userId, ruleId, { isActive: false });
}

/**
 * Resumes a paused recurring rule (sets isActive = true).
 */
export async function resumeRecurringRule(
  userId: string,
  ruleId: string
): Promise<RecurringRuleDTO> {
  await getRecurringRule(userId, ruleId);
  return updateRecurringRule(userId, ruleId, { isActive: true });
}

// ---------------------------------------------------------------------------
// Upcoming occurrences projection
// ---------------------------------------------------------------------------

/**
 * Returns the next occurrences for all active rules owned by userId within
 * the next `days` calendar days (default 60).
 *
 * @param userId  - Owner to scope the query to.
 * @param days    - Look-ahead window in days (default 60).
 * @param fromDate - ISO YYYY-MM-DD start date (default: today UTC).
 */
export async function getUpcomingOccurrences(
  userId: string,
  days = 60,
  fromDate?: string
): Promise<OccurrenceProjection[]> {
  const rules = await listRecurringRules(userId);
  const activeRules = rules.filter((r) => r.isActive);
  const start = fromDate ?? new Date().toISOString().slice(0, 10);
  return projectUpcomingOccurrences(activeRules, start, days);
}

// ---------------------------------------------------------------------------
// Idempotent due-transaction generation
// ---------------------------------------------------------------------------

/**
 * Generates transactions for all missed/due occurrences up to `upTo` (YYYY-MM-DD).
 *
 * Idempotent: clientRequestId = `${ruleId}_${yyyy-mm-dd}` prevents duplicates.
 * Month-end clamping: a rule anchored on the 31st fires on Feb 28/29 then
 * snaps back to 31 the following month.
 * Supports: daily, weekly, monthly, quarterly, yearly with an interval.
 * Respects endDate: stops generation once passed.
 *
 * @param userId - Scope generation to this user's rules only.
 * @param upTo   - Generate up to and including this date (defaults to today UTC).
 * @returns { created, skipped } counts plus full GenerationResult.
 */
export async function generateDueTransactions(
  userId: string,
  upTo?: string
): Promise<GenerationResult & { created: number; skipped: number }> {
  const asOfDate = upTo ?? new Date().toISOString().slice(0, 10);

  const result = await generateDueRecurringTransactions({
    userId,
    asOfDate,
    backend: 'db',
  });

  return {
    ...result,
    created: result.generated,
    skipped: result.skipped,
  };
}

