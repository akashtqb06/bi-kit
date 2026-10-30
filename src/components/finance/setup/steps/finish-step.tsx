'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  CheckCircle2Icon,
  PlusIcon,
  UploadCloudIcon,
  CalendarSyncIcon,
  LayoutDashboardIcon,
  ArrowRightIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFinanceStore } from '../../shared/finance-store';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

interface FinishStepProps {
  accountsCreatedCount: number;
}

export function FinishStep({ accountsCreatedCount }: FinishStepProps) {
  const router = useRouter();
  const openQuickAdd = useFinanceStore((s) => s.openQuickAdd);

  const showImport = isFinanceFeatureEnabled('import');
  const showRecurring = isFinanceFeatureEnabled('recurring');

  const handleOpenTransaction = () => {
    // Open Quick Add and navigate to overview/transactions
    openQuickAdd();
    router.push('/finance/transactions');
  };

  return (
    <div className="space-y-6 text-center sm:text-left">
      <div className="space-y-2">
        <div className="size-12 rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mx-auto sm:mx-0 flex items-center justify-center">
          <CheckCircle2Icon className="size-6" />
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Setup Complete!
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed max-w-lg">
          Your {accountsCreatedCount} accounts, opening balances, categories, and initial valuations are now saved in your personal ledger. You are ready to start tracking.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5 pt-2">
        {/* Next Step 1: Add first transaction */}
        <div
          role="button"
          tabIndex={0}
          onClick={handleOpenTransaction}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              handleOpenTransaction();
            }
          }}
          className="p-4 rounded-xl border bg-card/60 hover:bg-muted/40 transition-colors text-left flex flex-col justify-between space-y-3 cursor-pointer group"
        >
          <div className="space-y-1.5">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <PlusIcon className="size-4" />
            </div>
            <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
              <span>Add your first transaction</span>
              <ArrowRightIcon className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Record a recent expense, salary deposit, or account transfer using Quick Add.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-primary">Open Quick Add →</span>
        </div>

        {/* Next Step 2: Import a statement (only if import feature is enabled) */}
        {showImport && (
          <Link
            href="/finance/import"
            className="p-4 rounded-xl border bg-card/60 hover:bg-muted/40 transition-colors text-left flex flex-col justify-between space-y-3 group"
          >
            <div className="space-y-1.5">
              <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
                <UploadCloudIcon className="size-4" />
              </div>
              <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                <span>Import a bank statement</span>
                <ArrowRightIcon className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Upload bank CSVs or PDF statements with automatic deduplication.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-primary">Statement Importer →</span>
          </Link>
        )}

        {/* Next Step 3: Set up recurring items (only if recurring feature is enabled) */}
        {showRecurring && (
          <Link
            href="/finance/recurring"
            className="p-4 rounded-xl border bg-card/60 hover:bg-muted/40 transition-colors text-left flex flex-col justify-between space-y-3 group"
          >
            <div className="space-y-1.5">
              <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
                <CalendarSyncIcon className="size-4" />
              </div>
              <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
                <span>Set up recurring items</span>
                <ArrowRightIcon className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
              </h3>
              <p className="text-[11px] text-muted-foreground">
                Automate rent, EMIs, salary, and utility bills on a schedule.
              </p>
            </div>
            <span className="text-[11px] font-semibold text-primary">Recurring Rules →</span>
          </Link>
        )}

        {/* Next Step 4: Open dashboards */}
        <Link
          href="/finance/overview"
          className="p-4 rounded-xl border bg-card/60 hover:bg-muted/40 transition-colors text-left flex flex-col justify-between space-y-3 group"
        >
          <div className="space-y-1.5">
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <LayoutDashboardIcon className="size-4" />
            </div>
            <h3 className="text-xs font-bold text-foreground group-hover:text-primary transition-colors flex items-center justify-between">
              <span>Open dashboards</span>
              <ArrowRightIcon className="size-3 opacity-0 group-hover:opacity-100 transition-opacity" />
            </h3>
            <p className="text-[11px] text-muted-foreground">
              Explore your net worth timeline, asset allocation, and cash flow reports.
            </p>
          </div>
          <span className="text-[11px] font-semibold text-primary">Go to Overview →</span>
        </Link>
      </div>

      <div className="pt-4 border-t flex justify-center sm:justify-end">
        <Button
          size="sm"
          className="font-semibold text-xs px-6"
          render={<Link href="/finance/overview" />}
          nativeButton={false}
        >
          <span>Go to Finance Overview</span>
          <ArrowRightIcon className="size-3.5 ml-1.5" />
        </Button>
      </div>
    </div>
  );
}
