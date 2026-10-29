/**
 * Recurring rules: full CRUD + repository helpers integration tests (PGlite).
 *
 * Covers:
 *   - User isolation: user B cannot read/edit/delete user A's rules
 *   - CRUD lifecycle: create, list, get, update, delete (with null-ruleId on transactions)
 *   - pauseRecurringRule / resumeRecurringRule
 *   - getUpcomingOccurrences scoped to user
 *   - generateDueTransactions:
 *       • idempotent (double-run produces 0 new records)
 *       • back-fill after a gap
 *       • month-end clamping (day 31 → Feb 28/29)
 *       • leap year (Feb 29 on a monthly rule)
 *       • end date respected (no transactions after endDate)
 */

import { describe, it, expect, beforeEach } from 'vitest';
import { and, eq } from 'drizzle-orm';
import { db, finAccounts, finRecurringRules, finTransactions } from '@src/lib/db';
import { setupFinanceTestDb, USER_A, USER_B } from '../../__tests__/db/test-helper';
import {
  pauseRecurringRule,
  resumeRecurringRule,
  getUpcomingOccurrences,
  generateDueTransactions,
} from '../repository';
import {
  listRecurringRules,
  getRecurringRule,
  createRecurringRule,
  updateRecurringRule,
  deleteRecurringRule,
} from '../../db-service/recurring';
import { NotFoundError } from '@src/app/api/utils';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function seedAccount(userId: string, name = 'Test Bank') {
  const [acc] = await db
    .insert(finAccounts)
    .values({
      userId,
      name,
      kind: 'bank',
      class: 'asset',
      currency: 'INR',
      isActive: true,
    })
    .returning();
  return acc;
}

async function seedRule(
  userId: string,
  accountId: string,
  overrides: Partial<typeof finRecurringRules.$inferInsert> = {}
) {
  const [rule] = await db
    .insert(finRecurringRules)
    .values({
      userId,
      accountId,
      type: 'expense',
      amount: 100000, // ₹1000 in paise
      payee: 'Test Payee',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
      nextOccurrence: '2026-09-01',
      isActive: true,
      ...overrides,
    })
    .returning();
  return rule;
}

// ---------------------------------------------------------------------------
// Setup
// ---------------------------------------------------------------------------

beforeEach(async () => {
  process.env.FINANCE_BACKEND = 'db';
  await setupFinanceTestDb();
});

// ---------------------------------------------------------------------------
// CRUD via service layer
// ---------------------------------------------------------------------------

