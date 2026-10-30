import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  db,
  finAccounts,
  finCategories,
  finTransactions,
  finUserSettings,
  finValuations,
} from '@src/lib/db';
import { calculateNetWorth } from '../domain/net-worth';
import { isCardDueWithinDays } from '../domain/credit-card';
import type { OverviewStatsDTO, OverviewStatsQuery, TransactionDTO } from '../contract';
import type { AccountKind, AccountClass } from '../constants';
import { mapTransactionToDTO } from './transactions';
import {
  todayInTz,
  currentMonthStartInTz,
  currentMonthEndInTz,
  getPresetDateRange,
  getPreviousPeriodRange,
  DEFAULT_TZ,
  type OverviewPreset,
} from '../timezone';

export interface ExtendedOverviewStats extends OverviewStatsDTO {
  previousPeriod?: {
    income: number;
    expense: number;
    savingsRate: number;
  };
  spendByCategory?: Array<{
    categoryId: string;
    categoryName: string;
    categoryColor?: string | null;
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
  activePeriod?: {
    from: string;
    to: string;
    preset: string;
    accounts: string[];
  };
}

export async function getOverviewStats(
  userId: string,
  query?: OverviewStatsQuery
): Promise<ExtendedOverviewStats> {
  const [settings] = await db
    .select({ timezone: finUserSettings.timezone })
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);
  const userTz = settings?.timezone || DEFAULT_TZ;
  const today = todayInTz(userTz);

  // Compute period boundaries in user timezone
  let startDate: string;
  let endDate: string;
  const preset = query?.preset || (query?.from && query?.to ? 'custom' : 'this_month');

  if (query?.from && query?.to) {
    startDate = query.from;
    endDate = query.to;
  } else if (query?.preset && query.preset !== 'custom') {
    const range = getPresetDateRange(query.preset as OverviewPreset, userTz);
    startDate = range.from;
    endDate = range.to;
  } else {
    startDate = currentMonthStartInTz(userTz);
    endDate = currentMonthEndInTz(userTz);
  }

  // Same duration immediately preceding the period
  const { from: prevStart, to: prevEnd } = getPreviousPeriodRange(startDate, endDate);

  // Account filters
  const filterAccountIds = query?.accounts
    ? query.accounts
        .split(',')
        .map((s) => s.trim())
        .filter(Boolean)
    : [];

