import { and, desc, eq, gte, isNull, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finCategories, finTransactions, finValuations } from '@src/lib/db';
import { calculateNetWorth } from '../domain/net-worth';
import { isCardDueWithinDays } from '../domain/credit-card';
import type { OverviewStatsDTO, TransactionDTO } from '../contract';
import type { AccountKind, AccountClass } from '../constants';
import { mapTransactionToDTO } from './transactions';
import { todayInTz, currentMonthStartInTz, currentMonthEndInTz, previousMonthRangeInTz, DEFAULT_TZ } from '../timezone';

export interface ExtendedOverviewStats extends OverviewStatsDTO {
  previousPeriod?: {
    income: number;
    expense: number;
    savingsRate: number;
  };
  spendByCategory?: Array<{
    categoryId: string;
    categoryName: string;
    amount: number;
    percentage: number;
  }>;
  accountsByKind?: Record<string, { count: number; totalBalance: number }>;
  recentTransactions?: TransactionDTO[];
  cardsDueSoon?: Array<{
    accountId: string;
    accountName: string;
    outstanding: number;
    dueDate: string;
    daysRemaining: number;
  }>;
}

export async function getOverviewStats(userId: string): Promise<ExtendedOverviewStats> {
  const userTz = DEFAULT_TZ; // TODO: query fin_user_settings.timezone for userId
  const today = todayInTz(userTz);
  const currentMonthStart = currentMonthStartInTz(userTz);
  const currentMonthEnd = currentMonthEndInTz(userTz);
  const { start: prevMonthStart, end: prevMonthEnd } = previousMonthRangeInTz(userTz);

  // 1. Fetch all active accounts for user
  const accounts = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)));

  // 2. Fetch latest valuations for investment accounts
  const valuations = await db
    .select({
      accountId: finValuations.accountId,
      date: finValuations.date,
      value: finValuations.value,
    })
    .from(finValuations)
    .where(lte(finValuations.date, today))
    .orderBy(desc(finValuations.date));

  // Map latest valuation per account
  const latestValuations = new Map<string, number>();
  for (const v of valuations) {
    if (!latestValuations.has(v.accountId)) {
      latestValuations.set(v.accountId, Number(v.value));
    }
  }

  // 3. Compute balances per account from transactions
  const accountsForNetWorth = [];
  const accountsByKind: Record<string, { count: number; totalBalance: number }> = {};
  const cardsDueSoon: ExtendedOverviewStats['cardsDueSoon'] = [];

  for (const acc of accounts) {
    // Ledger balance from all non-deleted transactions
    // Source side (decreases on expense/transfer, increases on income)
    const [sourceSum] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${finTransactions.signedAmount}), 0)`,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.accountId, acc.id),
          isNull(finTransactions.deletedAt)
        )
      );

    // Target side (incoming transfers)
    const [targetSum] = await db
      .select({
        total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.toAccountId, acc.id),
          eq(finTransactions.type, 'transfer'),
          isNull(finTransactions.deletedAt)
        )
      );

    const balance = Number(sourceSum?.total || 0) + Number(targetSum?.total || 0);

    const currentValue = latestValuations.get(acc.id);

    accountsForNetWorth.push({
      id: acc.id,
      kind: acc.kind as AccountKind,
      class: acc.class as AccountClass,
      balance,
      currentValue: currentValue !== undefined ? currentValue : null,
      isActive: acc.isActive,
    });

    if (!accountsByKind[acc.kind]) {
      accountsByKind[acc.kind] = { count: 0, totalBalance: 0 };
    }
    accountsByKind[acc.kind].count += 1;
    accountsByKind[acc.kind].totalBalance += currentValue !== undefined ? currentValue : balance;

    // Credit card due check
    if (acc.kind === 'credit_card' && balance < 0) {
      const meta = (acc.metadata || {}) as Record<string, unknown>;
      const statementDay = Number(meta.statementDay || 15);
      const dueDay = Number(meta.dueDay || 5);
      const isOffset = Boolean(meta.isOffsetDays);

      const dueInfo = isCardDueWithinDays(statementDay, dueDay, today, 10, { isOffsetDays: isOffset });
      if (dueInfo.isDue) {
        cardsDueSoon.push({
          accountId: acc.id,
          accountName: acc.name,
          outstanding: Math.abs(balance),
          dueDate: dueInfo.dueDate,
          daysRemaining: dueInfo.daysRemaining,
        });
      }
    }
  }

  // 4. Calculate Net Worth
  const nw = calculateNetWorth(accountsForNetWorth);

  // 5. Monthly Income & Expense for current period
  const [curPeriod] = await db
    .select({
      income: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'income' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'expense' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        isNull(finTransactions.deletedAt),
        gte(finTransactions.date, currentMonthStart),
        lte(finTransactions.date, currentMonthEnd)
      )
    );

  const monthlyIncome = Number(curPeriod?.income || 0);
  const monthlyExpense = Number(curPeriod?.expense || 0);
  const savingsRate = monthlyIncome > 0
    ? Number((((monthlyIncome - monthlyExpense) / monthlyIncome) * 100).toFixed(2))
    : 0;

  // 6. Previous Period for comparison
  const [prevPeriod] = await db
    .select({
      income: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'income' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'expense' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        isNull(finTransactions.deletedAt),
        gte(finTransactions.date, prevMonthStart),
        lte(finTransactions.date, prevMonthEnd)
      )
    );

  const prevIncome = Number(prevPeriod?.income || 0);
  const prevExpense = Number(prevPeriod?.expense || 0);
  const prevSavingsRate = prevIncome > 0
    ? Number((((prevIncome - prevExpense) / prevIncome) * 100).toFixed(2))
    : 0;

  // 7. Spend by category for current period
  const catSpendRows = await db
    .select({
      categoryId: finTransactions.categoryId,
      categoryName: finCategories.name,
      totalAmount: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
    })
    .from(finTransactions)
    .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.type, 'expense'),
        isNull(finTransactions.deletedAt),
        gte(finTransactions.date, currentMonthStart),
        lte(finTransactions.date, currentMonthEnd)
      )
    )
    .groupBy(finTransactions.categoryId, finCategories.name)
    .orderBy(desc(sql`SUM(${finTransactions.amount})`));

  const spendByCategory = catSpendRows.map((r) => {
    const amt = Number(r.totalAmount);
    return {
      categoryId: r.categoryId || 'uncategorized',
      categoryName: r.categoryName || 'Uncategorized',
      amount: amt,
      percentage: monthlyExpense > 0 ? Number(((amt / monthlyExpense) * 100).toFixed(2)) : 0,
    };
  });

  // 8. Recent transactions
  const recentRows = await db
    .select()
    .from(finTransactions)
    .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)))
    .orderBy(desc(finTransactions.date), desc(finTransactions.id))
    .limit(10);

  return {
    netWorth: nw.netWorth,
    totalAssets: nw.totalAssets,
    totalLiabilities: nw.totalLiabilities,
    monthlyIncome,
    monthlyExpense,
    savingsRate,
    previousPeriod: {
      income: prevIncome,
      expense: prevExpense,
      savingsRate: prevSavingsRate,
    },
    spendByCategory,
    accountsByKind,
    recentTransactions: recentRows.map(mapTransactionToDTO),
    cardsDueSoon,
  };
}