describe('Recurring Rules: CRUD via db-service', () => {
  it('creates a rule and lists it for the owner only', async () => {
    const accA = await seedAccount(USER_A, 'A Bank');
    const accB = await seedAccount(USER_B, 'B Bank');

    const rule = await createRecurringRule(USER_A, {
      accountId: accA.id,
      type: 'expense',
      amount: 50000,
      payee: 'Netflix',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-10-15',
    });

    expect(rule.userId).toBe(USER_A);
    expect(rule.payee).toBe('Netflix');

    // USER_A sees it
    const listA = await listRecurringRules(USER_A);
    expect(listA.some((r) => r.id === rule.id)).toBe(true);

    // USER_B does NOT see it
    const listB = await listRecurringRules(USER_B);
    expect(listB.some((r) => r.id === rule.id)).toBe(false);

    // Unused variable to satisfy lint
    void accB;
  });

  it('getRecurringRule enforces user ownership', async () => {
    const accA = await seedAccount(USER_A);
    const rule = await seedRule(USER_A, accA.id);

    // Owner can read
    const found = await getRecurringRule(USER_A, rule.id);
    expect(found.id).toBe(rule.id);

    // Other user gets NotFoundError
    await expect(getRecurringRule(USER_B, rule.id)).rejects.toThrow(NotFoundError);
  });

  it('updateRecurringRule enforces user ownership', async () => {
    const accA = await seedAccount(USER_A);
    const rule = await seedRule(USER_A, accA.id);

    // Owner can update
    const updated = await updateRecurringRule(USER_A, rule.id, { payee: 'Updated' });
    expect(updated.payee).toBe('Updated');

    // Other user's update fails
    await expect(updateRecurringRule(USER_B, rule.id, { payee: 'Hacked' })).rejects.toThrow(
      NotFoundError
    );
  });

  it('deleteRecurringRule enforces user ownership', async () => {
    const accA = await seedAccount(USER_A);
    const rule = await seedRule(USER_A, accA.id);

    // Other user cannot delete
    await expect(deleteRecurringRule(USER_B, rule.id)).rejects.toThrow(NotFoundError);

    // Owner can delete
    await deleteRecurringRule(USER_A, rule.id);

    const remaining = await listRecurringRules(USER_A);
    expect(remaining.some((r) => r.id === rule.id)).toBe(false);
  });

  it('deleteRecurringRule nullifies recurringRuleId on existing transactions', async () => {
    const accA = await seedAccount(USER_A);
    const rule = await seedRule(USER_A, accA.id, {
      nextOccurrence: '2026-09-01',
    });

    // Generate a transaction linked to the rule
    const result = await generateDueTransactions(USER_A, '2026-09-01');
    expect(result.created).toBeGreaterThan(0);

    // Verify the transaction has recurringRuleId set before delete
    const beforeDelete = await db
      .select()
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, USER_A), eq(finTransactions.isRecurring, true)));
    expect(beforeDelete.length).toBeGreaterThan(0);
    expect(beforeDelete[0].recurringRuleId).toBe(rule.id);

    // Delete the rule — should null out recurringRuleId on the transaction
    await deleteRecurringRule(USER_A, rule.id);

    // Fetch the same transaction(s) and verify recurringRuleId is now null
    const afterDelete = await db
      .select()
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, USER_A), eq(finTransactions.isRecurring, true)));
    expect(afterDelete.length).toBeGreaterThan(0);
    expect(afterDelete[0].recurringRuleId).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// Pause / Resume
// ---------------------------------------------------------------------------

describe('Recurring Rules: pause and resume (repository helpers)', () => {
  it('pauses and resumes a rule, and scopes by userId', async () => {
    const accA = await seedAccount(USER_A);
    const rule = await seedRule(USER_A, accA.id);

    // Pause
    const paused = await pauseRecurringRule(USER_A, rule.id);
    expect(paused.isActive).toBe(false);

    // Resume
    const resumed = await resumeRecurringRule(USER_A, rule.id);
    expect(resumed.isActive).toBe(true);

    // User B cannot pause User A's rule
    await expect(pauseRecurringRule(USER_B, rule.id)).rejects.toThrow(NotFoundError);
  });
});

// ---------------------------------------------------------------------------
// getUpcomingOccurrences
// ---------------------------------------------------------------------------

describe('getUpcomingOccurrences', () => {
  it('returns future occurrences scoped to the calling user', async () => {
    const accA = await seedAccount(USER_A);
    const accB = await seedAccount(USER_B);

    // Rule for A: starting tomorrow (always in window)
    const tomorrow = new Date();
    tomorrow.setUTCDate(tomorrow.getUTCDate() + 1);
    const tomorrowStr = tomorrow.toISOString().slice(0, 10);

    await seedRule(USER_A, accA.id, {
      startDate: tomorrowStr,
      nextOccurrence: tomorrowStr,
    });

    await seedRule(USER_B, accB.id, {
      startDate: tomorrowStr,
      nextOccurrence: tomorrowStr,
    });

    const upcoming = await getUpcomingOccurrences(USER_A, 30);

    // All projected occurrences belong to USER_A's rules
    const userBRules = await listRecurringRules(USER_B);
    for (const occ of upcoming) {
      expect(userBRules.some((r) => r.id === occ.ruleId)).toBe(false);
    }
  });
});

// ---------------------------------------------------------------------------
// generateDueTransactions
// ---------------------------------------------------------------------------

