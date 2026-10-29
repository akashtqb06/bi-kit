'use client';

import React, { useMemo } from 'react';
import {
  AlertTriangleIcon,
  ArrowRightIcon,
  Loader2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DraftAccount, SetupPreferences } from '@src/lib/finance/setup/types';
import { calculateReviewTotals } from '@src/lib/finance/setup/review-totals';
import { formatINR } from '../../shared/format';

interface ReviewStepProps {
  preferences: SetupPreferences;
  accounts: DraftAccount[];
  onBack: () => void;
  onFinish: () => void;
  isSubmitting?: boolean;
}

export function ReviewStep({
  preferences,
  accounts,
  onBack,
  onFinish,
  isSubmitting,
}: ReviewStepProps) {
  const totals = useMemo(
    () => calculateReviewTotals(accounts, preferences.trackingStartDate),
    [accounts, preferences.trackingStartDate]
  );

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center sm:text-left">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Review Your Starting Balance Sheet
        </h2>
        <p className="text-xs text-muted-foreground">
          Verify your accounts, starting balances, and calculated net worth as of {preferences.trackingStartDate}.
        </p>
      </div>

      {/* Totals Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {/* Total Assets */}
        <div className="p-4 rounded-xl border bg-card space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Total Assets
          </span>
          <div className="text-xl font-bold font-mono text-emerald-600 dark:text-emerald-400">
            {formatINR(totals.totalAssetsPaise)}
          </div>
          <span className="text-[10px] text-muted-foreground">
            Cash, Banks, Deposits, Investments
          </span>
        </div>

        {/* Total Liabilities */}
        <div className="p-4 rounded-xl border bg-card space-y-1">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Total Liabilities
          </span>
          <div className="text-xl font-bold font-mono text-destructive">
            {formatINR(totals.totalLiabilitiesPaise)}
          </div>
          <span className="text-[10px] text-muted-foreground">
            Credit Cards & Loans Owed
          </span>
        </div>

        {/* Starting Net Worth */}
        <div className="p-4 rounded-xl border bg-primary/5 border-primary/20 space-y-1">
          <span className="text-[11px] font-semibold text-primary uppercase tracking-wider">
            Starting Net Worth
          </span>
          <div className="text-xl font-bold font-mono text-foreground">
            {formatINR(totals.netWorthPaise)}
          </div>
          <span className="text-[10px] text-muted-foreground">
            Assets minus Liabilities
          </span>
        </div>
      </div>

      {/* Warnings Banner if any */}
      {totals.warnings.length > 0 && (
        <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
            <AlertTriangleIcon className="size-4 shrink-0" />
            <span>Please note {totals.warnings.length} warning(s):</span>
          </div>
          <ul className="list-disc list-inside space-y-1 text-xs text-amber-900/80 dark:text-amber-200/90 pl-1">
            {totals.warnings.map((w, idx) => (
              <li key={idx}>{w.message}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Accounts Table */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-foreground">
          Accounts Breakdown ({accounts.length})
        </span>
        <div className="border rounded-xl overflow-hidden bg-card text-xs">
          <table className="w-full text-left">
            <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
              <tr>
                <th className="p-3 font-semibold">Account</th>
                <th className="p-3 font-semibold">Kind / Class</th>
                <th className="p-3 font-semibold">Institution</th>
                <th className="p-3 font-semibold text-right">Opening Value</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {accounts.map((acc, i) => {
                const isLiability = acc.kind === 'credit_card' || acc.kind === 'loan';
                const displayPaise = isLiability
                  ? acc.owedPaise || 0
                  : acc.kind === 'fixed_deposit'
                  ? acc.principalPaise || acc.balancePaise || 0
                  : acc.kind === 'recurring_deposit'
                  ? acc.monthlyInstallmentPaise || acc.balancePaise || 0
                  : acc.kind === 'mutual_fund' || acc.kind === 'stocks'
                  ? acc.currentValuePaise || acc.balancePaise || 0
                  : acc.balancePaise || 0;

                return (
                  <tr key={acc.id || i} className="hover:bg-muted/20">
                    <td className="p-3 font-medium text-foreground">{acc.name}</td>
                    <td className="p-3">
                      <div className="flex items-center gap-1.5">
                        <Badge variant="outline" className="text-[10px] uppercase font-mono">
                          {acc.kind.replace('_', ' ')}
                        </Badge>
                        <span className="text-[10px] text-muted-foreground capitalize">
                          ({isLiability ? 'Liability' : 'Asset'})
                        </span>
                      </div>
                    </td>
                    <td className="p-3 text-muted-foreground">
                      {acc.institution || '—'}
                    </td>
                    <td className="p-3 text-right font-mono font-bold">
                      {isLiability ? (
                        <span className="text-destructive">
                          - {formatINR(displayPaise)}
                        </span>
                      ) : (
                        <span className="text-foreground">
                          {formatINR(displayPaise)}
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* Confirmation & Finish Buttons */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={onBack}
          disabled={isSubmitting}
        >
          Back
        </Button>

        <Button
          type="button"
          size="sm"
          className="text-xs font-semibold min-w-[140px] gap-1.5"
          onClick={onFinish}
          disabled={isSubmitting || accounts.length === 0}
        >
          {isSubmitting ? (
            <>
              <Loader2Icon className="size-3.5 animate-spin" />
              <span>Saving Everything...</span>
            </>
          ) : (
            <>
              <span>Finish Setup</span>
              <ArrowRightIcon className="size-3.5" />
            </>
          )}
        </Button>
      </div>
    </div>
  );
}
