import { and, eq, lte } from 'drizzle-orm';
import { db, finRecurringRules, finTransactions } from '@src/lib/db';
import { getFinanceService, type FinanceService } from '../service';
import type { RecurringRuleDTO, TransactionDTO } from '../contract';
import {
  advanceRecurringDate,
  extractAnchorDay,
  extractAnchorMonth,
} from './date-math';
import type { GenerationResult, RuleGenerationDetail } from './types';

export interface GenerateOptions {
  userId?: string;
  asOfDate?: string; // YYYY-MM-DD, defaults to today (UTC)
  backend?: 'mock' | 'db';
  service?: FinanceService;
}

/**
 * Creates due transactions for recurring rules up to asOfDate.
 * Fully idempotent via `clientRequestId = `${rule.id}_${occurrence}``.
 * Back-fills any missed cycles across past periods and clamps month-end dates.
 */
export async function generateDueRecurringTransactions(
  options: GenerateOptions = {}
): Promise<GenerationResult> {
  const asOfDate = options.asOfDate || new Date().toISOString().slice(0, 10);
  const backend = options.backend || process.env.FINANCE_BACKEND || 'db';

  if (backend === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FINANCE_BACKEND=mock is strictly prohibited in production');
    }
    return generateMockBackend(asOfDate, options.userId, options.service);
  }

  return generateDbBackend(asOfDate, options.userId);
}

/**
 * DB backend generator running against PostgreSQL / Drizzle.
 */
async function generateDbBackend(
  asOfDate: string,
  userId?: string
): Promise<GenerationResult> {
  const conditions = [
    eq(finRecurringRules.isActive, true),
    lte(finRecurringRules.nextOccurrence, asOfDate),
  ];

  if (userId) {
    conditions.push(eq(finRecurringRules.userId, userId));
  }

  const dueRules = await db
    .select()
    .from(finRecurringRules)
    .where(and(...conditions));

  let generated = 0;
  let backfilled = 0;
  let skipped = 0;
  const createdTransactions: TransactionDTO[] = [];
  const rulesProcessed: RuleGenerationDetail[] = [];

  for (const rawRule of dueRules) {
    const anchorDay = extractAnchorDay(rawRule);
    const anchorMonth = extractAnchorMonth(rawRule);
    const initialNextOccurrence = rawRule.nextOccurrence;

    let occurrence = initialNextOccurrence;
    const occurrencesGenerated: string[] = [];

    // Safety guard against infinite loops
    let loopGuard = 0;
    const maxCyclesPerRule = 365;

    while (occurrence <= asOfDate && loopGuard < maxCyclesPerRule) {
      loopGuard++;

      // Check rule expiration
      if (rawRule.endDate && occurrence > rawRule.endDate) {
        break;
      }

      const clientRequestId = `${rawRule.id}_${occurrence}`;

      // Check if transaction with this clientRequestId already exists for idempotency
      const [existingTxn] = await db
        .select({ id: finTransactions.id })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, rawRule.userId),
            eq(finTransactions.clientRequestId, clientRequestId)
          )
        )
        .limit(1);

      if (existingTxn) {
        skipped++;
      } else {
        let signedAmount = -Math.abs(Number(rawRule.amount));
        if (rawRule.type === 'income') {
          signedAmount = Math.abs(Number(rawRule.amount));
        }

        const [inserted] = await db
          .insert(finTransactions)
          .values({
            userId: rawRule.userId,
            accountId: rawRule.accountId,
            toAccountId: rawRule.toAccountId || null,
            categoryId: rawRule.categoryId || null,
            date: occurrence,
            type: rawRule.type,
            amount: Number(rawRule.amount),
            signedAmount,
            payee: rawRule.payee || null,
            note: rawRule.note || null,
            clientRequestId,
            isRecurring: true,
            recurringRuleId: rawRule.id,
          })
          .onConflictDoNothing()
          .returning();

        if (inserted) {
          generated++;
          occurrencesGenerated.push(occurrence);
          if (occurrence < asOfDate) {
            backfilled++;
          }
          createdTransactions.push({
            id: inserted.id,
            userId: inserted.userId,
            accountId: inserted.accountId,
            toAccountId: inserted.toAccountId,
            categoryId: inserted.categoryId,
            date: inserted.date,
            type: inserted.type as TransactionDTO['type'],
            amount: Number(inserted.amount),
            signedAmount: Number(inserted.signedAmount),
            payee: inserted.payee,
            note: inserted.note,
            tags: inserted.tags,
            clientRequestId: inserted.clientRequestId,
            importHash: inserted.importHash,
            isRecurring: inserted.isRecurring,
            recurringRuleId: inserted.recurringRuleId,
            deletedAt: inserted.deletedAt ? inserted.deletedAt.toISOString() : null,
            createdAt: inserted.createdAt.toISOString(),
            updatedAt: inserted.updatedAt.toISOString(),
          });
        } else {
          skipped++;
        }
      }

      // Advance occurrence with month-end clamping
      occurrence = advanceRecurringDate(
        occurrence,
        rawRule.frequency as RecurringRuleDTO['frequency'],
        rawRule.interval,
        anchorDay,
        anchorMonth
      );
    }

    const isExpired = Boolean(rawRule.endDate && occurrence > rawRule.endDate);

    // Update rule state
    await db
      .update(finRecurringRules)
      .set({
        nextOccurrence: occurrence,
        isActive: !isExpired,
        updatedAt: new Date(),
      })
      .where(eq(finRecurringRules.id, rawRule.id));

    rulesProcessed.push({
      ruleId: rawRule.id,
      rulePayee: rawRule.payee,
      previousNextOccurrence: initialNextOccurrence,
      newNextOccurrence: occurrence,
      occurrencesGenerated,
      isExpired,
    });
  }

  return {
    processed: dueRules.length,
    generated,
    backfilled,
    skipped,
    transactions: createdTransactions,
    rulesProcessed,
  };
}

