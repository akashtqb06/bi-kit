'use client';

import * as React from 'react';
import { useState } from 'react';
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
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';

interface EpfRateDialogProps {
  accountId: string;
  currentFy: string;
  initialRate: number | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function EpfRateDialog({
  accountId,
  currentFy,
  initialRate,
  open,
  onOpenChange,
  onSuccess,
}: EpfRateDialogProps) {
  const [fy, setFy] = useState(currentFy);
  const [rateStr, setRateStr] = useState(initialRate ? String(initialRate) : '8.25');
  const [isSaving, setIsSaving] = useState(false);

  const [prevOpen, setPrevOpen] = useState(open);
  if (prevOpen !== open) {
    setPrevOpen(open);
    if (open) {
      setFy(currentFy);
      if (initialRate) setRateStr(String(initialRate));
    }
  }

  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    const rate = parseFloat(rateStr);
    if (isNaN(rate) || rate <= 0 || rate > 20) {
      toast.error('Please enter a valid interest rate between 0 and 20%');
      return;
    }

    try {
      setIsSaving(true);
      const res = await fetch(`/api/finance/accounts/${accountId}/pf/rate`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fy, rate }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to update rate');
      }

      toast.success(`Interest rate updated to ${rate}% for FY ${fy}`);
      onSuccess();
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Update failed');
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <form onSubmit={handleSave}>
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Set EPF Interest Rate</DialogTitle>
            <DialogDescription className="text-xs text-muted-foreground mt-0.5">
              The EPFO announces annual rates after FY end. Set this year&apos;s rate to calculate accrued monthly interest estimates.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4 text-xs">
            <div className="space-y-1.5">
              <Label htmlFor="epf-fy" className="text-xs">Financial Year</Label>
              <Input
                id="epf-fy"
                className="h-8 text-xs font-mono"
                value={fy}
                onChange={(e) => setFy(e.target.value)}
                placeholder="2026-27"
                required
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="epf-rate" className="text-xs">Annual Interest Rate (%)</Label>
              <Input
                id="epf-rate"
                type="number"
                step="0.01"
                min="0"
                max="20"
                className="h-8 text-xs font-mono"
                value={rateStr}
                onChange={(e) => setRateStr(e.target.value)}
                placeholder="8.25"
                required
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button type="submit" size="sm" disabled={isSaving}>
              {isSaving ? 'Saving...' : 'Save Rate'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
