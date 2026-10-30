'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import {
  LandmarkIcon,
  CreditCardIcon,
  TrendingUpIcon,
  PiggyBankIcon,
  WalletIcon,
  PlusIcon,
  ChevronRightIcon,
  CoinsIcon,
  ArrowUpRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFinanceStore } from '../shared/finance-store';
import { formatINR, formatPercent, formatGain, formatLiabilityBalance } from '../shared/format';
import { AddAccountDialog } from './add-account-dialog';
import type { AccountWithBalance } from '../shared/fixtures';
import { cn } from '@/lib/utils';

export function AccountsView() {
  const { accounts, openQuickAdd, openPayBill } = useFinanceStore();
  const [addAccountOpen, setAddAccountOpen] = useState(false);

  // Group accounts
  const grouped = useMemo(() => {
    const cashAndBank: AccountWithBalance[] = [];
    const cards: AccountWithBalance[] = [];
    const investments: AccountWithBalance[] = [];
    const deposits: AccountWithBalance[] = [];
    const loans: AccountWithBalance[] = [];

    accounts.forEach((acc) => {
      if (acc.kind === 'bank' || acc.kind === 'cash') {
        cashAndBank.push(acc);
      } else if (acc.kind === 'credit_card') {
        cards.push(acc);
      } else if (acc.kind === 'mutual_fund' || acc.kind === 'stocks' || acc.kind === 'other_asset') {
        investments.push(acc);
      } else if (acc.kind === 'fixed_deposit' || acc.kind === 'recurring_deposit') {
        deposits.push(acc);
      } else if (acc.kind === 'loan' || acc.kind === 'other_liability') {
        loans.push(acc);
      }
    });

    return { cashAndBank, cards, investments, deposits, loans };
  }, [accounts]);

  // Overall totals
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

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Top Header & Summary Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-lg font-bold tracking-tight">Accounts & Balances</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Manage your bank accounts, credit lines, deposits, and investment portfolios
          </p>
        </div>

        <Button
          type="button"
          size="sm"
          className="gap-1.5 text-xs font-semibold shadow-xs"
          onClick={() => setAddAccountOpen(true)}
        >
          <PlusIcon className="size-3.5" />
          <span>Add Account</span>
        </Button>
      </div>

      {/* Summary Strip (Assets, Liabilities, Net Worth) */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Assets */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Assets</span>
            <div className="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <LandmarkIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {formatINR(totalAssets)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Across cash, banks, FDs, and investments
            </div>
          </div>
        </div>

        {/* Total Liabilities */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Total Liabilities</span>
            <div className="size-7 rounded-lg bg-destructive/10 text-destructive flex items-center justify-center">
              <CreditCardIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-destructive">
              {formatINR(totalLiabilities)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              Outstanding credit card balances and active loans
            </div>
          </div>
        </div>

        {/* Net Worth */}
        <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-semibold text-primary">Total Net Worth</span>
            <div className="size-7 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <CoinsIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-2">
            <div className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
              {formatINR(netWorth)}
            </div>
            <div className="text-[11px] text-primary font-medium mt-0.5">
              Assets minus liabilities
            </div>
          </div>
        </div>
      </div>

      {/* Account Groups */}
      <div className="space-y-6">
        {/* Group 1: Cash & Bank */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <WalletIcon className="size-4 text-emerald-500" />
              <h3 className="text-sm font-bold text-foreground">Cash & Bank</h3>
            </div>
            <span className="text-xs font-semibold text-muted-foreground">
              {formatINR(
                grouped.cashAndBank.reduce((sum, a) => sum + a.balance, 0)
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped.cashAndBank.map((acc) => (
              <Link
                key={acc.id}
                href={`/finance/accounts/${acc.id}`}
                className="group block p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-xs transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {acc.name}
                    </h4>
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {acc.kind}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>
                <div className="mt-4">
                  <div className="text-lg font-bold text-foreground">
                    {formatINR(acc.balance)}
                  </div>
                  <div className="text-[11px] text-muted-foreground mt-0.5">
                    Available balance
                  </div>
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Group 2: Cards */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-purple-500" />
              <h3 className="text-sm font-bold text-foreground">Cards</h3>
            </div>
            <span className="text-xs font-semibold text-destructive">
              Due:{' '}
              {formatINR(
                grouped.cards.reduce((sum, a) => sum + a.outstanding, 0)
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped.cards.map((acc) => (
              <div
                key={acc.id}
                className="p-4 rounded-xl border bg-card flex flex-col justify-between hover:border-primary/50 hover:shadow-xs transition-all"
              >
                <div>
                  <div className="flex items-start justify-between">
                    <Link
                      href={`/finance/accounts/${acc.id}`}
                      className="group/link flex-1"
                    >
                      <h4 className="text-xs font-semibold text-foreground group-hover/link:text-primary transition-colors flex items-center gap-1">
                        {acc.name}
                        <ArrowUpRightIcon className="size-3 text-muted-foreground" />
                      </h4>
                      <div className="text-[11px] text-muted-foreground mt-0.5">
                        {acc.nextStatementDate && acc.nextDueDate
                          ? `Bill: ${acc.nextStatementDate} • Due: ${acc.nextDueDate}`
                          : acc.nextDueDate
                          ? `Due on ${acc.nextDueDate}`
                          : 'Credit Card'}
                      </div>
                    </Link>

                    {acc.outstanding > 0 && (
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="h-7 text-xs px-2 font-medium"
                        onClick={() => openPayBill(acc.id)}
                      >
                        Pay Bill
                      </Button>
                    )}
                  </div>

                  <div className="mt-3">
                    <div
                      className={cn(
                        'text-lg font-bold',
                        acc.balance < 0
                          ? 'text-destructive'
                          : acc.balance > 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-foreground'
                      )}
                    >
                      {formatLiabilityBalance(acc.balance)}
                    </div>
                    <div className="text-[11px] text-muted-foreground">
                      {acc.balance < 0
                        ? 'Outstanding balance'
                        : acc.balance > 0
                        ? 'Credit balance'
                        : 'No balance due'}
                    </div>
                  </div>
                </div>

                {acc.creditLimit && acc.creditLimit > 0 && (
                  <div className="mt-3 pt-3 border-t space-y-1.5">
                    <div className="flex justify-between text-[11px] text-muted-foreground">
                      <span>Limit: {formatINR(acc.creditLimit)}</span>
                      <span className="font-medium text-foreground">
                        {Math.round(acc.utilization * 100)}% used
                      </span>
                    </div>
                    <Progress
                      value={acc.utilization * 100}
                      className={cn(
                        'h-1.5',
                        acc.utilization > 0.5
                          ? '[&>div]:bg-destructive'
                          : acc.utilization > 0.3
                          ? '[&>div]:bg-amber-500'
                          : '[&>div]:bg-emerald-500'
                      )}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Group 3: Investments */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-blue-500" />
              <h3 className="text-sm font-bold text-foreground">Investments</h3>
            </div>
            <span className="text-xs font-semibold text-foreground">
              {formatINR(
                grouped.investments.reduce((sum, a) => sum + (a.currentValue || a.balance), 0)
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped.investments.map((acc) => (
              <Link
                key={acc.id}
                href={`/finance/accounts/${acc.id}`}
                className="group block p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-xs transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {acc.name}
                    </h4>
                    <span className="text-[11px] text-muted-foreground capitalize">
                      {acc.kind.replace('_', ' ')}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <div className="text-lg font-bold text-foreground">
                      {formatINR(acc.currentValue || acc.balance)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Current Value
                    </div>
                  </div>

                  {acc.gain !== undefined && (
                    <div className="text-right">
                      <div
                        className={cn(
                          'text-xs font-bold',
                          acc.gain >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-rose-600 dark:text-rose-400'
                        )}
                      >
                        {formatGain(acc.gain).text}
                      </div>
                      <div
                        className={cn(
                          'text-[10px]',
                          acc.gain >= 0
                            ? 'text-muted-foreground'
                            : 'text-rose-600 dark:text-rose-400 font-medium'
                        )}
                      >
                        {formatPercent(acc.gainPct || 0, true)}
                      </div>
                    </div>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Group 4: Deposits (FD/RD) */}
        <div className="space-y-3">
          <div className="flex items-center justify-between border-b pb-2">
            <div className="flex items-center gap-2">
              <PiggyBankIcon className="size-4 text-amber-500" />
              <h3 className="text-sm font-bold text-foreground">Deposits (FD & RD)</h3>
            </div>
            <span className="text-xs font-semibold text-foreground">
              {formatINR(
                grouped.deposits.reduce((sum, a) => sum + (a.accruedValue || a.balance), 0)
              )}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
            {grouped.deposits.map((acc) => (
              <Link
                key={acc.id}
                href={`/finance/accounts/${acc.id}`}
                className="group block p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-xs transition-all"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                      {acc.name}
                    </h4>
                    <span className="text-[11px] text-muted-foreground uppercase">
                      {acc.kind === 'fixed_deposit' ? 'Fixed Deposit' : 'Recurring Deposit'}
                    </span>
                  </div>
                  <ChevronRightIcon className="size-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                </div>

                <div className="mt-4 flex items-baseline justify-between">
                  <div>
                    <div className="text-lg font-bold text-foreground">
                      {formatINR(acc.accruedValue || acc.balance)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Accrued Value
                    </div>
                  </div>

                  {acc.daysToMaturity !== undefined && (
                    <Badge variant="outline" className="text-[10px] py-0 px-1.5 font-medium">
                      Matures in {acc.daysToMaturity}d
                    </Badge>
                  )}
                </div>
              </Link>
            ))}
          </div>
        </div>

        {/* Group 5: Loans */}
        {grouped.loans.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-center justify-between border-b pb-2">
              <div className="flex items-center gap-2">
                <LandmarkIcon className="size-4 text-destructive" />
                <h3 className="text-sm font-bold text-foreground">Loans</h3>
              </div>
              <span className="text-xs font-semibold text-destructive">
                {formatINR(
                  grouped.loans.reduce((sum, a) => sum + a.outstanding, 0)
                )}
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {grouped.loans.map((acc) => (
                <Link
                  key={acc.id}
                  href={`/finance/accounts/${acc.id}`}
                  className="group block p-4 rounded-xl border bg-card hover:border-primary/50 hover:shadow-xs transition-all"
                >
                  <div className="flex items-start justify-between">
                    <div>
                      <h4 className="text-xs font-semibold text-foreground group-hover:text-primary transition-colors">
                        {acc.name}
                      </h4>
                      <span className="text-[11px] text-muted-foreground capitalize">
                        {acc.kind}
                      </span>
                    </div>
                    <ChevronRightIcon className="size-4 text-muted-foreground/60 group-hover:text-primary group-hover:translate-x-0.5 transition-all" />
                  </div>

                  <div className="mt-4">
                    <div className="text-lg font-bold text-destructive">
                      Owes {formatINR(acc.outstanding)}
                    </div>
                    <div className="text-[11px] text-muted-foreground mt-0.5">
                      Remaining principal
                    </div>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Add Account Dialog */}
      <AddAccountDialog open={addAccountOpen} onOpenChange={setAddAccountOpen} />
    </div>
  );
}
