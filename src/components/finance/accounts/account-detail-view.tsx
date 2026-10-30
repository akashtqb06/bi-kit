'use client';

import React, { useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeftIcon,
  PlusIcon,
  CreditCardIcon,
  TrendingUpIcon,
  PiggyBankIcon,
  Trash2Icon,
  AlertCircleIcon,
  RefreshCwIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { useFinanceStore } from '../shared/finance-store';
import {
  formatINR,
  formatPercent,
  formatGain,
  formatLiabilityBalance,
} from '../shared/format';
import { UpdateValuationDialog } from './update-valuation-dialog';
import { EditAccountOpeningDialog } from './edit-account-opening-dialog';
import { TransactionTable } from '../transactions/transaction-table';
import { ChartRenderer } from '@src/components/charts/chart-renderer';
import { defaultChartConfig, type ChartConfigData } from '@src/lib/schemas';
import { cn } from '@/lib/utils';

export function AccountDetailView({ accountId }: { accountId: string }) {
  const router = useRouter();
  const {
    accounts,
    transactions,
    valuations,
    deleteAccount,
    openQuickAdd,
    openPayBill,
    recalculateAccount,
  } = useFinanceStore();

  const [valuationOpen, setValuationOpen] = useState(false);
  const [editOpeningOpen, setEditOpeningOpen] = useState(false);
  const [isRecalculating, setIsRecalculating] = useState(false);

  const account = useMemo(
    () => accounts.find((a) => a.id === accountId),
    [accounts, accountId]
  );

  const handleRecalculate = async () => {
    if (!account) return;
    try {
      setIsRecalculating(true);
      await recalculateAccount(account.id);
      toast.success('Valuations recalculated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  const accountValuations = useMemo(
    () => valuations[accountId] || [],
    [valuations, accountId]
  );

  // Balance history chart data
  const chartData = useMemo(() => {
    if (!account) return [];

    if (account.kind === 'mutual_fund' || account.kind === 'stocks') {
      if (accountValuations.length > 0) {
        return accountValuations.map((v) => ({
          date: v.date,
          value: v.value / 100,
        }));
      }
    }

    // Generate trend from recent transactions
    const accountTx = transactions
      .filter((t) => t.accountId === accountId || t.toAccountId === accountId)
      .sort((a, b) => a.date.localeCompare(b.date));

    if (accountTx.length === 0) {
      return [
        { date: '2026-10-01', value: account.balance / 100 },
        { date: '2026-10-28', value: account.balance / 100 },
      ];
    }

    // Reconstruct ledger points
    let running = account.balance;
    const points: { date: string; value: number }[] = [];

    // Points for last 5 transactions
    accountTx.forEach((tx) => {
      points.push({
        date: tx.date,
        value: Math.round(running / 100),
      });
      if (tx.type === 'expense' || (tx.type === 'transfer' && tx.accountId === accountId)) {
        running += tx.amount;
      } else {
        running -= tx.amount;
      }
    });

    return points.reverse();
  }, [account, accountValuations, transactions, accountId]);

  const chartConfig: ChartConfigData = {
    ...defaultChartConfig,
    title: 'Balance Trend',
    xAxis: 'date',
    yAxis: ['value'],
    seriesConfig: [
      {
        column: 'value',
        label: 'Balance (₹)',
        color: 'var(--chart-1)',
        aggregation: 'sum',
      },
    ],
  };

  if (!account) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-center">
        <AlertCircleIcon className="size-10 text-muted-foreground/50 mb-3" />
        <h2 className="text-base font-bold">Account not found</h2>
        <p className="text-xs text-muted-foreground mt-1">
          This account may have been removed or does not exist.
        </p>
        <Link href="/finance/accounts" className="mt-4">
          <Button variant="outline" size="sm">
            Back to Accounts
          </Button>
        </Link>
      </div>
    );
  }

  const isCard = account.kind === 'credit_card';
  const isInvestment = account.kind === 'mutual_fund' || account.kind === 'stocks';
  const isDeposit = account.kind === 'fixed_deposit' || account.kind === 'recurring_deposit';

  const handleDelete = async () => {
    if (confirm(`Are you sure you want to delete ${account.name}?`)) {
      await deleteAccount(account.id);
      toast.success('Account deleted');
      router.push('/finance/accounts');
    }
  };

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Back button & Header */}
      <div className="flex flex-col gap-3">
        <Link
          href="/finance/accounts"
          className="inline-flex items-center gap-1.5 text-xs text-muted-foreground hover:text-foreground transition-colors w-fit"
        >
          <ArrowLeftIcon className="size-3.5" />
          <span>Back to Accounts</span>
        </Link>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-5 rounded-2xl border bg-card shadow-xs">
          <div>
            <div className="flex items-center gap-2">
              <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-foreground">
                {account.name}
              </h2>
              <Badge variant="outline" className="text-xs uppercase font-semibold">
                {account.kind.replace('_', ' ')}
              </Badge>
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              Currency: {account.currency} • Status: {account.isActive ? 'Active' : 'Archived'}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {isCard && account.outstanding > 0 && (
              <Button
                type="button"
                size="sm"
                className="gap-1.5 text-xs font-semibold shadow-xs"
                onClick={() => openPayBill(account.id)}
              >
                <CreditCardIcon className="size-3.5" />
                <span>Pay Bill ({formatINR(account.outstanding)})</span>
              </Button>
            )}

            {isInvestment && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="gap-1.5 text-xs font-semibold"
                onClick={() => setValuationOpen(true)}
              >
                <TrendingUpIcon className="size-3.5 text-primary" />
                <span>Update Value</span>
              </Button>
            )}

            {isDeposit && (
              <Button
                type="button"
                size="sm"
                variant="outline"
                disabled={isRecalculating}
                className="gap-1.5 text-xs font-semibold"
                onClick={handleRecalculate}
              >
                <RefreshCwIcon className={cn('size-3.5 text-primary', isRecalculating && 'animate-spin')} />
                <span>{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
              </Button>
            )}

            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="gap-1.5 text-xs font-semibold"
              onClick={() => openQuickAdd({ accountId: account.id })}
            >
              <PlusIcon className="size-3.5" />
              <span>Add Transaction</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="text-xs font-medium"
              onClick={() => setEditOpeningOpen(true)}
            >
              <span>Edit Opening</span>
            </Button>

            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="size-8 p-0 text-muted-foreground hover:text-destructive"
              onClick={handleDelete}
              title="Delete Account"
            >
              <Trash2Icon className="size-4" />
            </Button>
          </div>
        </div>
      </div>

      {/* Kind-Specific Highlight Panel */}
      {isCard && (
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <CreditCardIcon className="size-4 text-primary" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Card Information & Utilization
              </h3>
            </div>
            {account.nextDueDate && (
              <Badge variant="outline" className="text-xs font-medium">
                Next Due: {account.nextDueDate}
              </Badge>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">
                {account.balance < 0 ? 'Outstanding Debt' : account.balance > 0 ? 'Credit Balance' : 'Card Balance'}
              </span>
              <div
                className={cn(
                  'text-xl font-bold mt-0.5',
                  account.balance < 0
                    ? 'text-destructive'
                    : account.balance > 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-foreground'
                )}
              >
                {formatLiabilityBalance(account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Available Credit</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR((account.creditLimit || 0) - account.outstanding)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Credit Limit</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.creditLimit || 0)}
              </div>
            </div>
          </div>

          {account.creditLimit && account.creditLimit > 0 && (
            <div className="space-y-1.5 pt-1">
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>Credit Utilization</span>
                <span className="font-semibold text-foreground">
                  {Math.round(account.utilization * 100)}%
                </span>
              </div>
              <Progress
                value={account.utilization * 100}
                className={cn(
                  'h-2',
                  account.utilization > 0.5
                    ? '[&>div]:bg-destructive'
                    : account.utilization > 0.3
                    ? '[&>div]:bg-amber-500'
                    : '[&>div]:bg-emerald-500'
                )}
              />
            </div>
          )}
        </div>
      )}

      {isInvestment && (
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <TrendingUpIcon className="size-4 text-emerald-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Investment Portfolio Metrics
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 text-xs gap-1"
              onClick={() => setValuationOpen(true)}
            >
              <PlusIcon className="size-3" />
              <span>Record Valuation</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Current Market Value</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.currentValue || account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Total Invested (Cost Basis)</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.costBasis || account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Total Returns (Gain)</span>
              <div
                className={cn(
                  'text-xl font-bold mt-0.5',
                  (account.gain || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {formatGain(account.gain || 0).text}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Return Rate</span>
              <div
                className={cn(
                  'text-xl font-bold mt-0.5',
                  (account.gainPct || 0) >= 0
                    ? 'text-emerald-600 dark:text-emerald-400'
                    : 'text-rose-600 dark:text-rose-400'
                )}
              >
                {formatPercent(account.gainPct || 0, true)}
              </div>
            </div>
          </div>

          {/* Valuations Log */}
          {accountValuations.length > 0 && (
            <div className="space-y-2 pt-2 border-t">
              <h4 className="text-xs font-semibold text-muted-foreground">Valuation History</h4>
              <div className="divide-y border rounded-lg overflow-hidden bg-card text-xs">
                {accountValuations.slice().reverse().map((v) => (
                  <div key={v.id} className="flex items-center justify-between px-3 py-2">
                    <div>
                      <span className="font-medium text-foreground">{v.date}</span>
                      {v.note && (
                        <span className="text-muted-foreground italic ml-2">({v.note})</span>
                      )}
                    </div>
                    <div className="font-bold text-foreground">{formatINR(v.value)}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {account.kind === 'recurring_deposit' && (
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBankIcon className="size-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Recurring Deposit Details
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRecalculating}
              className="h-7 text-xs gap-1.5"
              onClick={handleRecalculate}
            >
              <RefreshCwIcon
                className={cn('size-3 text-primary', isRecalculating && 'animate-spin')}
              />
              <span>{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Current Value</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.accruedValue ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Interest Accrued</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{formatINR(account.interestEarned ?? 0)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Total Deposited</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.totalDeposited ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Projected Maturity Amount</span>
              <div className="text-xl font-bold text-primary mt-0.5">
                {formatINR(account.projectedMaturityAmount ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Installment Amount</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {account.monthlyInstallment ? `${formatINR(account.monthlyInstallment)} / mo` : '—'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Installments Paid</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {account.installmentsPaid ?? 0}{' '}
                {account.totalInstallments ? `of ${account.totalInstallments}` : ''}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Next Installment Date</span>
              <div className="text-base font-semibold text-foreground mt-1">
                {account.nextInstallmentDate || '—'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Maturity Date</span>
              <div className="text-base font-semibold text-foreground mt-1">
                {account.maturityDate || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {account.kind === 'fixed_deposit' && (
        <div className="p-4 rounded-xl border bg-card space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <PiggyBankIcon className="size-4 text-amber-500" />
              <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Fixed Deposit Details
              </h3>
            </div>
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRecalculating}
              className="h-7 text-xs gap-1.5"
              onClick={handleRecalculate}
            >
              <RefreshCwIcon
                className={cn('size-3 text-primary', isRecalculating && 'animate-spin')}
              />
              <span>{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
            </Button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-4 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Accrued Value</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.accruedValue ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Interest Earned</span>
              <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
                +{formatINR(account.interestEarned ?? 0)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Principal</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {formatINR(account.principal ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Projected Maturity</span>
              <div className="text-xl font-bold text-primary mt-0.5">
                {formatINR(account.projectedMaturityAmount ?? account.balance)}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Interest Rate</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {account.interestRate !== undefined ? `${account.interestRate}% p.a.` : '—'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Compounding</span>
              <div className="text-base font-semibold capitalize text-foreground mt-1">
                {account.compoundingFrequency || 'Quarterly'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Days to Maturity</span>
              <div className="text-xl font-bold text-foreground mt-0.5">
                {account.daysToMaturity !== undefined ? `${account.daysToMaturity} days` : '—'}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border">
              <span className="text-[11px] text-muted-foreground">Maturity Date</span>
              <div className="text-base font-semibold text-foreground mt-1">
                {account.maturityDate || '—'}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Balance Trend Chart */}
      {chartData.length > 0 && (
        <div className="p-4 rounded-xl border bg-card space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
              Balance History
            </h3>
            <span className="text-xs font-semibold text-foreground">
              Current: {formatINR(account.currentValue || account.balance)}
            </span>
          </div>

          <div className="h-56 w-full">
            <ChartRenderer
              type="area"
              config={chartConfig}
              data={chartData}
              showTitle={false}
              className="h-full"
            />
          </div>
        </div>
      )}

      {/* Ledger Table */}
      <div className="space-y-3">
        <h3 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
          Account Ledger
        </h3>
        <TransactionTable />
      </div>

      {/* Update Valuation Dialog */}
      <UpdateValuationDialog
        account={account}
        open={valuationOpen}
        onOpenChange={setValuationOpen}
      />

      {/* Edit Opening Balance & Date Dialog */}
      <EditAccountOpeningDialog
        account={account}
        open={editOpeningOpen}
        onOpenChange={setEditOpeningOpen}
      />
    </div>
  );
}
