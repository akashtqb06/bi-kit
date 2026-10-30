'use client';

import React, { useEffect, useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
import { getMonthDateRange } from '@src/lib/finance/budgets/progress';
import type { BudgetDTO } from '@src/lib/finance/contract';
import type { BudgetPeriod } from '@src/lib/finance/constants';

interface BudgetFormProps {
  budget?: BudgetDTO | null;
  activeMonth?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
}

export function BudgetForm({
  budget,
  activeMonth,
  onSuccess,
  onCancel,
}: BudgetFormProps) {
  const { categories, addBudget, updateBudget, budgets } = useFinanceStore();

  const isEditing = Boolean(budget);

  // Filter to expense categories
  const expenseCategories = categories.filter((c) => c.type === 'expense');

  // Form states
  const [categoryId, setCategoryId] = useState('');
  const [amountStr, setAmountStr] = useState('');
  const [period, setPeriod] = useState<BudgetPeriod>('monthly');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Initialize or reset form on open / change
  useEffect(() => {
    if (budget) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setCategoryId(budget.categoryId);
      setAmountStr((budget.amount / 100).toString());
      setPeriod(budget.period);
      setStartDate(budget.startDate);
      setEndDate(budget.endDate || '');
      setError(null);
    } else {
      // Create mode: default dates for activeMonth
      const month = activeMonth || new Date().toISOString().slice(0, 7);
      const { startDate: defStart } = getMonthDateRange(month);

      // Find first expense category not already budgeted in this month
      const existingCategoryIds = new Set(
        budgets
          .filter((b) => b.startDate.slice(0, 7) === month)
          .map((b) => b.categoryId)
      );
      const availableCat =
        expenseCategories.find((c) => !existingCategoryIds.has(c.id)) ||
        expenseCategories[0];

      setCategoryId(availableCat?.id || '');
      setAmountStr('');
      setPeriod('monthly');
      setStartDate(defStart);
      setEndDate('');
      setError(null);
    }
  }, [budget, activeMonth, budgets, expenseCategories]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!categoryId) {
      setError('Please select an expense category.');
      return;
    }

    const parsedAmount = parseFloat(amountStr);
    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      setError('Please enter a valid positive budget amount.');
      return;
    }

    if (!startDate) {
      setError('Please provide a start date.');
      return;
    }

    if (endDate && endDate < startDate) {
      setError('End date cannot be earlier than start date.');
      return;
    }

    const amountPaise = Math.round(parsedAmount * 100);
    setIsSubmitting(true);

    try {
      if (isEditing && budget) {
        await updateBudget(budget.id, {
          amount: amountPaise,
          period,
          startDate,
          endDate: endDate || null,
        });
        toast.success('Budget updated successfully');
      } else {
        await addBudget({
          categoryId,
          amount: amountPaise,
          period,
          startDate,
          endDate: endDate || null,
        });
        toast.success('Budget created successfully');
      }
      onSuccess?.();
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Failed to save budget';
      setError(msg);
      toast.error(msg);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {error && (
        <div className="p-2.5 rounded-md bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20">
          {error}
        </div>
      )}

      {/* Category Selector */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-category" className="text-xs font-medium">
          Category
        </Label>
        <Select
          value={categoryId || undefined}
          onValueChange={(val) => setCategoryId(val || '')}
          disabled={isEditing || expenseCategories.length === 0}
        >
          <SelectTrigger id="budget-category" className="w-full h-9 bg-card px-3 text-xs">
            <SelectValue placeholder={expenseCategories.length === 0 ? "No expense categories found" : "Select category..."} />
          </SelectTrigger>
          <SelectContent>
            {expenseCategories.map((cat) => (
              <SelectItem key={cat.id} value={cat.id} className="text-xs">
                {cat.name}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEditing && (
          <p className="text-[11px] text-muted-foreground">
            Category cannot be modified on an existing budget.
          </p>
        )}
      </div>

      {/* Budget Amount */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-amount" className="text-xs font-medium">
          Budget Amount (₹)
        </Label>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">
            ₹
          </span>
          <Input
            id="budget-amount"
            type="number"
            step="any"
            min="1"
            placeholder="e.g. 15000"
            className="pl-7 h-9 text-xs bg-card"
            value={amountStr}
            onChange={(e) => setAmountStr(e.target.value)}
            required
            autoFocus={!isEditing}
          />
        </div>
      </div>

      {/* Period */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-period" className="text-xs font-medium">
          Period
        </Label>
        <Select
          value={period}
          onValueChange={(val) => setPeriod(val as BudgetPeriod)}
        >
          <SelectTrigger id="budget-period" className="w-full h-9 bg-card px-3 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
            <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
            <SelectItem value="yearly" className="text-xs">Yearly</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* Dates */}
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="budget-start-date" className="text-xs font-medium">
            Start Date
          </Label>
          <DatePicker
            id="budget-start-date"
            className="h-9 text-xs bg-card"
            value={startDate}
            onChange={setStartDate}
            required
            placeholder="Select start date"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="budget-end-date" className="text-xs font-medium">
            End Date (Optional)
          </Label>
          <DatePicker
            id="budget-end-date"
            className="h-9 text-xs bg-card"
            value={endDate}
            onChange={setEndDate}
            placeholder="Select end date"
            clearable
          />
        </div>
      </div>

      <DialogFooter className="pt-2 gap-2 sm:gap-0">
        {onCancel && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onCancel}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
        )}
        <Button type="submit" size="sm" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : isEditing ? 'Save Changes' : 'Create Budget'}
        </Button>
      </DialogFooter>
    </form>
  );
}

interface BudgetDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  budget?: BudgetDTO | null;
  activeMonth?: string;
}

export function BudgetDialog({
  open,
  onOpenChange,
  budget,
  activeMonth,
}: BudgetDialogProps) {
  const isEditing = Boolean(budget);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isEditing ? 'Edit Budget' : 'Set Category Budget'}
          </DialogTitle>
        </DialogHeader>
        <BudgetForm
          budget={budget}
          activeMonth={activeMonth}
          onSuccess={() => onOpenChange(false)}
          onCancel={() => onOpenChange(false)}
        />
      </DialogContent>
    </Dialog>
  );
}
