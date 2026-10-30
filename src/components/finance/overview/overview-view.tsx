'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  TrendingUpIcon,
  TrendingDownIcon,
  CreditCardIcon,
  LandmarkIcon,
  PiggyBankIcon,
  WalletIcon,
  ChevronRightIcon,
  CoinsIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { useFinanceStore } from '../shared/finance-store';
import { formatINR, formatPercent } from '../shared/format';
import { ChartRenderer } from '@src/components/charts/chart-renderer';
import { defaultChartConfig, type ChartConfigData } from '@src/lib/schemas';
import { cn } from '@/lib/utils';

export function OverviewView() {
  const {
    accounts,
    transactions,
    categories,
    netWorthHistory,
    overviewStats,
    openQuickAdd,
  } = useFinanceStore();

  const [period, setPeriod] = useState<'this_month' | 'last_month' | 'last_3_months' | 'this_year' | 'custom'>('this_month');

  // Net worth calculation
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

  // Upcoming card dues
  const upcomingCardDues = useMemo(() => {
    return accounts
      .filter((a) => a.kind === 'credit_card' && a.outstanding > 0)
      .sort((a, b) => (a.dueDay || 31) - (b.dueDay || 31));
  }, [accounts]);

  // Balances by account kind
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

  // Net worth sparkline data
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

  // Spend by Category Donut Data
  const spendByCategoryData = useMemo(() => {
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

    // If empty, supply placeholder data
    if (rows.length === 0) {
      return [
        { category: 'Groceries', amount: 8500 },
        { category: 'Food & Dining', amount: 4500 },
        { category: 'Fuel & Transport', amount: 3200 },
        { category: 'Shopping', amount: 5500 },
      ];
    }

    return rows.sort((a, b) => b.amount - a.amount);
  }, [transactions, categories]);

  const donutConfig: ChartConfigData = {
    ...defaultChartConfig,
    title: 'Spend by Category',
    donutLabelColumn: 'category',
    donutValueColumn: 'amount',
    showDataLabels: false,
    showLegend: true,
  };

  // Month-over-month calculations (Mock deltas for demo/fidelity)
  const currentIncome = overviewStats?.monthlyIncome ?? 0;
  const prevIncome = 19500000; // ₹1,95,000
  const incomeDeltaPct = Math.round(((currentIncome - prevIncome) / prevIncome) * 1000) / 10;

  const currentExpense = overviewStats?.monthlyExpense ?? 0;
  const prevExpense = 7850000; // ₹78,500
  const expenseDeltaPct = Math.round(((currentExpense - prevExpense) / prevExpense) * 1000) / 10;

  const currentSavingsRate = overviewStats?.savingsRate ?? 0;
  const prevSavingsRate = 59.7;
  const savingsRateDelta = Math.round((currentSavingsRate - prevSavingsRate) * 10) / 10;

  // Recent transactions (latest 6)
  const recentTransactions = useMemo(() => {
    return transactions.slice(0, 6);
  }, [transactions]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Top Header & Period Selector */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Financial Overview</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Holistic view of assets, liabilities, savings rate, and recent transactions
          </p>
        </div>

        {/* Period Selector Tabs */}
        <div className="flex items-center gap-1.5 p-1 bg-muted/60 rounded-lg text-xs font-medium overflow-x-auto">
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 rounded-md transition-colors shrink-0',
              period === 'this_month'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setPeriod('this_month')}
          >
            This Month
          </button>
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 rounded-md transition-colors shrink-0',
              period === 'last_month'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setPeriod('last_month')}
          >
            Last Month
          </button>
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 rounded-md transition-colors shrink-0',
              period === 'last_3_months'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setPeriod('last_3_months')}
          >
            Last 3M
          </button>
          <button
            type="button"
            className={cn(
              'px-2.5 py-1 rounded-md transition-colors shrink-0',
              period === 'this_year'
                ? 'bg-background text-foreground shadow-xs font-semibold'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setPeriod('this_year')}
          >
            This Year
          </button>
        </div>
      </div>

      {/* Hero: Net Worth Card with Sparkline */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 p-5 rounded-2xl border bg-card shadow-xs">
        <div className="lg:col-span-1 flex flex-col justify-between space-y-4">
          <div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                Total Net Worth
              </span>
              <Badge variant="outline" className="text-[10px] text-emerald-600 dark:text-emerald-400 font-semibold">
                +4.1% this month
              </Badge>
            </div>
            <div className="text-3xl sm:text-4xl font-extrabold tracking-tight text-foreground mt-2">
              {formatINR(netWorth)}
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3 pt-3 border-t">
            <div>
              <span className="text-[11px] text-muted-foreground font-medium">Assets</span>
              <div className="text-base font-bold text-emerald-600 dark:text-emerald-400">
                {formatINR(totalAssets)}
              </div>
            </div>
            <div>
              <span className="text-[11px] text-muted-foreground font-medium">Liabilities</span>
              <div className="text-base font-bold text-destructive">
                {formatINR(totalLiabilities)}
              </div>
            </div>
          </div>
        </div>

        {/* Sparkline Trend Chart */}
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

      {/* Month-over-Month Comparison Cards (Income, Expense, Savings Rate) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Income */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Monthly Income</span>
            <div className="size-6 rounded-md bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUpIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold tracking-tight text-foreground">
              {formatINR(currentIncome)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                +{incomeDeltaPct}%
              </span>
              <span>vs last month ({formatINR(prevIncome)})</span>
            </div>
          </div>
        </div>

        {/* Expense */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Monthly Expenses</span>
            <div className="size-6 rounded-md bg-destructive/10 text-destructive flex items-center justify-center">
              <TrendingDownIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold tracking-tight text-foreground">
              {formatINR(currentExpense)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                {expenseDeltaPct}%
              </span>
              <span>vs last month ({formatINR(prevExpense)})</span>
            </div>
          </div>
        </div>

        {/* Savings Rate */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Savings Rate</span>
            <div className="size-6 rounded-md bg-primary/10 text-primary flex items-center justify-center">
              <CoinsIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl font-bold tracking-tight text-foreground">
              {formatPercent(currentSavingsRate)}
            </div>
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground mt-1">
              <span className="text-emerald-600 dark:text-emerald-400 font-semibold flex items-center">
                +{savingsRateDelta}%
              </span>
              <span>vs last month ({formatPercent(prevSavingsRate)})</span>
            </div>
          </div>
        </div>
      </div>

      {/* Two Column Layout: Balances by Kind & Spend by Category Donut */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Balances by Account Kind */}
        <div className="p-4 rounded-xl border bg-card space-y-4 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Balances by Account Kind
            </h3>
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
                  <span className="text-xs font-semibold text-foreground">
                    {item.label}
                  </span>
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

        {/* Spend by Category Donut Chart */}
        <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Spend by Category
            </h3>
            <span className="text-xs font-semibold text-muted-foreground">
              Total: {formatINR(currentExpense)}
            </span>
          </div>

          <div className="h-64 w-full">
            <ChartRenderer
              type="donut"
              config={donutConfig}
              data={spendByCategoryData}
              showTitle={false}
              className="h-full"
            />
          </div>
        </div>
      </div>

      {/* Two Column Layout: Upcoming Card Dues & Recent Transactions */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Upcoming Card Dues */}
        <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-purple-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Upcoming Card Dues
              </h3>
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
                      {formatINR(card.outstanding)}
                    </span>
                    <Button
                      type="button"
                      size="sm"
                      variant="outline"
                      className="h-7 text-xs font-medium"
                      onClick={() =>
                        openQuickAdd({
                          type: 'transfer',
                          toAccountId: card.id,
                          amount: card.outstanding,
                        })
                      }
                    >
                      Pay Bill
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Recent Transactions */}
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

          <div className="divide-y divide-border/60">
            {recentTransactions.map((tx) => {
              const cat = categories.find((c) => c.id === tx.categoryId);
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
                          <span>{cat.name}</span>
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
        </div>
      </div>
    </div>
  );
}