/**
 * In-memory Mock backend generator for local test and mock personas.
 */
async function generateMockBackend(
  asOfDate: string,
  userId?: string,
  providedService?: FinanceService
): Promise<GenerationResult> {
  const service = providedService || getFinanceService();
  const effectiveUserId = userId || 'mock_user';

  const allRules = await service.listRecurringRules(effectiveUserId);
  const dueRules = allRules.filter(
    (r) => r.isActive && r.nextOccurrence <= asOfDate && (!userId || r.userId === userId)
  );

  let generated = 0;
  let backfilled = 0;
  let skipped = 0;
  const createdTransactions: TransactionDTO[] = [];
  const rulesProcessed: RuleGenerationDetail[] = [];

  for (const rule of dueRules) {
    const anchorDay = extractAnchorDay(rule);
    const anchorMonth = extractAnchorMonth(rule);
    const initialNextOccurrence = rule.nextOccurrence;

    let occurrence = initialNextOccurrence;
    const occurrencesGenerated: string[] = [];

    let loopGuard = 0;
    const maxCyclesPerRule = 365;

    while (occurrence <= asOfDate && loopGuard < maxCyclesPerRule) {
      loopGuard++;

      if (rule.endDate && occurrence > rule.endDate) {
        break;
      }

      const clientRequestId = `${rule.id}_${occurrence}`;

      try {
        const txn = await service.createTransaction(
          rule.userId,
          {
            accountId: rule.accountId,
            toAccountId: rule.toAccountId,
            categoryId: rule.categoryId,
            date: occurrence,
            type: rule.type,
            amount: rule.amount,
            payee: rule.payee,
            note: rule.note,
            clientRequestId,
            isRecurring: true,
            recurringRuleId: rule.id,
          },
          { clientRequestId }
        );

        // If txn was returned from cache, it was already generated
        if (txn.createdAt !== txn.updatedAt && occurrencesGenerated.includes(occurrence)) {
          skipped++;
        } else {
          generated++;
          occurrencesGenerated.push(occurrence);
          if (occurrence < asOfDate) {
            backfilled++;
          }
          createdTransactions.push(txn);
        }
      } catch (_err) {
        // If already existing or duplicate, handle gracefully
        skipped++;
      }

      occurrence = advanceRecurringDate(
        occurrence,
        rule.frequency,
        rule.interval,
        anchorDay,
        anchorMonth
      );
    }

    const isExpired = Boolean(rule.endDate && occurrence > rule.endDate);

    await service.updateRecurringRule(rule.userId, rule.id, {
      nextOccurrence: occurrence,
      isActive: !isExpired,
    });

    rulesProcessed.push({
      ruleId: rule.id,
      rulePayee: rule.payee,
      previousNextOccurrence: initialNextOccurrence,
      newNextOccurrence: occurrence,
      occurrencesGenerated,
      isExpired,
    });
  }

  return {
    processed: dueRules.length,
    generated,
    backfilled,
    skipped,
    transactions: createdTransactions,
    rulesProcessed,
  };
}
