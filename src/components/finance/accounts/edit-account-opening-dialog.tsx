'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertTriangleIcon, InfoIcon, Loader2Icon } from 'lucide-react';
import { toast } from 'sonner';
import { parseMoneyToPaise } from '@src/lib/finance/import/number-parser';
import { useFinanceStore } from '../shared/finance-store';

interface EditAccountOpeningDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  account: {
    id: string;
    name: string;
    kind: string;
    metadata?: Record<string, unknown>;
  };
}

export function EditAccountOpeningDialog({
  open,
  onOpenChange,
  account,
}: EditAccountOpeningDialogProps) {
  const refreshAccounts = useFinanceStore((s) => s.refreshAccounts);
  const refreshOverviewStats = useFinanceStore((s) => s.refreshOverviewStats);

  const initialOpeningPaise =
    typeof account.metadata?.openingBalancePaise === 'number'
      ? account.metadata.openingBalancePaise
      : 0;

  const initialOpeningDate =
    typeof account.metadata?.openingDate === 'string'
      ? account.metadata.openingDate
      : new Date().toISOString().slice(0, 10);

  const isLiability = account.kind === 'credit_card' || account.kind === 'loan';

  const [amountRupees, setAmountRupees] = useState<string>(
    (Math.abs(initialOpeningPaise) / 100).toString()
  );
  const [openingDate, setOpeningDate] = useState<string>(initialOpeningDate);
  const [showConfirm, setShowConfirm] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleInitialSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setShowConfirm(true);
  };

  const handleConfirmedSave = async () => {
    setIsSubmitting(true);
    try {
      const parsed = parseMoneyToPaise(amountRupees);
      const absPaise = parsed ? parsed.paise : 0;
      const signedPaise = isLiability ? -absPaise : absPaise;

      const res = await fetch(`/api/finance/accounts/${account.id}/opening`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          openingBalancePaise: signedPaise,
          openingDate,
        }),
      });

      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || 'Failed to update opening data');
      }

      toast.success('Starting balance and date updated successfully.');
      await Promise.all([refreshAccounts(), refreshOverviewStats()]);
      setShowConfirm(false);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error updating starting balance');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            Edit Opening Balance & Date
          </DialogTitle>
        </DialogHeader>

        {!showConfirm ? (
          <form onSubmit={handleInitialSubmit} className="space-y-4 pt-2">
            <div className="space-y-1">
              <span className="text-xs font-semibold text-foreground">{account.name}</span>
              <p className="text-[11px] text-muted-foreground">
                Account kind: <span className="capitalize">{account.kind.replace('_', ' ')}</span>
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-opening-amount" className="text-xs font-semibold">
                {isLiability ? 'Opening Debt Amount Owed (₹)' : 'Opening Balance (₹)'}
              </Label>
              <Input
                id="edit-opening-amount"
                value={amountRupees}
                onChange={(e) => setAmountRupees(e.target.value)}
                placeholder="0.00"
                className="text-xs"
                required
              />
              <p className="text-[11px] text-muted-foreground">
                {isLiability
                  ? 'Entered as positive; saved as a negative ledger balance.'
                  : 'Starting ledger balance for this account.'}
              </p>
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="edit-opening-date" className="text-xs font-semibold">
                Opening Date (YYYY-MM-DD)
              </Label>
              <Input
                id="edit-opening-date"
                type="date"
                value={openingDate}
                onChange={(e) => setOpeningDate(e.target.value)}
                className="text-xs"
                required
              />
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border flex items-start gap-2.5">
              <InfoIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />
              <p className="text-[11px] text-muted-foreground leading-relaxed">
                Opening data represents the ledger anchor point before any incoming or outgoing transactions occurred.
              </p>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => onOpenChange(false)}
              >
                Cancel
              </Button>
              <Button type="submit" size="sm" className="text-xs font-semibold">
                Review & Confirm Change
              </Button>
            </DialogFooter>
          </form>
        ) : (
          <div className="space-y-4 pt-2">
            <div className="p-3.5 rounded-xl border border-amber-500/30 bg-amber-500/10 space-y-2">
              <div className="flex items-center gap-2 text-xs font-semibold text-amber-700 dark:text-amber-400">
                <AlertTriangleIcon className="size-4 shrink-0" />
                <span>Historical Balance Impact Warning</span>
              </div>
              <p className="text-xs text-amber-900/90 dark:text-amber-200/90 leading-relaxed">
                Modifying the opening balance or date will recalculate ledger deltas and adjust historical net worth totals backwards from {openingDate}. Existing transactions after this date will remain unchanged.
              </p>
            </div>

            <div className="rounded-lg bg-muted/40 p-3 text-xs space-y-1.5">
              <div className="flex justify-between">
                <span className="text-muted-foreground">New Starting Balance:</span>
                <span className="font-mono font-bold text-foreground">
                  {isLiability ? `- ₹${amountRupees}` : `₹${amountRupees}`}
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Effective Date:</span>
                <span className="font-mono font-medium text-foreground">{openingDate}</span>
              </div>
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                className="text-xs"
                onClick={() => setShowConfirm(false)}
                disabled={isSubmitting}
              >
                Back
              </Button>
              <Button
                type="button"
                size="sm"
                variant="destructive"
                className="text-xs font-semibold gap-1.5"
                onClick={handleConfirmedSave}
                disabled={isSubmitting}
              >
                {isSubmitting ? (
                  <>
                    <Loader2Icon className="size-3 animate-spin" />
                    <span>Applying...</span>
                  </>
                ) : (
                  <span>Confirm & Recalculate</span>
                )}
              </Button>
            </DialogFooter>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