describe('generateDueTransactions: idempotency', () => {
  it('creates 0 new records on a second run (idempotent)', async () => {
    const accA = await seedAccount(USER_A);
    await seedRule(USER_A, accA.id, {
      nextOccurrence: '2026-10-01',
    });

    const first = await generateDueTransactions(USER_A, '2026-10-20');
    expect(first.created).toBe(1);

    // Second run: the rule's nextOccurrence was advanced past asOfDate by the
    // first run, so 0 rules qualify and 0 transactions are created.
    const second = await generateDueTransactions(USER_A, '2026-10-20');
    expect(second.created).toBe(0);

    // The DB must still have exactly 1 transaction.
    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    expect(txns.length).toBe(1);
  });
});

describe('generateDueTransactions: back-fill after a gap', () => {
  it('fills in all missed monthly occurrences', async () => {
    const accA = await seedAccount(USER_A);
    await seedRule(USER_A, accA.id, {
      startDate: '2026-07-10',
      nextOccurrence: '2026-07-10',
    });

    // Generate up to Oct 10 — should produce Jul 10, Aug 10, Sep 10, Oct 10
    const result = await generateDueTransactions(USER_A, '2026-10-10');
    expect(result.created).toBe(4);

    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    const dates = txns.map((t) => t.date).sort();
    expect(dates).toEqual(['2026-07-10', '2026-08-10', '2026-09-10', '2026-10-10']);
  });
});

describe('generateDueTransactions: month-end clamping', () => {
  it('clamps day 31 to Feb 28 on non-leap year and Feb 29 on leap year', async () => {
    const accA = await seedAccount(USER_A);
    await seedRule(USER_A, accA.id, {
      note: 'Broadband [DOM:31]',
      startDate: '2024-01-31',
      nextOccurrence: '2024-01-31',
    });

    const result = await generateDueTransactions(USER_A, '2024-03-31');
    expect(result.created).toBe(3);

    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    const dates = txns.map((t) => t.date).sort();
    // 2024 is a leap year, so Feb gets 29 days
    expect(dates).toEqual(['2024-01-31', '2024-02-29', '2024-03-31']);
  });

  it('clamps day 31 to Feb 28 on a non-leap year', async () => {
    const accA = await seedAccount(USER_A);
    await seedRule(USER_A, accA.id, {
      note: 'Rent [DOM:31]',
      startDate: '2025-01-31',
      nextOccurrence: '2025-01-31',
    });

    const result = await generateDueTransactions(USER_A, '2025-03-31');
    expect(result.created).toBe(3);

    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    const dates = txns.map((t) => t.date).sort();
    // 2025 is NOT a leap year, so Feb gets 28 days
    expect(dates).toEqual(['2025-01-31', '2025-02-28', '2025-03-31']);
  });
});

describe('generateDueTransactions: leap year', () => {
  it('yearly rule on Feb 29 fires on Feb 28 in non-leap years', async () => {
    const accA = await seedAccount(USER_A);
    // Yearly rule anchored to Feb 29 (leap day) starting in 2024
    await seedRule(USER_A, accA.id, {
      note: 'Leap Day Subscription [DOM:29]',
      frequency: 'yearly',
      interval: 1,
      startDate: '2024-02-29',
      nextOccurrence: '2024-02-29',
    });

    // 2025 is not a leap year → should fire on Feb 28
    const result = await generateDueTransactions(USER_A, '2025-03-01');
    expect(result.created).toBe(2); // 2024-02-29 and 2025-02-28

    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    const dates = txns.map((t) => t.date).sort();
    expect(dates).toEqual(['2024-02-29', '2025-02-28']);
  });
});

describe('generateDueTransactions: end date respected', () => {
  it('stops generating transactions after endDate', async () => {
    const accA = await seedAccount(USER_A);
    await seedRule(USER_A, accA.id, {
      startDate: '2026-07-01',
      nextOccurrence: '2026-07-01',
      endDate: '2026-08-31',
    });

    // Generate up to Oct (past endDate)
    const result = await generateDueTransactions(USER_A, '2026-10-30');
    // Should only generate Jul 1 and Aug 1 — Sep 1 is after endDate
    expect(result.created).toBe(2);

    const txns = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    const dates = txns.map((t) => t.date).sort();
    expect(dates).toEqual(['2026-07-01', '2026-08-01']);
  });
});

