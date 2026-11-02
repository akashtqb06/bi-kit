import { NextRequest, NextResponse } from 'next/server';
import { and, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { db } from '@src/lib/db';
import { finAccounts, finBudgets, finTransactions } from '@src/lib/db/schema/finance';
import { dispatchEvent, processWebhookDeliveries } from '@src/lib/finance/webhooks/dispatcher';

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const now = new Date();
    const todayStr = now.toISOString().split('T')[0];
    const yearMonth = todayStr.slice(0, 7);
    const monthStart = `${yearMonth}-01`;

    let emittedEvents = 0;

    // 1. Check Budgets: emit budget.threshold if spending >= 80%
    const budgets = await db
      .select({
        id: finBudgets.id,
        userId: finBudgets.userId,
        categoryId: finBudgets.categoryId,
        amount: finBudgets.amount,
      })
      .from(finBudgets);

    for (const b of budgets) {
      if (b.amount <= 0) continue;

      const [spendRow] = await db
        .select({ totalSpend: sql<number>`coalesce(sum(${finTransactions.amount}), 0)::bigint` })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, b.userId),
            eq(finTransactions.categoryId, b.categoryId),
            eq(finTransactions.type, 'expense'),
            gte(finTransactions.date, monthStart),
            lte(finTransactions.date, todayStr),
            isNull(finTransactions.deletedAt)
          )
        );

      const totalSpend = Number(spendRow?.totalSpend ?? 0);
      const ratio = totalSpend / b.amount;
      if (ratio >= 0.8) {
        await dispatchEvent(
          'budget.threshold',
          {
            budgetId: b.id,
            categoryId: b.categoryId,
            budgetAmount: b.amount,
            spentAmount: totalSpend,
            percentageUsed: Math.round(ratio * 100),
          },
          b.userId
        );
        emittedEvents++;
      }
    }

    // 2. Check Credit Cards: emit card.due_soon if due within 3 days or statement due
    const creditCards = await db
      .select({
        id: finAccounts.id,
        userId: finAccounts.userId,
        name: finAccounts.name,
        creditLimit: finAccounts.creditLimit,
        metadata: finAccounts.metadata,
      })
      .from(finAccounts)
      .where(and(eq(finAccounts.kind, 'credit_card'), eq(finAccounts.isActive, true)));

    const currentDay = now.getDate();
    for (const card of creditCards) {
      const meta = (card.metadata as Record<string, unknown>) || {};
      const dueDay = typeof meta.dueDay === 'number' ? meta.dueDay : undefined;
      const dueDate = typeof meta.dueDate === 'string' ? meta.dueDate : undefined;

      let isDueSoon = false;
      let daysUntilDue = -1;

      if (dueDay !== undefined) {
        let diff = dueDay - currentDay;
        if (diff < 0) diff += 30; // next month
        if (diff >= 0 && diff <= 3) {
          isDueSoon = true;
          daysUntilDue = diff;
        }
      } else if (dueDate) {
        const targetDate = new Date(dueDate);
        const diffDays = Math.ceil((targetDate.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
        if (diffDays >= 0 && diffDays <= 3) {
          isDueSoon = true;
          daysUntilDue = diffDays;
        }
      }

      if (isDueSoon) {
        await dispatchEvent(
          'card.due_soon',
          {
            accountId: card.id,
            accountName: card.name,
            creditLimit: card.creditLimit,
            daysUntilDue,
          },
          card.userId
        );
        emittedEvents++;
      }
    }

    // 3. Process Webhook Deliveries
    const deliveryResults = await processWebhookDeliveries();

    return NextResponse.json({
      success: true,
      emittedEvents,
      deliveries: deliveryResults,
      timestamp: now.toISOString(),
    });
  } catch (err) {
    console.error('[cron/webhooks] Execution failed:', err);
    return handleApiError(err);
  }
}
