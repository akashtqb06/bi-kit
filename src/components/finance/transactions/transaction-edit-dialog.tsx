'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFinanceStore } from '../shared/finance-store';
import { parseAmountExpression } from '../shared/expression-parser';
import { formatAccountDisplayBalance } from '../shared/format';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import type { TransactionDTO } from '@src/lib/finance/contract';

export function TransactionEditDialog({
  transaction,
  open,
  onOpenChange,
}: {
  transaction: TransactionDTO | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const { accounts, categories, updateTransaction } = useFinanceStore();

  const [amountStr, setAmountStr] = useState('');
  const [date, setDate] = useState('');
  const [accountId, setAccountId] = useState('');
  const [categoryId, setCategoryId] = useState('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (transaction) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setAmountStr((transaction.amount / 100).toString());
      setDate(transaction.date);
      setAccountId(transaction.accountId);
      setCategoryId(transaction.categoryId || '');
      setPayee(transaction.payee || '');
      setNote(transaction.note || '');
      setError(null);
    }
  }, [transaction]);

  if (!transaction) return null;

  const handleSave = async () => {
    const parsed = parseAmountExpression(amountStr);
    if (!parsed.isValid || !parsed.paise || parsed.paise <= 0) {
      setError('Please enter a valid positive amount');
      return;
    }
    if (!accountId) {
      setError('Account is required');
      return;
    }

    try {
      setIsSubmitting(true);
      await updateTransaction(transaction.id, {
        amount: parsed.paise,
        date,
        accountId,
        categoryId: transaction.type !== 'transfer' ? (categoryId || null) : null,
        payee: payee.trim() || null,
        note: note.trim() || null,
      });
      toast.success('Transaction updated');
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to update transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(
    (c) => c.type === (transaction.type === 'income' ? 'income' : 'expense')
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Edit Transaction</DialogTitle>
        </DialogHeader>

        <div className="space-y-3.5 py-2">
          {/* Amount */}
          <div className="space-y-1">
            <Label htmlFor="edit-amount" className="text-xs font-medium text-muted-foreground">
              Amount (₹)
            </Label>
            <Input
              id="edit-amount"
              type="text"
              value={amountStr}
              onChange={(e) => setAmountStr(e.target.value)}
              className="h-9 text-base font-bold"
            />
          </div>

          {/* Date */}
          <div className="space-y-1">
            <Label htmlFor="edit-date" className="text-xs font-medium text-muted-foreground">
              Date
            </Label>
            <DatePicker
              id="edit-date"
              value={date}
              onChange={setDate}
              className="h-9 text-xs"
              placeholder="Select date"
            />
          </div>

          {/* Account */}
          <div className="space-y-1">
            <Label htmlFor="edit-account" className="text-xs font-medium text-muted-foreground">
              Account
            </Label>
            <Select
              value={accountId}
              onValueChange={(val) => setAccountId(val || '')}
            >
              <SelectTrigger id="edit-account" className="w-full h-9 bg-card px-3 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id} className="text-xs">
                    {acc.name} ({formatAccountDisplayBalance(acc)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Category */}
          {transaction.type !== 'transfer' && (
            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <Label htmlFor="edit-category" className="text-xs font-medium text-muted-foreground">
                  Category
                </Label>
                {categoryId && (
                  (() => {
                    const sel = categories.find((c) => c.id === categoryId);
                    if (!sel) return null;
                    const col = sel.color || getDeterministicCategoryColor(sel.name);
                    return (
                      <span className="flex items-center gap-1.5 text-xs text-foreground">
                        <span
                          className="size-2 rounded-full inline-block shrink-0 ring-1 ring-border shadow-xs"
                          style={{ backgroundColor: col }}
                        />
                        <span className="truncate max-w-[120px] font-medium">{sel.name}</span>
                      </span>
                    );
                  })()
                )}
              </div>
              <Select
                value={categoryId || '__uncategorized__'}
                onValueChange={(val) => setCategoryId((!val || val === '__uncategorized__') ? '' : val)}
              >
                <SelectTrigger id="edit-category" className="w-full h-9 bg-card px-3 text-xs">
                  <SelectValue placeholder="Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__uncategorized__" className="text-xs">Uncategorized</SelectItem>
                  {filteredCategories.map((c) => (
                    <SelectItem key={c.id} value={c.id} className="text-xs">
                      {c.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Payee */}
          <div className="space-y-1">
            <Label htmlFor="edit-payee" className="text-xs font-medium text-muted-foreground">
              Payee
            </Label>
            <Input
              id="edit-payee"
              type="text"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {/* Note */}
          <div className="space-y-1">
            <Label htmlFor="edit-note" className="text-xs font-medium text-muted-foreground">
              Note
            </Label>
            <Input
              id="edit-note"
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              className="h-9 text-xs"
            />
          </div>

          {error && <p className="text-xs font-medium text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-xs"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            className="text-xs font-semibold"
            disabled={isSubmitting}
            onClick={handleSave}
          >
            {isSubmitting ? 'Saving...' : 'Save Changes'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