  // 1. Fetch all active accounts for user (Net Worth tiles are ALWAYS as of today)
  const accounts = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)));

  // 2. Fetch latest valuations for investment accounts (as of today)
  const accountIds = accounts.map((a) => a.id);
  const valuations = accountIds.length > 0
    ? await db
        .select({
          accountId: finValuations.accountId,
          date: finValuations.date,
          value: finValuations.value,
        })
        .from(finValuations)
        .where(and(inArray(finValuations.accountId, accountIds), lte(finValuations.date, today)))
        .orderBy(desc(finValuations.date))
    : [];

  // Map latest valuation per account
  const latestValuations = new Map<string, number>();
  for (const v of valuations) {
    if (!latestValuations.has(v.accountId)) {
      latestValuations.set(v.accountId, Number(v.value));
    }
  }

  // 3. Compute balances per account from transactions in batch (always current balances as of today)
  const sourceSums = await db
    .select({
      accountId: finTransactions.accountId,
      total: sql<string>`COALESCE(SUM(${finTransactions.signedAmount}), 0)`,
    })
    .from(finTransactions)
    .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)))
    .groupBy(finTransactions.accountId);

  const targetSums = await db
    .select({
      accountId: finTransactions.toAccountId,
      total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
    })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.type, 'transfer'),
        isNull(finTransactions.deletedAt)
      )
    )
    .groupBy(finTransactions.toAccountId);

  const sourceMap = new Map<string, number>();
  for (const r of sourceSums) sourceMap.set(r.accountId, Number(r.total));
  const targetMap = new Map<string, number>();
  for (const r of targetSums) {
    if (r.accountId) targetMap.set(r.accountId, Number(r.total));
  }

  const accountsForNetWorth = [];
  const accountsByKind: Record<string, { count: number; totalBalance: number }> = {};
  const cardsDueSoon: ExtendedOverviewStats['cardsDueSoon'] = [];

  for (const acc of accounts) {
    const balance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
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

  // 4. Calculate Net Worth (ignores period, always as of today)
  const nw = calculateNetWorth(accountsForNetWorth);

  // 5. Income & Expense for current period (filtered by date range and account IDs)
  const curConditions = [
    eq(finTransactions.userId, userId),
    isNull(finTransactions.deletedAt),
    gte(finTransactions.date, startDate),
    lte(finTransactions.date, endDate),
  ];
  if (filterAccountIds.length > 0) {
    curConditions.push(inArray(finTransactions.accountId, filterAccountIds));
  }

  const [curPeriod] = await db
    .select({
      income: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'income' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'expense' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(finTransactions)
    .where(and(...curConditions));

  const monthlyIncome = Number(curPeriod?.income || 0);
  const monthlyExpense = Number(curPeriod?.expense || 0);
  const savingsRate = monthlyIncome > 0
    ? Number((((monthlyIncome - monthlyExpense) / monthlyIncome) * 100).toFixed(2))
    : 0;

  // 6. Previous Period comparison for the exact same length immediately before
  const prevConditions = [
    eq(finTransactions.userId, userId),
    isNull(finTransactions.deletedAt),
    gte(finTransactions.date, prevStart),
    lte(finTransactions.date, prevEnd),
  ];
  if (filterAccountIds.length > 0) {
    prevConditions.push(inArray(finTransactions.accountId, filterAccountIds));
  }

  const [prevPeriod] = await db
    .select({
      income: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'income' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'expense' THEN ${finTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(finTransactions)
    .where(and(...prevConditions));

  const prevIncome = Number(prevPeriod?.income || 0);
  const prevExpense = Number(prevPeriod?.expense || 0);
  const prevSavingsRate = prevIncome > 0
    ? Number((((prevIncome - prevExpense) / prevIncome) * 100).toFixed(2))
    : 0;

  // 7. Spend by category for selected period (filtered by date and accounts)
  const catSpendConditions = [
    eq(finTransactions.userId, userId),
    eq(finTransactions.type, 'expense'),
    isNull(finTransactions.deletedAt),
    gte(finTransactions.date, startDate),
    lte(finTransactions.date, endDate),
    sql`(${finCategories.name} IS NULL OR ${finCategories.name} <> 'Credit card payment')`,
  ];
  if (filterAccountIds.length > 0) {
    catSpendConditions.push(inArray(finTransactions.accountId, filterAccountIds));
  }

  const catSpendRows = await db
    .select({
      categoryId: finTransactions.categoryId,
      categoryName: finCategories.name,
      categoryColor: finCategories.color,
      totalAmount: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
    })
    .from(finTransactions)
    .leftJoin(finCategories, eq(finTransactions.categoryId, finCategories.id))
    .where(and(...catSpendConditions))
    .groupBy(finTransactions.categoryId, finCategories.name, finCategories.color)
    .orderBy(desc(sql`SUM(${finTransactions.amount})`));

  const spendByCategory = catSpendRows.map((r) => {
    const amt = Number(r.totalAmount);
    return {
      categoryId: r.categoryId || 'uncategorized',
      categoryName: r.categoryName || 'Uncategorized',
      categoryColor: r.categoryColor,
      amount: amt,
      percentage: monthlyExpense > 0 ? Number(((amt / monthlyExpense) * 100).toFixed(2)) : 0,
    };
  });

  // 8. Recent transactions for selected period
  const recentConditions = [
    eq(finTransactions.userId, userId),
    isNull(finTransactions.deletedAt),
    gte(finTransactions.date, startDate),
    lte(finTransactions.date, endDate),
  ];
  if (filterAccountIds.length > 0) {
    recentConditions.push(inArray(finTransactions.accountId, filterAccountIds));
  }

  const recentRows = await db
    .select()
    .from(finTransactions)
    .where(and(...recentConditions))
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
    activePeriod: {
      from: startDate,
      to: endDate,
      preset,
      accounts: filterAccountIds,
    },
  };
}
