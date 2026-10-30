'use client';

import React, { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  CreditCardIcon,
  LandmarkIcon,
  PiggyBankIcon,
  WalletIcon,
  ChevronRightIcon,
  CoinsIcon,
  RotateCcwIcon,
  FilterIcon,
  CalendarIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { useFinanceStore } from '../shared/finance-store';
import { formatINR, formatPercent } from '../shared/format';
import { FinancePageSkeleton } from '../shared/finance-skeleton';
import { ChartRenderer } from '@src/components/charts/chart-renderer';
import { defaultChartConfig, type ChartConfigData } from '@src/lib/schemas';
import { cn } from '@/lib/utils';
import {
  formatDateRangeDisplay,
  getPresetDateRange,
  type OverviewPreset,
} from '@src/lib/finance/timezone';
import { getCategoryColorMap } from '@src/lib/finance/colors';

export function OverviewView() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const {
    accounts,
    transactions,
    categories,
    netWorthHistory,
    overviewStats,
    overviewStatus,
    refreshOverviewStats,
    refreshAccounts,
    refreshNetWorthHistory,
    openPayBill,
  } = useFinanceStore();

  // Read filters from URL search params
  const presetParam = (searchParams.get('preset') as OverviewPreset) || null;
  const fromParam = searchParams.get('from') || '';
  const toParam = searchParams.get('to') || '';
  const accountsParam = searchParams.get('accounts') || '';

  const activePreset: OverviewPreset =
    presetParam || (fromParam && toParam ? 'custom' : 'this_month');

  // Local state for custom date inputs
  const [customFromInput, setCustomFromInput] = useState<string | null>(null);
  const [customToInput, setCustomToInput] = useState<string | null>(null);

  const customFrom = customFromInput ?? fromParam;
  const customTo = customToInput ?? toParam;

  // Determine active date range string
  const activeRange = overviewStats?.activePeriod
    ? {
        from: overviewStats.activePeriod.from,
        to: overviewStats.activePeriod.to,
      }
    : fromParam && toParam
      ? { from: fromParam, to: toParam }
      : getPresetDateRange(activePreset);

  // Trigger refetch whenever URL filter params change
  useEffect(() => {
    refreshOverviewStats({
      preset: activePreset,
      from: fromParam || undefined,
      to: toParam || undefined,
      accounts: accountsParam || undefined,
    });
  }, [activePreset, fromParam, toParam, accountsParam, refreshOverviewStats]);

  // URL updating helper
  const updateFilters = (updates: {
    preset?: OverviewPreset;
    from?: string;
    to?: string;
    accounts?: string;
  }) => {
    const params = new URLSearchParams(searchParams.toString());

    if (updates.preset !== undefined) {
      if (updates.preset === 'this_month') {
        params.delete('preset');
        params.delete('from');
        params.delete('to');
      } else if (updates.preset === 'custom') {
        params.set('preset', 'custom');
        if (updates.from) params.set('from', updates.from);
        if (updates.to) params.set('to', updates.to);
      } else {
        params.set('preset', updates.preset);
        params.delete('from');
        params.delete('to');
      }
    }

    if (updates.from !== undefined) {
      if (updates.from) params.set('from', updates.from);
      else params.delete('from');
    }

    if (updates.to !== undefined) {
      if (updates.to) params.set('to', updates.to);
      else params.delete('to');
    }

    if (updates.accounts !== undefined) {
      if (!updates.accounts || updates.accounts === 'all') {
        params.delete('accounts');
      } else {
        params.set('accounts', updates.accounts);
      }
    }

    const qs = params.toString();
    router.push(qs ? `/finance/overview?${qs}` : '/finance/overview');
  };

  const handleReset = () => {
    setCustomFromInput(null);
    setCustomToInput(null);
    router.push('/finance/overview');
  };

  const isFiltered = Boolean(
    (presetParam && presetParam !== 'this_month') ||
      fromParam ||
      toParam ||
      accountsParam
  );

  // Net worth calculation (ALWAYS as of today, ignores filters)
  const totalAssets = useMemo(() => {
    return accounts
      .filter((a) => a.class === 'asset')
      .reduce((sum, a) => sum + (a.currentValue || a.balance), 0);
  }, [accounts]);

  const totalLiabilities = useMemo(() => {
    return accounts
      .filter((a) => a.class === 'liability')
      .reduce((sum, a) => sum + a.outstanding, 0);
  }, [accounts]);

  const netWorth = totalAssets - totalLiabilities;

  // Upcoming card dues (as of today)
  const upcomingCardDues = useMemo(() => {
    return accounts
      .filter((a) => a.kind === 'credit_card' && a.outstanding > 0)
      .sort((a, b) => (a.dueDay || 31) - (b.dueDay || 31));
  }, [accounts]);

  // Balances by account kind (as of today)
  const balancesByKind = useMemo(() => {
    const kinds = {
      bank: { label: 'Cash & Bank', balance: 0, icon: WalletIcon, color: '#10b981' },
      cards: { label: 'Credit Cards (Due)', balance: 0, icon: CreditCardIcon, color: '#ef4444' },
      investments: { label: 'Investments', balance: 0, icon: TrendingUpIcon, color: '#3b82f6' },
      deposits: { label: 'Deposits (FD/RD)', balance: 0, icon: PiggyBankIcon, color: '#f59e0b' },
      loans: { label: 'Loans', balance: 0, icon: LandmarkIcon, color: '#8b5cf6' },
    };

    accounts.forEach((a) => {
      if (a.kind === 'bank' || a.kind === 'cash') {
        kinds.bank.balance += a.balance;
      } else if (a.kind === 'credit_card') {
        kinds.cards.balance += a.outstanding;
      } else if (a.kind === 'mutual_fund' || a.kind === 'stocks' || a.kind === 'other_asset') {
        kinds.investments.balance += a.currentValue || a.balance;
      } else if (a.kind === 'fixed_deposit' || a.kind === 'recurring_deposit') {
        kinds.deposits.balance += a.accruedValue || a.balance;
      } else if (a.kind === 'loan' || a.kind === 'other_liability') {
        kinds.loans.balance += a.outstanding;
      }
    });

    return kinds;
  }, [accounts]);

  // Category Color Map
  const categoryColorMap = useMemo(() => {
    return getCategoryColorMap(categories);
  }, [categories]);

  // Net worth sparkline data (trend)
  const sparklineData = useMemo(() => {
    return netWorthHistory.map((p) => ({
      date: p.date,
      netWorth: Math.round(p.netWorth / 100),
      assets: Math.round(p.assets / 100),
      liabilities: Math.round(p.liabilities / 100),
    }));
  }, [netWorthHistory]);

  const netWorthChartConfig: ChartConfigData = {
    ...defaultChartConfig,
    title: 'Net Worth Trend',
    xAxis: 'date',
    yAxis: ['netWorth'],
    seriesConfig: [
      {
        column: 'netWorth',
        label: 'Net Worth (₹)',
        color: 'var(--chart-1)',
        aggregation: 'sum',
      },
    ],
  };

  // Spend by Category Donut Data (respects period and accounts)
  const spendByCategoryData = useMemo(() => {
    if (overviewStats?.spendByCategory && overviewStats.spendByCategory.length > 0) {
      return overviewStats.spendByCategory.map((c) => ({
        category: c.categoryName,
        amount: Math.round(c.amount / 100),
      }));
    }

    if (overviewStats?.spendByCategory && overviewStats.spendByCategory.length === 0) {
      return [];
    }

    const categoryTotals: Record<string, number> = {};

    transactions.forEach((t) => {
      if (t.type === 'expense' && t.categoryId) {
        categoryTotals[t.categoryId] = (categoryTotals[t.categoryId] || 0) + t.amount;
      }
    });

    const rows = Object.entries(categoryTotals).map(([catId, amountPaise]) => {
      const cat = categories.find((c) => c.id === catId);
      return {
        category: cat?.name || 'Other',
        amount: Math.round(amountPaise / 100),
      };
    });

    return rows.sort((a, b) => b.amount - a.amount);
  }, [overviewStats, transactions, categories]);

  const donutConfig: ChartConfigData = {
    ...defaultChartConfig,
    title: 'Spend by Category',
    donutLabelColumn: 'category',
    donutValueColumn: 'amount',
    showDataLabels: false,
    showLegend: true,
  };

  // Period stats & deltas
  const currentIncome = overviewStats?.monthlyIncome ?? 0;
  const prevIncome = overviewStats?.previousPeriod?.income ?? 0;
  const incomeDeltaPct = prevIncome > 0
    ? Math.round(((currentIncome - prevIncome) / prevIncome) * 1000) / 10
    : null;

  const currentExpense = overviewStats?.monthlyExpense ?? 0;
  const prevExpense = overviewStats?.previousPeriod?.expense ?? 0;
  const expenseDeltaPct = prevExpense > 0
    ? Math.round(((currentExpense - prevExpense) / prevExpense) * 1000) / 10
    : null;

  const currentSavingsRate = overviewStats?.savingsRate ?? 0;
  const prevSavingsRate = overviewStats?.previousPeriod?.savingsRate ?? 0;
  const savingsRateDelta = prevSavingsRate > 0
    ? Math.round((currentSavingsRate - prevSavingsRate) * 10) / 10
    : null;

  const netWorthChange = useMemo(() => {
    if (netWorthHistory.length < 2) return null;
    const prev = netWorthHistory[netWorthHistory.length - 2];
    const curr = netWorthHistory[netWorthHistory.length - 1];
    if (!prev || prev.netWorth === 0) return null;
    const pct = Math.round(((curr.netWorth - prev.netWorth) / Math.abs(prev.netWorth)) * 1000) / 10;
    return pct;
  }, [netWorthHistory]);

  // Recent transactions (respects period and account filter)
  const recentTransactions = overviewStats?.recentTransactions
    ? overviewStats.recentTransactions.slice(0, 6)
    : transactions.slice(0, 6);

  if (overviewStatus === 'loading' && !overviewStats) {
    return <FinancePageSkeleton title="Loading Financial Overview..." />;
  }

  if (overviewStatus === 'error' && !overviewStats) {
    return (
      <div className="flex-1 min-h-[400px] flex items-center justify-center">
        <div className="p-8 text-center border rounded-xl bg-card space-y-4 max-w-md mx-auto shadow-xs">
          <p className="text-sm text-destructive font-medium">Failed to load overview data.</p>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              refreshOverviewStats();
              refreshAccounts();
              refreshNetWorthHistory();
            }}
          >
            Retry
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Top Header & Overview Filter Bar */}
      <div className="flex flex-col gap-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold tracking-tight">Financial Overview</h2>
            <p className="text-xs text-muted-foreground mt-0.5">
              Holistic view of assets, liabilities, savings rate, and recent transactions
            </p>
          </div>

          {/* Active Range Display & Reset Button */}
          <div className="flex items-center gap-2 self-start sm:self-center">
            <div className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border bg-card text-xs font-medium text-foreground shadow-xs">
              <CalendarIcon className="size-3.5 text-muted-foreground shrink-0" />
              <span>{formatDateRangeDisplay(activeRange.from, activeRange.to)}</span>
            </div>

            {isFiltered && (
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-8 text-xs gap-1 text-muted-foreground hover:text-foreground"
                onClick={handleReset}
                title="Reset filters to this month and all accounts"
              >
                <RotateCcwIcon className="size-3" />
                <span>Reset</span>
              </Button>
            )}
          </div>
        </div>

        {/* Filter Controls Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 p-2 rounded-xl border bg-muted/40 text-xs">
          {/* Preset Buttons */}
          <div className="flex items-center gap-1 overflow-x-auto no-scrollbar">
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors shrink-0 font-medium',
                activePreset === 'this_month'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => updateFilters({ preset: 'this_month' })}
            >
              This month
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors shrink-0 font-medium',
                activePreset === 'last_month'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => updateFilters({ preset: 'last_month' })}
            >
              Last month
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors shrink-0 font-medium',
                activePreset === 'last_3_months'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => updateFilters({ preset: 'last_3_months' })}
            >
              Last 3 months
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors shrink-0 font-medium',
                activePreset === 'this_year'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => updateFilters({ preset: 'this_year' })}
            >
              This year
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-1 rounded-md transition-colors shrink-0 font-medium',
                activePreset === 'custom'
                  ? 'bg-background text-foreground shadow-xs font-semibold'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              onClick={() => {
                if (activePreset !== 'custom') {
                  const defaultRange = getPresetDateRange('this_month');
                  setCustomFromInput(defaultRange.from);
                  setCustomToInput(defaultRange.to);
                  updateFilters({
                    preset: 'custom',
                    from: defaultRange.from,
                    to: defaultRange.to,
                  });
                }
              }}
            >
              Custom range
            </button>
          </div>

          {/* Account Filter & Custom Range Inputs */}
          <div className="flex items-center gap-2 flex-wrap">
            {activePreset === 'custom' && (
              <div className="flex items-center gap-1.5">
                <Input
                  type="date"
                  className="h-8 text-xs bg-card w-32 px-2"
                  value={customFrom}
                  onChange={(e) => {
                    setCustomFromInput(e.target.value);
                    if (e.target.value && customTo) {
                      updateFilters({ from: e.target.value, to: customTo, preset: 'custom' });
                    }
                  }}
                  aria-label="Filter from date"
                />
                <span className="text-muted-foreground text-xs">to</span>
                <Input
                  type="date"
                  className="h-8 text-xs bg-card w-32 px-2"
                  value={customTo}
                  onChange={(e) => {
                    setCustomToInput(e.target.value);
                    if (customFrom && e.target.value) {
                      updateFilters({ from: customFrom, to: e.target.value, preset: 'custom' });
                    }
                  }}
                  aria-label="Filter to date"
                />
              </div>
            )}

            {/* Account Selector */}
            <div className="flex items-center gap-1">
              <FilterIcon className="size-3 text-muted-foreground shrink-0 hidden sm:inline" />
              <select
                className="h-8 rounded-md border border-input bg-card px-2 text-xs text-foreground focus:outline-hidden"
                value={accountsParam || 'all'}
                onChange={(e) => updateFilters({ accounts: e.target.value })}
                aria-label="Filter by account"
              >
                <option value="all">All Accounts</option>
                {accounts.map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
              </select>
            </div>
          </div>
        </div>
      </div>

      {/* Hero: Net Worth Card with Sparkline (EXPLICITLY IGNORES PERIOD, ALWAYS AS OF TODAY) */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-5 rounded-2xl border bg-card shadow-xs">
        <div className="lg:col-span-1 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Net Worth
              </span>
              <span className="text-[10px] text-muted-foreground font-medium">
                (as of today)
              </span>
              {netWorthChange !== null && (
                <Badge
                  variant="outline"
                  className={cn(
                    'text-[10px] font-semibold',
                    netWorthChange >= 0
                      ? 'text-emerald-600 dark:text-emerald-400'
                      : 'text-destructive'
                  )}
                >
                  {netWorthChange >= 0 ? `+${netWorthChange}%` : `${netWorthChange}%`}
                </Badge>
              )}
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
              {formatINR(netWorth)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            <div>
              <span className="text-[11px] text-muted-foreground font-medium">
                Assets (as of today)
              </span>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatINR(totalAssets)}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground font-medium">
                Liabilities (as of today)
              </span>
              <div className="text-base font-bold text-destructive">
                {formatINR(totalLiabilities)}
              </div>
            </div>
          </div>
        </div>

        {/* Sparkline Trend Chart (Historical as of today) */}
        <div className="lg:col-span-2 h-48 w-full pt-2">
          <ChartRenderer
            type="area"
            config={netWorthChartConfig}
            data={sparklineData}
            showTitle={false}
            className="h-full"
          />
        </div>
      </div>

      {/* Period-based Comparison Cards (Income, Expense, Savings Rate) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Income */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Period Income</span>
            <div className="size-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUpIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold tracking-tight text-foreground">
              {formatINR(currentIncome)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              {incomeDeltaPct !== null ? (
                <>
                  <span
                    className={cn(
                      'font-semibold flex items-center',
                      incomeDeltaPct >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-destructive'
                    )}
                  >
                    {incomeDeltaPct >= 0 ? `+${incomeDeltaPct}%` : `${incomeDeltaPct}%`}
                  </span>
                  <span>vs prior period ({formatINR(prevIncome)})</span>
                </>
              ) : (
                <span>No prior period data</span>
              )}
            </div>
          </div>
        </div>

        {/* Expense */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Period Expenses</span>
            <div className="size-6 rounded-md bg-destructive/10 text-destructive flex items-center justify-center">
              <TrendingDownIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold tracking-tight text-foreground">
              {formatINR(currentExpense)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              {expenseDeltaPct !== null ? (
                <>
                  <span
                    className={cn(
                      'font-semibold flex items-center',
                      expenseDeltaPct <= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-destructive'
                    )}
                  >
                    {expenseDeltaPct >= 0 ? `+${expenseDeltaPct}%` : `${expenseDeltaPct}%`}
                  </span>
                  <span>vs prior period ({formatINR(prevExpense)})</span>
                </>
              ) : (
                <span>No prior period data</span>
              )}
            </div>
          </div>
        </div>

        {/* Savings Rate */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Period Savings Rate</span>
            <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <CoinsIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold tracking-tight text-foreground">
              {formatPercent(currentSavingsRate)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              {savingsRateDelta !== null ? (
                <>
                  <span
                    className={cn(
                      'font-semibold flex items-center',
                      savingsRateDelta >= 0
                        ? 'text-emerald-600 dark:text-emerald-400'
                        : 'text-destructive'
                    )}
                  >
                    {savingsRateDelta >= 0 ? `+${savingsRateDelta}%` : `${savingsRateDelta}%`}
                  </span>
                  <span>vs prior period ({formatPercent(prevSavingsRate)})</span>
                </>
              ) : (
                <span>No prior period data</span>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Balances by Kind & Spend by Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Balances by Account Kind (as of today) */}
        <div className="p-4 rounded-xl border bg-card space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Balances by Account Kind
              </h3>
              <span className="text-[10px] text-muted-foreground font-medium">
                (as of today)
              </span>
            </div>
            <Link
              href="/finance/accounts"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              <span>View all</span>
              <ChevronRightIcon className="size-3" />
            </Link>
          </div>

          <div className="space-y-3">
            {Object.values(balancesByKind).map((item) => (
              <div
                key={item.label}
                className="flex items-center justify-between p-2.5 rounded-lg bg-muted/30 hover:bg-muted/50 transition-colors"
              >
                <div className="flex items-center gap-2.5">
                  <div
                    className="size-7 rounded-md flex items-center justify-center text-white"
                    style={{ backgroundColor: item.color }}
                  >
                    <item.icon className="size-3.5" />
                  </div>
                  <div>
                    <div className="font-semibold text-xs text-foreground">{item.label}</div>
                  </div>
                </div>

                <span
                  className={cn(
                    'text-xs font-bold',
                    item.label.includes('Due') || item.label.includes('Loans')
                      ? 'text-destructive'
                      : 'text-foreground'
                  )}
                >
                  {formatINR(item.balance)}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Spend by Category Donut Chart (Respects period and categoryColorMap) */}
        <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Spend by Category
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {formatINR(currentExpense)}
            </span>
          </div>

          {spendByCategoryData.length === 0 ? (
            <div className="h-64 w-full flex items-center justify-center text-xs text-muted-foreground">
              No transactions in this period
            </div>
          ) : (
            <div className="h-64 w-full">
              <ChartRenderer
                type="donut"
                config={donutConfig}
                data={spendByCategoryData}
                categoryColorMap={categoryColorMap}
                showTitle={false}
                className="h-full"
              />
            </div>
          )}
        </div>
      </div>

      {/* Two Column Layout: Upcoming Card Dues & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Card Dues (as of today) */}
        <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-purple-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Upcoming Card Dues
              </h3>
              <span className="text-[10px] text-muted-foreground font-medium">
                (as of today)
              </span>
            </div>
            <span className="text-xs text-muted-foreground">
              {upcomingCardDues.length} card{upcomingCardDues.length === 1 ? '' : 's'} with balance
            </span>
          </div>

          {upcomingCardDues.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No outstanding card dues! You are all caught up.
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {upcomingCardDues.map((card) => (
                <div
                  key={card.id}
                  className="py-2.5 flex items-center justify-between gap-3 text-xs"
                >
                  <div>
                    <h4 className="font-semibold text-foreground">{card.name}</h4>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      {card.nextDueDate ? `Due on ${card.nextDueDate}` : 'Due next cycle'}
                    </div>
                  </div>

                  <div className="flex items-center gap-3">
                    <span className="font-bold text-destructive">
                      Owes {formatINR(card.outstanding)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-medium"
                      onClick={() => openPayBill(card.id)}
                    >
                      Pay Bill
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions (Respects period and category colors) */}
        <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Recent Transactions
            </h3>
            <Link
              href="/finance/transactions"
              className="text-xs text-primary font-medium hover:underline flex items-center gap-1"
            >
              <span>View all</span>
              <ChevronRightIcon className="size-3" />
            </Link>
          </div>

          {recentTransactions.length === 0 ? (
            <div className="py-8 text-center text-xs text-muted-foreground">
              No transactions in this period
            </div>
          ) : (
            <div className="divide-y divide-border/60">
              {recentTransactions.map((tx) => {
                const cat = categories.find((c) => c.id === tx.categoryId);
                const catColor = cat?.color || (cat?.name ? categoryColorMap[cat.name] : null);

                return (
                  <div
                    key={tx.id}
                    className="py-2 flex items-center justify-between text-xs gap-2"
                  >
                    <div className="min-w-0">
                      <div className="font-semibold text-foreground truncate">
                        {tx.payee || tx.type}
                      </div>
                      <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-0.5">
                        <span>{tx.date}</span>
                        {cat && (
                          <>
                            <span>•</span>
                            <span className="flex items-center gap-1">
                              <span
                                className="size-1.5 rounded-full inline-block shrink-0"
                                style={{ backgroundColor: catColor || '#94a3b8' }}
                              />
                              <span>{cat.name}</span>
                            </span>
                          </>
                        )}
                      </div>
                    </div>

                    <div
                      className={cn(
                        'font-bold shrink-0',
                        tx.type === 'income'
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : tx.type === 'transfer'
                          ? 'text-blue-600 dark:text-blue-400'
                          : 'text-foreground'
                      )}
                    >
                      {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                      {formatINR(tx.amount)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
