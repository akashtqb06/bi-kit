import { and, desc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import {
  db,
  finAccounts,
  finCategories,
  finPfEntries,
  finTransactions,
  finUserSettings,
  finValuations,
} from '@src/lib/db';
import { catchUpRecurringRulesIfDue } from '../recurring';
import { calculateNetWorth } from '../domain/net-worth';
import {
  calculateInvestmentHolding,
  type InvestmentTransactionRecord,
} from '../domain/investments';
import { isCardDueWithinDays } from '../domain/credit-card';
import {
  rdValue,
  type RDConfig,
  type RDCompounding,
  type RDDayHistoryItem,
  type RDLatePaymentItem,
} from '../domain/rd';
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
  previousPeriodRange?: {
    from: string;
    to: string;
  };
  trackingStartDate?: string | null;
  spendByCategory?: Array<{
    categoryId: string;
    categoryName: string;
    categoryColor?: string | null;
    amount: number;
    percentage: number;
    transactionCount: number;
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
  await catchUpRecurringRulesIfDue(userId);

  const [settings] = await db
    .select({
      timezone: finUserSettings.timezone,
      trackingStartDate: finUserSettings.trackingStartDate,
      includeEpsInNetWorth: finUserSettings.includeEpsInNetWorth,
      includeAccruedInterestInNetWorth: finUserSettings.includeAccruedInterestInNetWorth,
    })
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
          costBasis: finValuations.costBasis,
          note: finValuations.note,
          createdAt: finValuations.createdAt,
        })
        .from(finValuations)
        .where(and(inArray(finValuations.accountId, accountIds), lte(finValuations.date, today)))
        .orderBy(desc(finValuations.date), desc(finValuations.createdAt))
    : [];

  // Map latest valuation per account
  const latestValuations = new Map<string, number>();
  const latestValuationMap = new Map<
    string,
    { date: string; value: number; costBasis: number | null; note: string | null; createdAt: Date | string }
  >();
  for (const v of valuations) {
    if (!latestValuations.has(v.accountId)) {
      latestValuations.set(v.accountId, Number(v.value));
      latestValuationMap.set(v.accountId, {
        date: v.date,
        value: Number(v.value),
        costBasis: v.costBasis !== null && v.costBasis !== undefined ? Number(v.costBasis) : null,
        note: v.note,
        createdAt: v.createdAt,
      });
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

  // Provident Fund sums for EPF / VPF
  const pfSums = await db
    .select({
      accountId: finPfEntries.accountId,
      pfTotal: sql<string>`COALESCE(SUM(${finPfEntries.employeeAmount} + ${finPfEntries.employerAmount}), 0)`,
      pensionTotal: sql<string>`COALESCE(SUM(${finPfEntries.pensionAmount}), 0)`,
    })
    .from(finPfEntries)
    .where(eq(finPfEntries.userId, userId))
    .groupBy(finPfEntries.accountId);

  const pfMap = new Map<string, { pfTotal: number; pensionTotal: number }>();
  for (const r of pfSums) {
    pfMap.set(r.accountId, {
      pfTotal: Number(r.pfTotal),
      pensionTotal: Number(r.pensionTotal),
    });
  }

  const hasInvestment = accounts.some(
    (a) =>
      a.kind === 'mutual_fund' ||
      a.kind === 'stocks' ||
      a.kind === 'other_asset' ||
      a.kind === 'nps'
  );
  const investmentTransfersByAccount = new Map<string, InvestmentTransactionRecord[]>();
  if (hasInvestment) {
    const transferRows = await db
      .select({
        accountId: finTransactions.accountId,
        toAccountId: finTransactions.toAccountId,
        date: finTransactions.date,
        amount: finTransactions.amount,
        type: finTransactions.type,
        createdAt: finTransactions.createdAt,
        isRecurring: finTransactions.isRecurring,
      })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.type, 'transfer'),
          isNull(finTransactions.deletedAt)
        )
      );

    for (const t of transferRows) {
      const amt = Number(t.amount);
      if (t.toAccountId) {
        const list = investmentTransfersByAccount.get(t.toAccountId) ?? [];
        list.push({
          accountId: t.accountId,
          toAccountId: t.toAccountId,
          type: 'transfer',
          amount: amt,
          date: t.date,
          createdAt: t.createdAt,
          isRecurring: t.isRecurring,
        });
        investmentTransfersByAccount.set(t.toAccountId, list);
      }
      if (t.accountId) {
        const list = investmentTransfersByAccount.get(t.accountId) ?? [];
        list.push({
          accountId: t.accountId,
          toAccountId: t.toAccountId,
          type: 'transfer',
          amount: amt,
          date: t.date,
          createdAt: t.createdAt,
          isRecurring: t.isRecurring,
        });
        investmentTransfersByAccount.set(t.accountId, list);
      }
    }
  }

  const accountsForNetWorth = [];
  const accountsByKind: Record<string, { count: number; totalBalance: number }> = {};
  const cardsDueSoon: ExtendedOverviewStats['cardsDueSoon'] = [];

  for (const acc of accounts) {
    const isPf = acc.kind === 'epf' || acc.kind === 'vpf';
    let balance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
    let pensionMemo: number | null = null;

    if (isPf) {
      const pfData = pfMap.get(acc.id);
      balance = pfData?.pfTotal ?? 0;
      pensionMemo = pfData?.pensionTotal ?? 0;
    }

    let currentValue = latestValuations.get(acc.id);

    const isInvestment =
      acc.kind === 'mutual_fund' ||
      acc.kind === 'stocks' ||
      acc.kind === 'other_asset' ||
      acc.kind === 'nps';

    if (isInvestment) {
      const meta = (acc.metadata || {}) as Record<string, unknown>;
      const valRow = latestValuationMap.get(acc.id);
      const openingContribution = Number(
        meta.openingContributionPaise ??
          meta.costBasis ??
          meta.openingBalancePaise ??
          (valRow?.note === 'Opening valuation recorded during setup' ? valRow?.costBasis : undefined) ??
          0
      );
      const invTxs = investmentTransfersByAccount.get(acc.id) || [];
      const holding = calculateInvestmentHolding({
        openingContribution,
        transactions: invTxs,
        accountId: acc.id,
        latestValuation: valRow,
        asOfDate: today,
      });
      currentValue = holding.currentValue;
    }

    if (acc.kind === 'recurring_deposit') {
      const meta = (acc.metadata || {}) as Record<string, unknown>;
      const monthlyInstallment = Number(
        meta.monthlyInstallmentPaise ??
          meta.monthlyInstallment ??
          meta.installment ??
          meta.installmentAmount ??
          0
      );
      if (monthlyInstallment > 0) {
        const rawRate = Number(meta.interestRate ?? meta.rate ?? 6.8);
        const interestRate = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));
        const startDate =
          (meta.startDate as string) ||
          (acc.createdAt instanceof Date ? acc.createdAt.toISOString().slice(0, 10) : String(acc.createdAt).slice(0, 10));
        const tenureMonths = Number(meta.tenureMonths || 12);
        const installmentDay =
          meta.installmentDay !== undefined
            ? (meta.installmentDay as number | 'last')
            : parseInt(startDate.slice(8, 10), 10);
        const firstInstallmentOn =
          (meta.firstInstallmentOn as 'start_date' | 'first_installment_day') || 'start_date';
        const compounding = (meta.compoundingFrequency ??
          meta.compounding ??
          'quarterly') as RDCompounding;
        const installmentsMode =
          (meta.installmentsMode as 'schedule' | 'recorded') ||
          (meta.installmentMode === 'recorded_transfers' ? 'recorded' : 'schedule');
        const startMonth = startDate.slice(0, 7);
        const installmentDayHistory =
          (meta.installmentDayHistory as RDDayHistoryItem[]) &&
          (meta.installmentDayHistory as RDDayHistoryItem[]).length > 0
            ? (meta.installmentDayHistory as RDDayHistoryItem[])
            : [{ effectiveFrom: startMonth, day: installmentDay }];
        const skippedInstallments = (meta.skippedInstallments as string[]) || [];
        const paidLateInstallments = (meta.paidLateInstallments as RDLatePaymentItem[]) || [];

        const rdConfig: RDConfig = {
          monthlyInstallment,
          startDate,
          installmentDay,
          firstInstallmentOn,
          tenureMonths,
          interestRate,
          compounding,
          installmentsMode,
          installmentDayHistory,
          skippedInstallments,
          paidLateInstallments,
        };
        const rdRes = rdValue(rdConfig, today);
        currentValue = rdRes.currentValue;
      }
    }

    accountsForNetWorth.push({
      id: acc.id,
      kind: acc.kind as AccountKind,
      class: acc.class as AccountClass,
      balance,
      currentValue: currentValue !== undefined ? currentValue : null,
      isActive: acc.isActive,
      pensionMemo,
    });

    if (!accountsByKind[acc.kind]) {
      accountsByKind[acc.kind] = { count: 0, totalBalance: 0 };
    }
    accountsByKind[acc.kind].count += 1;
    let kindBalance = currentValue !== undefined ? currentValue : balance;
    if (isPf && settings?.includeEpsInNetWorth && pensionMemo) {
      kindBalance += pensionMemo;
    }
    accountsByKind[acc.kind].totalBalance += kindBalance;

    // Credit card due check
    if (acc.kind === 'credit_card' && balance < 0) {
      const meta = (acc.metadata || {}) as Record<string, unknown>;
      const statementDay = Number(meta.statementDay || 21);
      const dueDay = Number(meta.dueDays || meta.dueDay || 20);
      const isOffset =
        meta.isOffsetDays !== undefined
          ? Boolean(meta.isOffsetDays)
          : (meta.dueDays !== undefined || (meta.dueDay !== undefined && Number(meta.dueDay) > 0));

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
  const nw = calculateNetWorth(accountsForNetWorth, {
    includeEpsInNetWorth: settings?.includeEpsInNetWorth,
  });

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
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'expense' AND (${finTransactions.categoryId} IS NULL OR ${finTransactions.categoryId} != 'cat_system_cc_payment') THEN ${finTransactions.amount} ELSE 0 END), 0)`,
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
      expense: sql<string>`COALESCE(SUM(CASE WHEN ${finTransactions.type} = 'expense' AND (${finTransactions.categoryId} IS NULL OR ${finTransactions.categoryId} != 'cat_system_cc_payment') THEN ${finTransactions.amount} ELSE 0 END), 0)`,
    })
    .from(finTransactions)
    .where(and(...prevConditions));

  const prevIncome = Number(prevPeriod?.income || 0);
  const prevExpense = Number(prevPeriod?.expense || 0);
  const prevSavingsRate = prevIncome > 0
    ? Number((((prevIncome - prevExpense) / prevIncome) * 100).toFixed(2))
    : 0;

  // 7. Spend by category for selected period (filtered by date and accounts)
  // Donut slices must sum exactly to total expense for the period
  const catSpendConditions = [
    eq(finTransactions.userId, userId),
    eq(finTransactions.type, 'expense'),
    isNull(finTransactions.deletedAt),
    gte(finTransactions.date, startDate),
    lte(finTransactions.date, endDate),
    sql`(${finTransactions.categoryId} IS NULL OR ${finTransactions.categoryId} != 'cat_system_cc_payment')`,
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
      txCount: sql<string>`COUNT(${finTransactions.id})`,
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
      transactionCount: Number(r.txCount || 1),
    };
  });

  // 8. Recent transactions for selected period (excludes opening balance adjustments)
  const recentConditions = [
    eq(finTransactions.userId, userId),
    isNull(finTransactions.deletedAt),
    gte(finTransactions.date, startDate),
    lte(finTransactions.date, endDate),
    sql`NOT (${finTransactions.type} = 'adjustment' AND ${finTransactions.payee} = 'Opening Balance')`,
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
    previousPeriodRange: {
      from: prevStart,
      to: prevEnd,
    },
    trackingStartDate: settings?.trackingStartDate || null,
    spendByCategory,
    accountsByKind,
    recentTransactions: recentRows.map((r) => mapTransactionToDTO(r)),
    cardsDueSoon,
    activePeriod: {
      from: startDate,
      to: endDate,
      preset,
      accounts: filterAccountIds,
    },
  };
}
