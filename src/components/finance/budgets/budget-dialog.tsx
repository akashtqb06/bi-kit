'use client';

import React, { useMemo, useState } from 'react';
import { toast } from 'sonner';
import { SearchIcon, CopyIcon } from 'lucide-react';
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
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useFinanceStore } from '../shared/finance-store';
import {
  getMonthDateRange,
  formatMonthLabel,
  getCurrentMonthString,
} from '@src/lib/finance/budgets/progress';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import { formatINR } from '../shared/format';
import type { BudgetDTO } from '@src/lib/finance/contract';
import type { BudgetPeriod } from '@src/lib/finance/constants';
import { cn } from '@/lib/utils';

export function parseINRAmount(val: string): number {
  if (!val) return NaN;
  const clean = val.replace(/₹/g, '').replace(/,/g, '').trim();
  return parseFloat(clean);
}

interface BudgetFormProps {
  budget?: BudgetDTO | null;
  activeMonth?: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  onCopyLastMonth?: () => void;
  copyCandidatesCount?: number;
  containerRef?: React.RefObject<HTMLDivElement | null>;
}

export function BudgetForm({
  budget,
  activeMonth,
  onSuccess,
  onCancel,
  onCopyLastMonth,
  copyCandidatesCount = 0,
  containerRef,
}: BudgetFormProps) {
  const { categories, addBudget, updateBudget, budgets } = useFinanceStore();

  const isEditing = Boolean(budget);

  // Filter to expense categories
  const expenseCategories = useMemo(
    () => categories.filter((c) => c.type === 'expense'),
    [categories]
  );

  // Month options: past 6 months to next 12 months
  const monthOptions = useMemo(() => {
    const list: { value: string; label: string }[] = [];
    const base = new Date();
    for (let i = -6; i <= 12; i++) {
      const d = new Date(base.getFullYear(), base.getMonth() + i, 1);
      const mStr = d.toISOString().slice(0, 7);
      list.push({
        value: mStr,
        label: formatMonthLabel(mStr),
      });
    }
    return list;
  }, []);

  const monthItems = useMemo(
    () =>
      monthOptions.map((m) => ({
        value: m.value,
        label: m.label,
      })),
    [monthOptions]
  );

  // Initial values derived once at mount
  const initialMonth = useMemo(() => {
    if (budget) return budget.startDate.slice(0, 7);
    return activeMonth || getCurrentMonthString();
  }, [budget, activeMonth]);

  const [selectedMonth, setSelectedMonth] = useState<string>(initialMonth);

  const [categoryId, setCategoryId] = useState<string>(() => {
    if (budget) return budget.categoryId;
    const existingCategoryIds = new Set(
      budgets
        .filter((b) => b.startDate.slice(0, 7) === initialMonth)
        .map((b) => b.categoryId)
    );
    const availableCat =
      expenseCategories.find((c) => !existingCategoryIds.has(c.id)) ||
      expenseCategories[0];
    return availableCat?.id || '';
  });

  const [categorySearch, setCategorySearch] = useState('');

  const [amountStr, setAmountStr] = useState<string>(() => {
    if (budget) {
      const amtInr = budget.amount / 100;
      return amtInr.toLocaleString('en-IN');
    }
    return '';
  });

  const [period, setPeriod] = useState<BudgetPeriod>(() => {
    return budget ? budget.period : 'monthly';
  });

  const [startDate, setStartDate] = useState<string>(() => {
    if (budget) return budget.startDate;
    const { startDate: defStart } = getMonthDateRange(initialMonth);
    return defStart;
  });

  const [endDate, setEndDate] = useState<string>(() => {
    if (budget) return budget.endDate || '';
    return '';
  });

  const [rollover, setRollover] = useState<boolean>(false);
  const [totalBudgetStr, setTotalBudgetStr] = useState<string>('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<{
    amount?: string;
    category?: string;
    month?: string;
    dates?: string;
  }>({});

  // Category select items
  const categoryItems = useMemo(() => {
    return expenseCategories.map((cat) => ({
      value: cat.id,
      label: (
        <span className="flex items-center gap-2">
          <span
            className="size-2 rounded-full shrink-0"
            style={{
              backgroundColor:
                cat.color || getDeterministicCategoryColor(cat.name),
            }}
          />
          <span className="truncate">{cat.name}</span>
        </span>
      ),
    }));
  }, [expenseCategories]);

  // Filtered categories for search inside dropdown
  const filteredCategories = useMemo(() => {
    if (!categorySearch.trim()) return expenseCategories;
    const q = categorySearch.toLowerCase();
    return expenseCategories.filter((c) => c.name.toLowerCase().includes(q));
  }, [expenseCategories, categorySearch]);

  // Period select items
  const periodItems = useMemo(
    () => [
      { value: 'monthly', label: 'Monthly' },
      { value: 'quarterly', label: 'Quarterly' },
      { value: 'yearly', label: 'Yearly' },
    ],
    []
  );

  // Month change handler
  const handleMonthChange = (newMonth: string) => {
    setSelectedMonth(newMonth);
    const { startDate: newStart } = getMonthDateRange(newMonth);
    setStartDate(newStart);
    if (period === 'monthly') {
      setEndDate('');
    }
  };

  const parsedAmount = parseINRAmount(amountStr);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    const newFieldErrors: typeof fieldErrors = {};

    if (!categoryId) {
      newFieldErrors.category = 'Please select an expense category.';
    }

    if (isNaN(parsedAmount) || parsedAmount <= 0) {
      newFieldErrors.amount = 'Please enter a valid positive budget amount.';
    }

    if (!startDate) {
      newFieldErrors.dates = 'Please provide a start date.';
    } else if (endDate && endDate < startDate) {
      newFieldErrors.dates = 'End date cannot be earlier than start date.';
    }

    if (Object.keys(newFieldErrors).length > 0) {
      setFieldErrors(newFieldErrors);
      return;
    }

    setFieldErrors({});
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
    <form onSubmit={handleSubmit} className="space-y-4 py-1">
      {error && (
        <div
          role="alert"
          className="p-2.5 rounded-md bg-destructive/10 text-destructive text-xs font-medium border border-destructive/20"
        >
          {error}
        </div>
      )}

      {/* Month Selector */}
      <div className="space-y-1.5">
        <Label htmlFor="budget-month" className="text-xs font-medium">
          Budget Month
        </Label>
        <Select
          items={monthItems}
          value={selectedMonth}
          onValueChange={(val) => {
            if (val) handleMonthChange(val);
          }}
          disabled={isEditing}
        >
          <SelectTrigger id="budget-month" className="w-full h-9 bg-card px-3 text-xs">
            <SelectValue placeholder="Select month..." />
          </SelectTrigger>
          <SelectContent container={containerRef}>
            {monthOptions.map((m) => (
              <SelectItem key={m.value} value={m.value} className="text-xs">
                {m.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {isEditing && (
          <p className="text-[11px] text-muted-foreground">
            Budget month is locked during edit.
          </p>
        )}
      </div>

      {/* Category Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="budget-category" className="text-xs font-medium">
            Category
          </Label>
          {!isEditing && copyCandidatesCount > 0 && onCopyLastMonth && (
            <button
              type="button"
              onClick={onCopyLastMonth}
              className="text-[11px] text-primary hover:underline flex items-center gap-1 cursor-pointer"
            >
              <CopyIcon className="size-3" />
              <span>{`Copy last month (${copyCandidatesCount})`}</span>
            </button>
          )}
        </div>
        <Select
          items={categoryItems}
          value={categoryId || undefined}
          onValueChange={(val) => {
            setCategoryId(val || '');
            if (fieldErrors.category) {
              setFieldErrors((prev) => ({ ...prev, category: undefined }));
            }
          }}
          disabled={isEditing || expenseCategories.length === 0}
        >
          <SelectTrigger
            id="budget-category"
            className={cn(
              'w-full h-9 bg-card px-3 text-xs',
              fieldErrors.category && 'border-destructive ring-1 ring-destructive'
            )}
          >
            <SelectValue
              placeholder={
                expenseCategories.length === 0
                  ? 'No expense categories found'
                  : 'Select category...'
              }
            />
          </SelectTrigger>
          <SelectContent container={containerRef} className="max-h-60">
            {expenseCategories.length > 5 && (
              <div className="p-1.5 border-b sticky top-0 bg-popover z-10">
                <div className="relative flex items-center">
                  <SearchIcon className="absolute left-2 size-3 text-muted-foreground pointer-events-none" />
                  <input
                    type="text"
                    placeholder="Search categories..."
                    value={categorySearch}
                    onChange={(e) => setCategorySearch(e.target.value)}
                    onKeyDown={(e) => e.stopPropagation()}
                    className="w-full pl-6 pr-2 py-1 text-xs bg-muted/50 rounded-md border-0 outline-none placeholder:text-muted-foreground"
                  />
                </div>
              </div>
            )}
            {filteredCategories.length === 0 ? (
              <div className="p-3 text-xs text-muted-foreground text-center">
                No categories match &quot;{categorySearch}&quot;
              </div>
            ) : (
              filteredCategories.map((cat) => (
                <SelectItem key={cat.id} value={cat.id} className="text-xs">
                  <div className="flex items-center gap-2">
                    <span
                      className="size-2 rounded-full shrink-0"
                      style={{
                        backgroundColor:
                          cat.color || getDeterministicCategoryColor(cat.name),
                      }}
                    />
                    <span className="truncate">{cat.name}</span>
                  </div>
                </SelectItem>
              ))
            )}
          </SelectContent>
        </Select>
        {fieldErrors.category && (
          <p className="text-destructive text-[11px] font-medium">
            {fieldErrors.category}
          </p>
        )}
        {isEditing && (
          <p className="text-[11px] text-muted-foreground">
            Category cannot be modified on an existing budget.
          </p>
        )}
      </div>

      {/* Budget Amount (INR) */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="budget-amount" className="text-xs font-medium">
            Budget Amount (₹)
          </Label>
          {!isNaN(parsedAmount) && parsedAmount > 0 && (
            <span className="text-[11px] text-muted-foreground font-semibold">
              Preview: {formatINR(Math.round(parsedAmount * 100))}
            </span>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-medium">
            ₹
          </span>
          <Input
            id="budget-amount"
            type="text"
            inputMode="decimal"
            placeholder="e.g. 15,000 or 15000"
            className={cn(
              'pl-7 h-9 text-xs bg-card',
              fieldErrors.amount && 'border-destructive ring-1 ring-destructive'
            )}
            value={amountStr}
            onChange={(e) => {
              setAmountStr(e.target.value);
              if (fieldErrors.amount) {
                setFieldErrors((prev) => ({ ...prev, amount: undefined }));
              }
            }}
            required
            autoFocus={!isEditing}
          />
        </div>
        {fieldErrors.amount ? (
          <p className="text-destructive text-[11px] font-medium">
            {fieldErrors.amount}
          </p>
        ) : (
          <p className="text-[11px] text-muted-foreground">
            Accepts numbers formatted with commas (e.g. 12,500) or plain digits (e.g. 12500).
          </p>
        )}
      </div>

      {/* Period & Rollover Switch Grid */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
        {/* Period */}
        <div className="space-y-1.5">
          <Label htmlFor="budget-period" className="text-xs font-medium">
            Period
          </Label>
          <Select
            items={periodItems}
            value={period}
            onValueChange={(val) => {
              if (val) setPeriod(val as BudgetPeriod);
            }}
          >
            <SelectTrigger id="budget-period" className="w-full h-9 bg-card px-3 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent container={containerRef}>
              <SelectItem value="monthly" className="text-xs">
                Monthly
              </SelectItem>
              <SelectItem value="quarterly" className="text-xs">
                Quarterly
              </SelectItem>
              <SelectItem value="yearly" className="text-xs">
                Yearly
              </SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Rollover Toggle */}
        <div className="flex flex-col justify-between space-y-1.5 rounded-lg border bg-card/60 p-2.5">
          <div className="flex items-center justify-between gap-2">
            <Label htmlFor="budget-rollover" className="text-xs font-medium cursor-pointer">
              Rollover Unspent
            </Label>
            <Switch
              id="budget-rollover"
              size="sm"
              checked={rollover}
              onCheckedChange={setRollover}
            />
          </div>
          <p className="text-[10px] text-muted-foreground">
            {rollover
              ? 'Surplus from previous month rolls over.'
              : 'Does not carry forward surplus.'}
          </p>
        </div>
      </div>

      {/* Optional Total Overall Budget */}
      <div className="space-y-1.5 pt-1">
        <Label htmlFor="budget-optional-total" className="text-xs font-medium text-muted-foreground">
          Optional Total Monthly Budget Target (₹)
        </Label>
        <Input
          id="budget-optional-total"
          type="text"
          placeholder="e.g. 50,000 (optional overall cap)"
          className="h-8 text-xs bg-card"
          value={totalBudgetStr}
          onChange={(e) => setTotalBudgetStr(e.target.value)}
        />
        <p className="text-[10px] text-muted-foreground">
          Optional reference limit for your aggregate spending goals across all categories.
        </p>
      </div>

      {/* Dates if quarterly or yearly */}
      {period !== 'monthly' && (
        <div className="grid grid-cols-2 gap-3 pt-1">
          <div className="space-y-1.5">
            <Label htmlFor="budget-start-date" className="text-xs font-medium">
              Start Date
            </Label>
            <DatePicker
              id="budget-start-date"
              className="h-9 text-xs bg-card"
              value={startDate}
              onChange={(d) => {
                setStartDate(d);
                if (fieldErrors.dates) {
                  setFieldErrors((prev) => ({ ...prev, dates: undefined }));
                }
              }}
              required
              placeholder="Select start date"
            />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="budget-end-date" className="text-xs font-medium">
              End Date
            </Label>
            <DatePicker
              id="budget-end-date"
              className="h-9 text-xs bg-card"
              value={endDate}
              onChange={(d) => {
                setEndDate(d);
                if (fieldErrors.dates) {
                  setFieldErrors((prev) => ({ ...prev, dates: undefined }));
                }
              }}
              placeholder="Select end date"
              clearable
            />
          </div>
        </div>
      )}

      {fieldErrors.dates && (
        <p className="text-destructive text-[11px] font-medium">
          {fieldErrors.dates}
        </p>
      )}

      <DialogFooter className="pt-3 gap-2 sm:gap-0">
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
          {isSubmitting
            ? 'Saving...'
            : isEditing
              ? 'Save Changes'
              : 'Create Budget'}
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
  onCopyLastMonth?: () => void;
  copyCandidatesCount?: number;
}

export function BudgetDialog({
  open,
  onOpenChange,
  budget,
  activeMonth,
  onCopyLastMonth,
  copyCandidatesCount,
}: BudgetDialogProps) {
  const containerRef = React.useRef<HTMLDivElement>(null);

  const handleOpenChange = (nextOpen: boolean) => {
    onOpenChange(nextOpen);
    if (!nextOpen) {
      // Ensure body scroll lock and inert attributes are thoroughly cleaned up
      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.body.removeAttribute('inert');
          document.body.style.pointerEvents = '';
          if (
            !document.querySelector(
              '[data-slot="dialog-content"], [data-slot="sheet-content"]'
            )
          ) {
            document.querySelectorAll('[data-base-ui-inert]').forEach((el) => {
              el.removeAttribute('data-base-ui-inert');
              el.removeAttribute('inert');
              el.removeAttribute('aria-hidden');
            });
          }
        }
      }, 50);
    }
  };

  const isEditing = Boolean(budget);

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent ref={containerRef} className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-base font-semibold">
            {isEditing ? 'Edit Budget' : 'Set Category Budget'}
          </DialogTitle>
        </DialogHeader>
        {open && (
          <BudgetForm
            key={budget?.id ?? 'create'}
            budget={budget}
            activeMonth={activeMonth}
            onSuccess={() => handleOpenChange(false)}
            onCancel={() => handleOpenChange(false)}
            onCopyLastMonth={
              onCopyLastMonth
                ? () => {
                    handleOpenChange(false);
                    onCopyLastMonth();
                  }
                : undefined
            }
            copyCandidatesCount={copyCandidatesCount}
            containerRef={containerRef}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
