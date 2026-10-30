'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { useFinanceStore } from '../shared/finance-store';
import { rupeesToPaise } from '../shared/format';
import type { AccountWithBalance } from '../shared/fixtures';

export function UpdateValuationDialog({
  account,
  open,
  onOpenChange,
}: {
  account: AccountWithBalance | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { addValuation } = useFinanceStore();

  const [valueRupees, setValueRupees] = useState('');
  const [costBasisRupees, setCostBasisRupees] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  React.useEffect(() => {
    if (account) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setValueRupees(((account.currentValue || account.balance) / 100).toString());
      setCostBasisRupees(((account.costBasis || account.balance) / 100).toString());
      setDate(new Date().toISOString().split('T')[0]);
      setNote('');
      setError(null);
    }
  }, [account]);

  if (!account) return null;

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const val = parseFloat(valueRupees);
    if (isNaN(val) || val < 0) {
      setError('Please enter a valid positive valuation');
      return;
    }

    try {
      setIsSubmitting(true);
      const valPaise = rupeesToPaise(val);
      const costBasisPaise = costBasisRupees ? rupeesToPaise(parseFloat(costBasisRupees)) : undefined;

      await addValuation({
        accountId: account.id,
        date,
        value: valPaise,
        costBasis: costBasisPaise,
        note: note.trim() || undefined,
      });

      toast.success('Valuation updated successfully');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record valuation');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Update Valuation</DialogTitle>
          <DialogDescription className="text-xs">
            Record latest market value for {account.name}.
          </DialogDescription>
        </DialogHeader>

        <form onSubmit={handleSave} className="space-y-3.5 py-2">
          <div className="space-y-1">
            <Label htmlFor="val-value" className="text-xs font-medium text-muted-foreground">
              Current Market Value (₹)
            </Label>
            <Input
              id="val-value"
              type="number"
              step="0.01"
              required
              className="h-9 text-base font-bold"
              value={valueRupees}
              onChange={(e) => setValueRupees(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="val-cost-basis" className="text-xs font-medium text-muted-foreground">
              Total Invested / Cost Basis (₹)
            </Label>
            <Input
              id="val-cost-basis"
              type="number"
              step="0.01"
              className="h-9 text-xs"
              value={costBasisRupees}
              onChange={(e) => setCostBasisRupees(e.target.value)}
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="val-date" className="text-xs font-medium text-muted-foreground">
              Valuation Date
            </Label>
            <DatePicker
              id="val-date"
              required
              className="h-9 text-xs"
              value={date}
              onChange={setDate}
              placeholder="Select valuation date"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="val-note" className="text-xs font-medium text-muted-foreground">
              Note (optional)
            </Label>
            <Input
              id="val-note"
              type="text"
              placeholder="e.g. End of month NAV update"
              className="h-9 text-xs"
              value={note}
              onChange={(e) => setNote(e.target.value)}
            />
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}

          <DialogFooter className="pt-2">
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => onOpenChange(false)}
              className="text-xs"
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={isSubmitting}
              className="text-xs font-semibold"
            >
              {isSubmitting ? 'Updating...' : 'Save Valuation'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
