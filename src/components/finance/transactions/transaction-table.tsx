'use client';

import React, { useMemo, useState } from 'react';
import type { RowSelectionState } from '@tanstack/react-table';
import {
  SearchIcon,
  Trash2Icon,
  Edit2Icon,
  MoreHorizontalIcon,
  FilterIcon,
  ArrowRightLeftIcon,
  CalendarIcon,
  PlusIcon,
  RotateCcwIcon,
  TagIcon,
  Building2Icon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuSeparator,
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
import { TransactionEditDialog } from './transaction-edit-dialog';
import type { TransactionDTO } from '@src/lib/finance/contract';
import { cn } from '@/lib/utils';

export function TransactionTable() {
  const {
    transactions,
    accounts,
    categories,
    deleteTransaction,
    bulkDeleteTransactions,
    bulkUpdateTransactions,
    openQuickAdd,
  } = useFinanceStore();

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState('all');
  const [selectedCategoryId, setSelectedCategoryId] = useState('all');
  const [selectedType, setSelectedType] = useState<'all' | 'expense' | 'income' | 'transfer'>('all');
  const [datePreset, setDatePreset] = useState<'all' | 'today' | 'yesterday' | 'week' | 'month' | 'last30' | 'custom'>('all');
  const [customStartDate, setCustomStartDate] = useState('');
  const [customEndDate, setCustomEndDate] = useState('');
  const [minAmount, setMinAmount] = useState('');
  const [maxAmount, setMaxAmount] = useState('');
  const [showFilters, setShowFilters] = useState(false);

  // Row selection
  const [rowSelection, setRowSelection] = useState<RowSelectionState>({});

  // Dialog states
  const [editingTx, setEditingTx] = useState<TransactionDTO | null>(null);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState('');
  const [bulkAccountOpen, setBulkAccountOpen] = useState(false);
  const [bulkAccountTarget, setBulkAccountTarget] = useState('');
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // Today and Yesterday reference strings
  const todayStr = useMemo(() => new Date().toISOString().split('T')[0], []);
  const yesterdayStr = useMemo(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  }, []);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return transactions.filter((t) => {
      // Search
      if (search.trim()) {
        const q = search.toLowerCase();
        const payeeMatch = t.payee?.toLowerCase().includes(q);
        const noteMatch = t.note?.toLowerCase().includes(q);
        const tagMatch = t.tags?.toLowerCase().includes(q);
        const cat = categories.find((c) => c.id === t.categoryId);
        const catMatch = cat?.name.toLowerCase().includes(q);
        const acc = accounts.find((a) => a.id === t.accountId);
        const accMatch = acc?.name.toLowerCase().includes(q);
        if (!payeeMatch && !noteMatch && !tagMatch && !catMatch && !accMatch) {
          return false;
        }
      }

      // Account filter
      if (selectedAccountId !== 'all') {
        if (t.accountId !== selectedAccountId && t.toAccountId !== selectedAccountId) {
          return false;
        }
      }

      // Category filter
      if (selectedCategoryId !== 'all') {
        if (t.categoryId !== selectedCategoryId) return false;
      }

      // Type filter
      if (selectedType !== 'all') {
        if (t.type !== selectedType) return false;
      }

      // Amount filter (amounts in rupees)
      const amtRupees = t.amount / 100;
      if (minAmount && !isNaN(parseFloat(minAmount)) && amtRupees < parseFloat(minAmount)) {
        return false;
      }
      if (maxAmount && !isNaN(parseFloat(maxAmount)) && amtRupees > parseFloat(maxAmount)) {
        return false;
      }

      // Date presets
      if (datePreset === 'today') {
        if (t.date !== todayStr) return false;
      } else if (datePreset === 'yesterday') {
        if (t.date !== yesterdayStr) return false;
      } else if (datePreset === 'week') {
        const now = new Date();
        const weekAgo = new Date();
        weekAgo.setDate(now.getDate() - 7);
        const txDate = new Date(t.date);
        if (txDate < weekAgo) return false;
      } else if (datePreset === 'month') {
        const currentMonth = todayStr.substring(0, 7);
        if (!t.date.startsWith(currentMonth)) return false;
      } else if (datePreset === 'last30') {
        const now = new Date();
        const past30 = new Date();
        past30.setDate(now.getDate() - 30);
        const txDate = new Date(t.date);
        if (txDate < past30) return false;
      } else if (datePreset === 'custom') {
        if (customStartDate && t.date < customStartDate) return false;
        if (customEndDate && t.date > customEndDate) return false;
      }

      return true;
    });
  }, [
    transactions,
    search,
    selectedAccountId,
    selectedCategoryId,
    selectedType,
    minAmount,
    maxAmount,
    datePreset,
    customStartDate,
    customEndDate,
    todayStr,
    yesterdayStr,
    categories,
    accounts,
  ]);

  // Selected row IDs
  const selectedIds = useMemo(() => {
    return Object.keys(rowSelection).filter((k) => rowSelection[k]);
  }, [rowSelection]);

  // Running totals calculations
  const filteredTotalPaise = useMemo(() => {
    return filteredTransactions.reduce((acc, t) => {
      if (t.type === 'expense') return acc - t.amount;
      if (t.type === 'income') return acc + t.amount;
      return acc;
    }, 0);
  }, [filteredTransactions]);

  const selectedTotalPaise = useMemo(() => {
    const idSet = new Set(selectedIds);
    return filteredTransactions
      .filter((t) => idSet.has(t.id))
      .reduce((acc, t) => {
        if (t.type === 'expense') return acc - t.amount;
        if (t.type === 'income') return acc + t.amount;
        return acc;
      }, 0);
  }, [filteredTransactions, selectedIds]);

  // Reset filters
  const resetFilters = () => {
    setSearch('');
    setSelectedAccountId('all');
    setSelectedCategoryId('all');
    setSelectedType('all');
    setDatePreset('all');
    setCustomStartDate('');
    setCustomEndDate('');
    setMinAmount('');
    setMaxAmount('');
    setRowSelection({});
  };

  const handleSelectAll = (checked: boolean) => {
    if (checked) {
      const all: RowSelectionState = {};
      filteredTransactions.forEach((t) => {
        all[t.id] = true;
      });
      setRowSelection(all);
    } else {
      setRowSelection({});
    }
  };

  const isAllSelected =
    filteredTransactions.length > 0 &&
    filteredTransactions.every((t) => rowSelection[t.id]);

  // Bulk actions
  const handleBulkDelete = async () => {
    if (selectedIds.length === 0) return;
    try {
      await bulkDeleteTransactions(selectedIds);
      toast.success(`${selectedIds.length} transactions deleted`);
      setRowSelection({});
      setBulkDeleteConfirmOpen(false);
    } catch {
      toast.error('Failed to delete transactions');
    }
  };

  const handleBulkChangeCategory = async () => {
    if (!bulkCategoryTarget || selectedIds.length === 0) return;
    try {
      await bulkUpdateTransactions(selectedIds, { categoryId: bulkCategoryTarget });
      toast.success(`Updated category for ${selectedIds.length} transactions`);
      setRowSelection({});
      setBulkCategoryOpen(false);
      setBulkCategoryTarget('');
    } catch {
      toast.error('Failed to update category');
    }
  };

  const handleBulkChangeAccount = async () => {
    if (!bulkAccountTarget || selectedIds.length === 0) return;
    try {
      await bulkUpdateTransactions(selectedIds, { accountId: bulkAccountTarget });
      toast.success(`Updated account for ${selectedIds.length} transactions`);
      setRowSelection({});
      setBulkAccountOpen(false);
      setBulkAccountTarget('');
    } catch {
      toast.error('Failed to update account');
    }
  };

  // Group transactions by date for day grouping
  const dayGrouped = useMemo(() => {
    const groups: { date: string; label: string; transactions: TransactionDTO[]; dayTotal: number }[] = [];
    const dateMap = new Map<string, TransactionDTO[]>();

    filteredTransactions.forEach((t) => {
      const existing = dateMap.get(t.date) || [];
      existing.push(t);
      dateMap.set(t.date, existing);
    });

    const sortedDates = Array.from(dateMap.keys()).sort((a, b) => b.localeCompare(a));

    sortedDates.forEach((d) => {
      const list = dateMap.get(d) || [];
      let label = d;
      if (d === todayStr) label = 'Today';
      else if (d === yesterdayStr) label = 'Yesterday';
      else {
        const parsed = new Date(d);
        label = parsed.toLocaleDateString('en-IN', {
          weekday: 'short',
          month: 'short',
          day: 'numeric',
          year: 'numeric',
        });
      }

      const dayTotal = list.reduce((sum, item) => {
        if (item.type === 'income') return sum + item.amount;
        if (item.type === 'expense') return sum - item.amount;
        return sum;
      }, 0);

      groups.push({ date: d, label, transactions: list, dayTotal });
    });

    return groups;
  }, [filteredTransactions, todayStr, yesterdayStr]);

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-3 w-full">
      {/* Top Search & Filter Bar */}
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5">
        <div className="relative flex-1 max-w-md">
          <SearchIcon className="absolute left-2.5 top-1/2 -translate-y-1/2 size-4 text-muted-foreground" />
          <Input
            placeholder="Search payee, note, tags, category..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-8.5 h-9 text-xs bg-card"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto">
          {/* Quick Date Presets */}
          <select
            className="h-9 rounded-md border border-input bg-card px-2.5 text-xs text-muted-foreground focus:text-foreground"
            value={datePreset}
            onChange={(e) => setDatePreset(e.target.value as typeof datePreset)}
          >
            <option value="all">All Dates</option>
            <option value="today">Today</option>
            <option value="yesterday">Yesterday</option>
            <option value="week">This Week</option>
            <option value="month">This Month</option>
            <option value="last30">Last 30 Days</option>
            <option value="custom">Custom Range...</option>
          </select>

          {/* Type Filter */}
          <select
            className="h-9 rounded-md border border-input bg-card px-2.5 text-xs text-muted-foreground focus:text-foreground"
            value={selectedType}
            onChange={(e) => setSelectedType(e.target.value as typeof selectedType)}
          >
            <option value="all">All Types</option>
            <option value="expense">Expenses</option>
            <option value="income">Income</option>
            <option value="transfer">Transfers</option>
          </select>

          {/* Toggle More Filters */}
          <Button
            type="button"
            variant={showFilters ? 'secondary' : 'outline'}
            size="sm"
            className="h-9 text-xs gap-1.5"
            onClick={() => setShowFilters(!showFilters)}
          >
            <FilterIcon className="size-3.5" />
            <span className="hidden sm:inline">Filters</span>
          </Button>

          {(search || selectedAccountId !== 'all' || selectedCategoryId !== 'all' || selectedType !== 'all' || datePreset !== 'all' || minAmount || maxAmount) && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              className="h-9 text-xs gap-1 text-muted-foreground"
              onClick={resetFilters}
              title="Reset all filters"
            >
              <RotateCcwIcon className="size-3.5" />
              <span className="hidden sm:inline">Reset</span>
            </Button>
          )}
        </div>
      </div>

      {/* Expanded Filters Drawer */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border bg-muted/30">
          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Account
            </label>
            <select
              className="w-full h-8 rounded-md border border-input bg-card px-2 text-xs"
              value={selectedAccountId}
              onChange={(e) => setSelectedAccountId(e.target.value)}
            >
              <option value="all">All Accounts</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Category
            </label>
            <select
              className="w-full h-8 rounded-md border border-input bg-card px-2 text-xs"
              value={selectedCategoryId}
              onChange={(e) => setSelectedCategoryId(e.target.value)}
            >
              <option value="all">All Categories</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Min Amount (₹)
            </label>
            <Input
              type="number"
              placeholder="0"
              className="h-8 text-xs bg-card"
              value={minAmount}
              onChange={(e) => setMinAmount(e.target.value)}
            />
          </div>

          <div>
            <label className="text-[11px] font-medium text-muted-foreground block mb-1">
              Max Amount (₹)
            </label>
            <Input
              type="number"
              placeholder="No limit"
              className="h-8 text-xs bg-card"
              value={maxAmount}
              onChange={(e) => setMaxAmount(e.target.value)}
            />
          </div>

          {datePreset === 'custom' && (
            <div className="sm:col-span-4 grid grid-cols-2 gap-2.5 pt-1 border-t">
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  Start Date
                </label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-card"
                  value={customStartDate}
                  onChange={(e) => setCustomStartDate(e.target.value)}
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  End Date
                </label>
                <Input
                  type="date"
                  className="h-8 text-xs bg-card"
                  value={customEndDate}
                  onChange={(e) => setCustomEndDate(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Running Totals & Bulk Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border text-xs">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={handleSelectAll}
              aria-label="Select all filtered transactions"
            />
            <span className="text-muted-foreground">
              {filteredTransactions.length} transaction{filteredTransactions.length === 1 ? '' : 's'}
            </span>
          </div>

          <span className="text-muted-foreground/60">•</span>

          <div>
            <span className="text-muted-foreground">Net: </span>
            <span
              className={cn(
                'font-bold',
                filteredTotalPaise >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-foreground'
              )}
            >
              {formatINR(filteredTotalPaise, { signDisplay: 'always' })}
            </span>
          </div>

          {selectedIds.length > 0 && (
            <>
              <span className="text-muted-foreground/60">•</span>
              <div className="bg-primary/10 text-primary font-medium px-2 py-0.5 rounded-md">
                Selected {selectedIds.length}: {formatINR(selectedTotalPaise, { signDisplay: 'always' })}
              </div>
            </>
          )}
        </div>

        {/* Bulk Action Controls */}
        {selectedIds.length > 0 && (
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setBulkCategoryOpen(true)}
            >
              <TagIcon className="size-3" />
              <span>Change Category</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setBulkAccountOpen(true)}
            >
              <Building2Icon className="size-3" />
              <span>Change Account</span>
            </Button>

            <Button
              type="button"
              variant="destructive"
              size="sm"
              className="h-7 text-xs gap-1"
              onClick={() => setBulkDeleteConfirmOpen(true)}
            >
              <Trash2Icon className="size-3" />
              <span>Delete ({selectedIds.length})</span>
            </Button>
          </div>
        )}
      </div>

      {/* Main Table Container: Fixed Height & Scrolling */}
      <div className="flex-1 min-h-[420px] max-h-[calc(100vh-280px)] rounded-lg border bg-card overflow-y-auto">
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <ArrowRightLeftIcon className="size-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold text-foreground">No transactions found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {transactions.length === 0
                ? 'Get started by logging your first transaction or card payment.'
                : 'No transactions match the selected filters or search terms.'}
            </p>
            <div className="mt-4 flex gap-2">
              {transactions.length > 0 && (
                <Button type="button" variant="outline" size="sm" onClick={resetFilters}>
                  Reset Filters
                </Button>
              )}
              <Button type="button" size="sm" onClick={() => openQuickAdd()}>
                <PlusIcon className="size-3.5 mr-1" />
                Add Transaction
              </Button>
            </div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {dayGrouped.map((group) => (
              <div key={group.date} className="group-section">
                {/* Day Header Strip */}
                <div className="sticky top-0 z-10 bg-muted/80 backdrop-blur-xs px-4 py-1.5 flex items-center justify-between text-xs border-b">
                  <div className="flex items-center gap-2">
                    <CalendarIcon className="size-3.5 text-muted-foreground" />
                    <span className="font-semibold text-foreground">{group.label}</span>
                    <span className="text-muted-foreground text-[11px]">
                      ({group.transactions.length})
                    </span>
                  </div>
                  <div className="font-medium text-[11px] text-muted-foreground">
                    Day Total:{' '}
                    <span
                      className={cn(
                        'font-bold',
                        group.dayTotal >= 0
                          ? 'text-emerald-600 dark:text-emerald-400'
                          : 'text-foreground'
                      )}
                    >
                      {formatINR(group.dayTotal, { signDisplay: 'always' })}
                    </span>
                  </div>
                </div>

                {/* Day Transactions List */}
                <div className="divide-y divide-border/60">
                  {group.transactions.map((tx) => {
                    const isSelected = Boolean(rowSelection[tx.id]);
                    const account = accounts.find((a) => a.id === tx.accountId);
                    const toAccount = tx.toAccountId
                      ? accounts.find((a) => a.id === tx.toAccountId)
                      : null;
                    const category = categories.find((c) => c.id === tx.categoryId);

                    return (
                      <div
                        key={tx.id}
                        className={cn(
                          'flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors text-xs gap-3',
                          isSelected && 'bg-primary/5'
                        )}
                      >
                        {/* Checkbox & Details */}
                        <div className="flex items-center gap-3 min-w-0">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={(checked) =>
                              setRowSelection((prev) => {
                                const next: RowSelectionState = { ...prev };
                                if (checked) {
                                  next[tx.id] = true;
                                } else {
                                  delete next[tx.id];
                                }
                                return next;
                              })
                            }
                            aria-label={`Select transaction ${tx.payee || tx.type}`}
                          />

                          <div className="min-w-0">
                            <div className="flex items-center gap-2">
                              <span className="font-semibold text-foreground truncate">
                                {tx.payee || (tx.type === 'transfer' ? 'Transfer' : 'Unspecified Payee')}
                              </span>
                              {tx.type === 'transfer' && (
                                <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                                  Transfer
                                </Badge>
                              )}
                              {tx.isRecurring && (
                                <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 text-purple-600">
                                  Recurring
                                </Badge>
                              )}
                            </div>

                            <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground truncate">
                              {category && (
                                <span className="flex items-center gap-1">
                                  <span
                                    className="size-1.5 rounded-full inline-block shrink-0"
                                    style={{ backgroundColor: category.color || '#94a3b8' }}
                                  />
                                  <span>{category.name}</span>
                                </span>
                              )}
                              <span>•</span>
                              <span>
                                {account?.name || 'Account'}
                                {toAccount ? ` → ${toAccount.name}` : ''}
                              </span>
                              {tx.note && (
                                <>
                                  <span>•</span>
                                  <span className="italic truncate max-w-[160px] sm:max-w-xs">{tx.note}</span>
                                </>
                              )}
                            </div>
                          </div>
                        </div>

                        {/* Amount & Row Actions */}
                        <div className="flex items-center gap-3 shrink-0">
                          <div
                            className={cn(
                              'font-bold text-right text-xs sm:text-sm',
                              tx.type === 'income'
                                ? 'text-emerald-600 dark:text-emerald-400'
                                : tx.type === 'transfer'
                                ? 'text-blue-600 dark:text-blue-400'
                                : 'text-foreground'
                            )}
                          >
                            {tx.type === 'income' ? '+' : tx.type === 'expense' ? '-' : ''}
                            {formatINR(tx.amount)}
                          </div>

                          <DropdownMenu>
                            <DropdownMenuTrigger
                              nativeButton={true}
                              className="size-7 rounded-md hover:bg-muted flex items-center justify-center text-muted-foreground hover:text-foreground"
                              aria-label="Transaction actions"
                            >
                              <MoreHorizontalIcon className="size-4" />
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-40">
                              <DropdownMenuGroup>
                                <DropdownMenuLabel>Actions</DropdownMenuLabel>
                                <DropdownMenuItem
                                  onClick={() => setEditingTx(tx)}
                                  className="text-xs gap-2"
                                >
                                  <Edit2Icon className="size-3.5" />
                                  <span>Edit</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem
                                  onClick={async () => {
                                    await deleteTransaction(tx.id);
                                    toast.success('Transaction deleted');
                                  }}
                                  className="text-xs gap-2 text-destructive focus:text-destructive"
                                >
                                  <Trash2Icon className="size-3.5" />
                                  <span>Delete</span>
                                </DropdownMenuItem>
                              </DropdownMenuGroup>
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Edit Transaction Dialog */}
      <TransactionEditDialog
        transaction={editingTx}
        open={Boolean(editingTx)}
        onOpenChange={(open) => !open && setEditingTx(null)}
      />

      {/* Bulk Category Change Dialog */}
      <Dialog open={bulkCategoryOpen} onOpenChange={setBulkCategoryOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Change Category</DialogTitle>
            <DialogDescription className="text-xs">
              Select a new category to apply to {selectedIds.length} selected transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <select
              className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
              value={bulkCategoryTarget}
              onChange={(e) => setBulkCategoryTarget(e.target.value)}
            >
              <option value="">Select category...</option>
              {categories.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name} ({c.type})
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setBulkCategoryOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!bulkCategoryTarget} onClick={handleBulkChangeCategory}>
              Apply Category
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Account Change Dialog */}
      <Dialog open={bulkAccountOpen} onOpenChange={setBulkAccountOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Change Account</DialogTitle>
            <DialogDescription className="text-xs">
              Select a new account to assign to {selectedIds.length} selected transactions.
            </DialogDescription>
          </DialogHeader>
          <div className="py-3">
            <select
              className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs"
              value={bulkAccountTarget}
              onChange={(e) => setBulkAccountTarget(e.target.value)}
            >
              <option value="">Select account...</option>
              {accounts.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </select>
          </div>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setBulkAccountOpen(false)}>
              Cancel
            </Button>
            <Button size="sm" disabled={!bulkAccountTarget} onClick={handleBulkChangeAccount}>
              Apply Account
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Bulk Delete Confirm Dialog */}
      <Dialog open={bulkDeleteConfirmOpen} onOpenChange={setBulkDeleteConfirmOpen}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="text-base font-bold">Delete Transactions</DialogTitle>
            <DialogDescription className="text-xs">
              Are you sure you want to delete {selectedIds.length} selected transactions? This action cannot be reversed.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="ghost" size="sm" onClick={() => setBulkDeleteConfirmOpen(false)}>
              Cancel
            </Button>
            <Button variant="destructive" size="sm" onClick={handleBulkDelete}>
              Confirm Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
