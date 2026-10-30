'use client';

import React, { useEffect, useMemo, useState } from 'react';
import {
  PiggyBankIcon,
  PlusIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  CalendarIcon,
  AlertTriangleIcon,
  CheckCircle2Icon,
  CopyIcon,
  Edit2Icon,
  Trash2Icon,
  MoreVerticalIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  RotateCcwIcon,
  SearchIcon,
  FilterIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { useFinanceStore } from '../shared/finance-store';
import { formatINR } from '../shared/format';
import { FinancePageSkeleton } from '../shared/finance-skeleton';
import { BudgetDialog } from './budget-dialog';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import {
  calculateBudgetProgress,
  calculateTotalBudgetSummary,
  formatMonthLabel,
  getCurrentMonthString,
  getNextMonthString,
  getPreviousMonthString,
  planCopyLastMonthBudgets,
} from '@src/lib/finance/budgets/progress';
import type { BudgetDTO } from '@src/lib/finance/contract';
import type { BudgetPeriod } from '@src/lib/finance/constants';
import type { CategoryBudgetProgress, BudgetStatus } from '@src/lib/finance/budgets/types';
import { cn } from '@/lib/utils';

export function BudgetsView() {
  const {
    budgets,
    categories,
    transactions,
    budgetsStatus,
    refreshBudgets,
    refreshTransactions,
    deleteBudget,
    addBudget,
  } = useFinanceStore();

  const currentCalendarMonth = useMemo(() => getCurrentMonthString(), []);
  const [selectedMonth, setSelectedMonth] = useState<string>(currentCalendarMonth);
  const [selectedPeriod, setSelectedPeriod] = useState<BudgetPeriod | 'all'>('all');
  const [statusFilter, setStatusFilter] = useState<'all' | BudgetStatus>('all');
  const [search, setSearch] = useState('');

  // Dialog states
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetDTO | null>(null);
  const [deletingBudget, setDeletingBudget] = useState<BudgetDTO | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copyConfirmOpen, setCopyConfirmOpen] = useState(false);
  const [isCopying, setIsCopying] = useState(false);

  // Initial fetch on mount or when switching to budgets tab
  useEffect(() => {
    void Promise.all([refreshBudgets(), refreshTransactions()]);
  }, [refreshBudgets, refreshTransactions]);

  // Map categories for quick lookup
  const categoryMap = useMemo(() => {
    return new Map(categories.map((c) => [c.id, c]));
  }, [categories]);

  // Compute progress for each budget in the selected month
  const categoryProgressItems: CategoryBudgetProgress[] = useMemo(() => {
    // Filter budgets active for this month & period
    const filtered = budgets.filter((b) => {
      // Period filter
      if (selectedPeriod !== 'all' && b.period !== selectedPeriod) {
        return false;
      }

      // Check if budget applies to selectedMonth
      const budgetStartMonth = b.startDate.slice(0, 7);
      const budgetEndMonth = b.endDate ? b.endDate.slice(0, 7) : null;

      if (b.period === 'monthly') {
        // Must match selectedMonth or start on/before and end on/after
        if (budgetStartMonth === selectedMonth) return true;
        if (budgetStartMonth <= selectedMonth && (!budgetEndMonth || budgetEndMonth >= selectedMonth)) {
          return true;
        }
        return false;
      }

      // Quarterly / Yearly
      if (budgetStartMonth <= selectedMonth && (!budgetEndMonth || budgetEndMonth >= selectedMonth)) {
        return true;
      }
      return false;
    });

    return filtered.map((budget) => {
      const cat = categoryMap.get(budget.categoryId);
      const categoryName = cat?.name || 'Unknown Category';
      const categoryColor = cat?.color || getDeterministicCategoryColor(categoryName);

      return calculateBudgetProgress({
        budget,
        categoryName,
        categoryColor,
        categoryIcon: cat?.icon || null,
        transactions,
        monthStr: selectedMonth,
      });
    });
  }, [budgets, selectedPeriod, selectedMonth, categoryMap, transactions]);

  // Total summary across category progress
  const summary = useMemo(() => {
    return calculateTotalBudgetSummary({
      month: selectedMonth,
      items: categoryProgressItems,
    });
  }, [selectedMonth, categoryProgressItems]);

  // Copy plan candidate detection
  const copyPlan = useMemo(() => {
    return planCopyLastMonthBudgets({
      allBudgets: budgets,
      categories,
      currentMonth: selectedMonth,
    });
  }, [budgets, categories, selectedMonth]);

  // Filtered and searched items
  const displayItems = useMemo(() => {
    return categoryProgressItems.filter((item) => {
      if (statusFilter !== 'all' && item.status !== statusFilter) {
        return false;
      }
      if (search.trim()) {
        const q = search.toLowerCase();
        return item.categoryName.toLowerCase().includes(q);
      }
      return true;
    });
  }, [categoryProgressItems, statusFilter, search]);

  // Handlers
  const handlePrevMonth = () => {
    setSelectedMonth((curr) => getPreviousMonthString(curr));
  };

  const handleNextMonth = () => {
    setSelectedMonth((curr) => getNextMonthString(curr));
  };

  const handleCurrentMonth = () => {
    setSelectedMonth(currentCalendarMonth);
  };

  const handleOpenCreate = () => {
    setEditingBudget(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (bgtId: string) => {
    const target = budgets.find((b) => b.id === bgtId);
    if (target) {
      setEditingBudget(target);
      setDialogOpen(true);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deletingBudget) return;
    setIsDeleting(true);
    try {
      await deleteBudget(deletingBudget.id);
      toast.success('Budget deleted successfully');
      setDeletingBudget(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete budget');
    } finally {
      setIsDeleting(false);
    }
  };

  const handleCopyLastMonth = async () => {
    if (!copyPlan.canCopy || copyPlan.candidates.length === 0) return;
    setIsCopying(true);

    try {
      const { startDate: targetStart, endDate: targetEnd } = {
        startDate: `${selectedMonth}-01`,
        endDate: `${selectedMonth}-28`, // default or null
      };

      let copiedCount = 0;
      for (const cand of copyPlan.candidates) {
        await addBudget({
          categoryId: cand.categoryId,
          amount: cand.amount,
          period: cand.period,
          startDate: targetStart,
          endDate: cand.period === 'monthly' ? null : targetEnd,
        });
        copiedCount += 1;
      }

      toast.success(`Copied ${copiedCount} budget${copiedCount === 1 ? '' : 's'} from ${formatMonthLabel(copyPlan.previousMonth)}`);
      setCopyConfirmOpen(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to copy budgets');
    } finally {
      setIsCopying(false);
    }
  };

  if (budgetsStatus === 'loading' && budgets.length === 0) {
    return <FinancePageSkeleton title="Loading Budgets & Spending Targets..." />;
  }

  const isCurrentMonthActive = selectedMonth === currentCalendarMonth;

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full max-w-7xl mx-auto pb-8">
      {/* Top Header & Month Navigation */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold tracking-tight">Budgets & Spending Targets</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Set category limits, monitor spending progress, and prevent budget overruns
          </p>
        </div>

        {/* Month Selector Controls */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1 bg-card border rounded-lg p-1 shadow-xs">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handlePrevMonth}
              title="Previous Month"
              aria-label="Previous Month"
            >
              <ChevronLeftIcon className="size-4" />
            </Button>

            <div className="flex items-center gap-1.5 px-2 text-xs font-semibold min-w-[130px] justify-center">
              <CalendarIcon className="size-3.5 text-muted-foreground" />
              <span>{formatMonthLabel(selectedMonth)}</span>
            </div>

            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="size-7"
              onClick={handleNextMonth}
              title="Next Month"
              aria-label="Next Month"
            >
              <ChevronRightIcon className="size-4" />
            </Button>
          </div>

          {!isCurrentMonthActive && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 text-xs"
              onClick={handleCurrentMonth}
            >
              This Month
            </Button>
          )}

          <Button
            type="button"
            size="sm"
            className="h-9 text-xs gap-1.5"
            onClick={handleOpenCreate}
          >
            <PlusIcon className="size-3.5" />
            <span>Set Budget</span>
          </Button>
        </div>
      </div>

      {/* Aggregate KPI Summary Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Budgeted */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total Budgeted</span>
            <PiggyBankIcon className="size-4 text-primary" />
          </div>
          <div className="text-2xl font-bold tracking-tight mt-2">
            {formatINR(summary.totalEffectiveBudget)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            Across {summary.totalBudgetsCount} category budget{summary.totalBudgetsCount === 1 ? '' : 's'}
          </p>
        </div>

        {/* Total Spent */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Total Spent</span>
            <TrendingDownIcon className="size-4 text-emerald-600 dark:text-emerald-400" />
          </div>
          <div className="text-2xl font-bold tracking-tight mt-2 text-foreground">
            {formatINR(summary.totalSpent)}
          </div>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-[11px] text-muted-foreground">
              {summary.percentageUsed}% of budget used
            </span>
          </div>
        </div>

        {/* Remaining / Overspent */}
        <div className="rounded-xl border bg-card p-4 shadow-xs">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>{summary.totalOverspent > 0 ? 'Overspent Amount' : 'Remaining Budget'}</span>
            {summary.totalOverspent > 0 ? (
              <AlertTriangleIcon className="size-4 text-destructive" />
            ) : (
              <CheckCircle2Icon className="size-4 text-emerald-600 dark:text-emerald-400" />
            )}
          </div>
          <div
            className={cn(
              'text-2xl font-bold tracking-tight mt-2',
              summary.totalOverspent > 0
                ? 'text-destructive'
                : 'text-emerald-600 dark:text-emerald-400'
            )}
          >
            {summary.totalOverspent > 0
              ? formatINR(summary.totalOverspent)
              : formatINR(summary.totalRemaining)}
          </div>
          <p className="text-[11px] text-muted-foreground mt-1">
            {summary.totalOverspent > 0
              ? 'Exceeded planned budget'
              : 'Safe unspent allowance'}
          </p>
        </div>

        {/* Health / Alert Status Breakdown */}
        <div className="rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between">
          <div className="flex items-center justify-between text-xs text-muted-foreground">
            <span>Budget Health</span>
            <Badge
              variant="outline"
              className={cn(
                'text-[10px] font-semibold',
                summary.status === 'ok'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-950/40 dark:text-emerald-400 dark:border-emerald-800'
                  : summary.status === 'warning'
                    ? 'bg-amber-50 text-amber-700 border-amber-200 dark:bg-amber-950/40 dark:text-amber-400 dark:border-amber-800'
                    : 'bg-destructive/10 text-destructive border-destructive/20'
              )}
            >
              {summary.status === 'ok'
                ? 'On Track'
                : summary.status === 'warning'
                  ? 'Near Limit'
                  : 'Over Budget'}
            </Badge>
          </div>

          {/* Aggregate Progress Bar */}
          <div className="space-y-1.5 my-2">
            <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
              <div
                className={cn(
                  'h-full rounded-full transition-all duration-300',
                  summary.status === 'ok'
                    ? 'bg-emerald-500'
                    : summary.status === 'warning'
                      ? 'bg-amber-500'
                      : 'bg-destructive'
                )}
                style={{ width: `${Math.min(100, summary.percentageUsed)}%` }}
              />
            </div>
          </div>

          <div className="flex items-center justify-between text-[11px] text-muted-foreground">
            <span className="text-emerald-600 dark:text-emerald-400 font-medium">
              {summary.onTrackCount} on track
            </span>
            {summary.warningCount > 0 && (
              <span className="text-amber-600 dark:text-amber-400 font-medium">
                {summary.warningCount} warning
              </span>
            )}
            {summary.overBudgetCount > 0 && (
              <span className="text-destructive font-medium">
                {summary.overBudgetCount} over
              </span>
            )}
          </div>
        </div>
      </div>

      {/* Copy Last Month Suggestion Banner */}
      {copyPlan.canCopy && (
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3.5 rounded-xl border border-primary/20 bg-primary/5 text-xs">
          <div className="flex items-center gap-2.5">
            <CopyIcon className="size-4 text-primary shrink-0" />
            <div>
              <span className="font-semibold text-foreground">
                Copy previous month&apos;s budgets?
              </span>{' '}
              <span className="text-muted-foreground">
                {copyPlan.candidates.length} category budget{copyPlan.candidates.length === 1 ? '' : 's'} configured in{' '}
                {formatMonthLabel(copyPlan.previousMonth)} can be copied to {formatMonthLabel(selectedMonth)}.
              </span>
            </div>
          </div>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-8 text-xs shrink-0 self-start sm:self-center"
            onClick={() => setCopyConfirmOpen(true)}
          >
            Copy {copyPlan.candidates.length} Budget{copyPlan.candidates.length === 1 ? '' : 's'}
          </Button>
        </div>
      )}

      {/* Filters and Search Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-sm">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search category budgets..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8.5 h-9 text-xs bg-card"
          />
        </div>

        <div className="flex items-center gap-2 overflow-x-auto">
          {/* Status Filter */}
          <Select
            value={statusFilter}
            onValueChange={(val) => setStatusFilter(val as typeof statusFilter)}
          >
            <SelectTrigger className="h-9 bg-card px-2.5 text-xs text-muted-foreground focus:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Statuses</SelectItem>
              <SelectItem value="ok" className="text-xs">On Track (&lt;80%)</SelectItem>
              <SelectItem value="warning" className="text-xs">Near Limit (80–100%)</SelectItem>
              <SelectItem value="over_budget" className="text-xs">Over Budget (&gt;100%)</SelectItem>
            </SelectContent>
          </Select>

          {/* Period Filter */}
          <Select
            value={selectedPeriod}
            onValueChange={(val) => setSelectedPeriod(val as typeof selectedPeriod)}
          >
            <SelectTrigger className="h-9 bg-card px-2.5 text-xs text-muted-foreground focus:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Periods</SelectItem>
              <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
              <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
              <SelectItem value="yearly" className="text-xs">Yearly</SelectItem>
            </SelectContent>
          </Select>

          {(search || statusFilter !== 'all' || selectedPeriod !== 'all') && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-xs text-muted-foreground"
              onClick={() => {
                setSearch('');
                setStatusFilter('all');
                setSelectedPeriod('all');
              }}
            >
              <RotateCcwIcon className="size-3.5 mr-1" />
              Reset
            </Button>
          )}
        </div>
      </div>

      {/* Category Budget Cards Grid */}
      {displayItems.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-16 px-4 text-center rounded-xl border bg-card">
          <PiggyBankIcon className="size-12 text-muted-foreground/30 mb-3" />
          <h3 className="text-sm font-semibold text-foreground">
            {budgets.length === 0
              ? 'No budgets created yet'
              : 'No budgets found for this selection'}
          </h3>
          <p className="text-xs text-muted-foreground max-w-sm mt-1">
            {budgets.length === 0
              ? `Set up category spending limits for ${formatMonthLabel(selectedMonth)} to stay on track.`
              : 'Try clearing your search or status filters, or set a new budget for this month.'}
          </p>
          <div className="mt-4 flex gap-2">
            {copyPlan.canCopy && (
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setCopyConfirmOpen(true)}
              >
                Copy from {formatMonthLabel(copyPlan.previousMonth)}
              </Button>
            )}
            <Button type="button" size="sm" onClick={handleOpenCreate}>
              <PlusIcon className="size-3.5 mr-1" />
              Set Category Budget
            </Button>
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {displayItems.map((item) => {
            const isOver = item.status === 'over_budget';
            const isWarn = item.status === 'warning';

            return (
              <div
                key={item.budgetId}
                className={cn(
                  'rounded-xl border bg-card p-4 shadow-xs flex flex-col justify-between transition-all hover:border-foreground/20',
                  isOver && 'border-destructive/40 bg-destructive/5'
                )}
              >
                {/* Top Row: Category Name, Badge & Actions */}
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <span
                        className="size-2.5 rounded-full shrink-0 ring-1 ring-border"
                        style={{ backgroundColor: item.categoryColor || '#3b82f6' }}
                      />
                      <span className="font-semibold text-sm truncate text-foreground">
                        {item.categoryName}
                      </span>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <Badge
                        variant="outline"
                        className={cn(
                          'text-[10px] font-semibold px-2 py-0.5',
                          isOver
                            ? 'bg-destructive/15 text-destructive border-destructive/30'
                            : isWarn
                              ? 'bg-amber-500/15 text-amber-700 dark:text-amber-400 border-amber-500/30'
                              : 'bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/20'
                        )}
                      >
                        {item.percentageUsed}%
                      </Badge>

                      <DropdownMenu>
                        <DropdownMenuTrigger
                          type="button"
                          className="size-7 inline-flex items-center justify-center rounded-md text-muted-foreground hover:text-foreground hover:bg-muted transition-colors cursor-pointer"
                          aria-label="Actions"
                        >
                          <MoreVerticalIcon className="size-3.5" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => handleOpenEdit(item.budgetId)}>
                            <Edit2Icon className="size-3.5 mr-2" />
                            Edit Budget
                          </DropdownMenuItem>
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => {
                              const b = budgets.find((x) => x.id === item.budgetId);
                              if (b) setDeletingBudget(b);
                            }}
                          >
                            <Trash2Icon className="size-3.5 mr-2" />
                            Delete Budget
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>

                  {/* Amounts Row */}
                  <div className="flex items-baseline justify-between mt-3">
                    <div className="text-lg font-bold tracking-tight">
                      {formatINR(item.spentAmount)}
                      <span className="text-xs font-normal text-muted-foreground ml-1">
                        spent
                      </span>
                    </div>
                    <div className="text-xs text-muted-foreground font-medium">
                      of {formatINR(item.effectiveBudget)}
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="mt-2.5 space-y-1">
                    <div className="w-full h-2 rounded-full bg-muted overflow-hidden">
                      <div
                        className={cn(
                          'h-full rounded-full transition-all duration-300',
                          isOver
                            ? 'bg-destructive'
                            : isWarn
                              ? 'bg-amber-500'
                              : 'bg-emerald-500'
                        )}
                        style={{ width: `${Math.min(100, item.percentageUsed)}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Bottom Row: Remaining / Overspent & Transactions */}
                <div className="flex items-center justify-between text-[11px] pt-3 mt-3 border-t text-muted-foreground">
                  <div>
                    {isOver ? (
                      <span className="text-destructive font-medium flex items-center gap-1">
                        <AlertTriangleIcon className="size-3" />
                        {formatINR(item.overspentAmount)} over budget
                      </span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                        {formatINR(item.remainingAmount)} remaining
                      </span>
                    )}
                  </div>

                  <span>
                    {item.transactionCount} txn{item.transactionCount === 1 ? '' : 's'}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Create / Edit Budget Dialog */}
      <BudgetDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        budget={editingBudget}
        activeMonth={selectedMonth}
      />

      {/* Delete Confirmation Dialog */}
      <Dialog
        open={Boolean(deletingBudget)}
        onOpenChange={(open) => !open && setDeletingBudget(null)}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete Budget</DialogTitle>
            <DialogDescription>
              Are you sure you want to delete this category budget? Past transactions will
              remain untouched.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setDeletingBudget(null)}
              disabled={isDeleting}
            >
              Cancel
            </Button>
            <Button
              type="button"
              variant="destructive"
              size="sm"
              onClick={handleDeleteConfirm}
              disabled={isDeleting}
            >
              {isDeleting ? 'Deleting...' : 'Delete Budget'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Copy Last Month Confirmation Dialog */}
      <Dialog open={copyConfirmOpen} onOpenChange={setCopyConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Copy Budgets from {formatMonthLabel(copyPlan.previousMonth)}</DialogTitle>
            <DialogDescription>
              The following {copyPlan.candidates.length} budget{copyPlan.candidates.length === 1 ? '' : 's'} will be created for {formatMonthLabel(selectedMonth)}:
            </DialogDescription>
          </DialogHeader>

          <div className="max-h-56 overflow-y-auto divide-y divide-border rounded-md border p-2 text-xs">
            {copyPlan.candidates.map((cand) => (
              <div key={cand.categoryId} className="flex items-center justify-between py-1.5 px-2">
                <span className="font-medium text-foreground">{cand.categoryName}</span>
                <span className="text-muted-foreground">{formatINR(cand.amount)}</span>
              </div>
            ))}
          </div>

          <DialogFooter className="gap-2 sm:gap-0 pt-2">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setCopyConfirmOpen(false)}
              disabled={isCopying}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleCopyLastMonth}
              disabled={isCopying}
            >
              {isCopying ? 'Copying...' : `Confirm & Copy (${copyPlan.candidates.length})`}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
