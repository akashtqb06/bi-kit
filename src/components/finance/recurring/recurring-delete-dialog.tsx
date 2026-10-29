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
import { formatINR } from '@src/components/finance/shared/format';
import type { RecurringRuleDTO } from '@src/lib/finance/contract';
import { deleteRecurringRuleAction } from '@src/app/(app)/finance/recurring/actions';

interface RecurringDeleteDialogProps {
  rule: RecurringRuleDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: () => void;
}

export function RecurringDeleteDialog({
  rule,
  open,
  onOpenChange,
  onSuccess,
}: RecurringDeleteDialogProps) {
  const [isDeleting, setIsDeleting] = useState(false);

  if (!rule) return null;

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await deleteRecurringRuleAction(rule.id);
      toast.success('Recurring rule deleted successfully');
      onOpenChange(false);
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete rule');
    } finally {
      setIsDeleting(false);
    }
  };

  const titleName = rule.payee || (rule.note ? rule.note.replace(/\[DOM:\d+\]/, '').trim() : '') || 'Recurring Rule';

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[420px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold text-destructive">
            Delete Recurring Rule
          </DialogTitle>
          <DialogDescription className="text-xs text-muted-foreground mt-1">
            Are you sure you want to delete this recurring rule? Already generated past transactions will remain in your ledger.
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-lg border bg-muted/40 p-3 my-2 space-y-1.5 text-xs">
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Rule:</span>
            <span className="font-semibold text-foreground">{titleName}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Amount:</span>
            <span className="font-semibold text-foreground">{formatINR(rule.amount)}</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Frequency:</span>
            <span className="capitalize">{rule.frequency} (every {rule.interval} {rule.frequency === 'daily' ? 'day' : rule.frequency === 'weekly' ? 'week' : rule.frequency === 'yearly' ? 'year' : 'month'}{rule.interval > 1 ? 's' : ''})</span>
          </div>
          <div className="flex justify-between font-medium">
            <span className="text-muted-foreground">Next Occurrence:</span>
            <span>{rule.nextOccurrence}</span>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0 mt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => onOpenChange(false)}
            disabled={isDeleting}
          >
            Cancel
          </Button>
          <Button
            type="button"
            variant="destructive"
            size="sm"
            onClick={handleDelete}
            disabled={isDeleting}
          >
            {isDeleting ? 'Deleting...' : 'Delete Rule'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
