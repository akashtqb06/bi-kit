'use client';

import React from 'react';
import Link from 'next/link';
import {
  Dialog,
  DialogContent,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { CheckCircle2Icon, ArrowRightIcon, RefreshCwIcon, AlertCircleIcon } from 'lucide-react';
import type { CommitImportResult } from '@src/lib/finance/import/types';

interface ImportSummaryContentProps {
  result: CommitImportResult;
  accountName: string;
  onReset?: () => void;
}

export function ImportSummaryContent({
  result,
  accountName,
  onReset,
}: ImportSummaryContentProps) {
  return (
    <div className="space-y-4 py-1" data-testid="import-summary-content">
      <div className="text-center sm:text-left">
        <div className="mx-auto sm:mx-0 flex h-12 w-12 items-center justify-center rounded-full bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 mb-2">
          <CheckCircle2Icon className="h-6 w-6" />
        </div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">Statement Import Complete</h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Transactions were committed atomically in 1 transaction to{' '}
          <span className="font-medium text-foreground">{accountName}</span>.
        </p>
      </div>

      <div className="space-y-3 py-2">
        <div className="grid grid-cols-3 gap-2">
          <div className="rounded-lg border p-3 bg-muted/30 text-center">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Imported</span>
            <p className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              {result.importedCount}
            </p>
          </div>

          <div className="rounded-lg border p-3 bg-muted/30 text-center">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Skipped Dups</span>
            <p className="text-xl font-bold text-amber-600 dark:text-amber-400 mt-0.5">
              {result.duplicatesSkippedCount}
            </p>
          </div>

          <div className="rounded-lg border p-3 bg-muted/30 text-center">
            <span className="text-[11px] text-muted-foreground uppercase font-medium">Errors</span>
            <p className="text-xl font-bold text-muted-foreground mt-0.5">
              {result.errorCount}
            </p>
          </div>
        </div>

        {result.error && (
          <div className="rounded-md bg-rose-500/10 border border-rose-500/20 p-2.5 text-xs text-rose-600 dark:text-rose-400 flex items-center gap-2">
            <AlertCircleIcon className="h-4 w-4 shrink-0" />
            <span>{result.error}</span>
          </div>
        )}
      </div>

      <div className="flex flex-col-reverse sm:flex-row gap-2 sm:justify-between pt-2 border-t">
        {onReset && (
          <Button variant="outline" size="sm" onClick={onReset} className="text-xs">
            <RefreshCwIcon className="h-3.5 w-3.5 mr-1.5" />
            Import Another Statement
          </Button>
        )}

        <Link href="/finance/transactions" className="w-full sm:w-auto">
          <Button size="sm" className="text-xs bg-primary text-primary-foreground w-full sm:w-auto">
            View Transactions
            <ArrowRightIcon className="h-3.5 w-3.5 ml-1.5" />
          </Button>
        </Link>
      </div>
    </div>
  );
}

interface ImportSummaryDialogProps {
  open: boolean;
  result: CommitImportResult | null;
  accountName: string;
  onClose: () => void;
  onReset: () => void;
}

export function ImportSummaryDialog({
  open,
  result,
  accountName,
  onClose,
  onReset,
}: ImportSummaryDialogProps) {
  if (!result) return null;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose()}>
      <DialogContent className="sm:max-w-md">
        <ImportSummaryContent
          result={result}
          accountName={accountName}
          onReset={onReset}
        />
      </DialogContent>
    </Dialog>
  );
}
