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
  ChevronDownIcon,
  ChevronRightIcon,
  ChevronUpIcon,
  ChevronsUpDownIcon,
  ChevronsDownUpIcon,
  CopyIcon,
  CheckIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
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
import { todayInTz, yesterdayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import { formatINR } from '../shared/format';
import { TransactionEditDialog } from './transaction-edit-dialog';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import type { TransactionDTO } from '@src/lib/finance/contract';
import { cn } from '@/lib/utils';

export function TransactionTable({ accountId }: { accountId?: string } = {}) {
  const {
    transactions: globalTransactions,
    transactionsByAccount,
    accounts,
    categories,
    deleteTransaction,
    bulkDeleteTransactions,
    bulkUpdateTransactions,
    openQuickAdd,
    refreshTransactions,
  } = useFinanceStore();

  // Load account-specific transactions when accountId is passed
  React.useEffect(() => {
    if (accountId) {
      void refreshTransactions({ accountId });
    }
  }, [accountId, refreshTransactions]);

  const sourceTransactions = useMemo(() => {
    if (accountId) {
      const cached = transactionsByAccount[accountId]?.transactions;
      if (cached) return cached;
      return globalTransactions.filter(
        (t) => t.accountId === accountId || t.toAccountId === accountId
      );
    }
    return globalTransactions;
  }, [accountId, transactionsByAccount, globalTransactions]);

  // Filter states
  const [search, setSearch] = useState('');
  const [selectedAccountId, setSelectedAccountId] = useState(accountId || 'all');
  const activeAccountId = accountId || selectedAccountId;
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

  // Collapsed day groups & expanded row details
  const [collapsedDayMap, setCollapsedDayMap] = useState<Record<string, boolean>>({});
  const [expandedRowIds, setExpandedRowIds] = useState<Record<string, boolean>>({});
  const [copiedTxId, setCopiedTxId] = useState<string | null>(null);

  // Dialog states
  const [editingTx, setEditingTx] = useState<TransactionDTO | null>(null);
  const [bulkCategoryOpen, setBulkCategoryOpen] = useState(false);
  const [bulkCategoryTarget, setBulkCategoryTarget] = useState('');
  const [bulkAccountOpen, setBulkAccountOpen] = useState(false);
  const [bulkAccountTarget, setBulkAccountTarget] = useState('');
  const [bulkDeleteConfirmOpen, setBulkDeleteConfirmOpen] = useState(false);

  // Today and Yesterday reference strings in user timezone (Asia/Kolkata)
  const todayStr = useMemo(() => todayInTz(DEFAULT_TZ), []);
  const yesterdayStr = useMemo(() => yesterdayInTz(DEFAULT_TZ), []);

  // Filtered transactions
  const filteredTransactions = useMemo(() => {
    return sourceTransactions.filter((t) => {
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
      if (activeAccountId !== 'all') {
        if (t.accountId !== activeAccountId && t.toAccountId !== activeAccountId) {
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
    sourceTransactions,
    search,
    activeAccountId,
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

  // Running summary calculations
  const filteredSummary = useMemo(() => {
    let count = 0;
    let totalIn = 0;
    let totalOut = 0;

    for (const t of filteredTransactions) {
      count++;
      const eff =
        t.effect !== undefined
          ? t.effect
          : t.type === 'income'
          ? t.amount
          : t.type === 'expense'
          ? -t.amount
          : t.type === 'transfer' && accountId
          ? t.accountId === accountId
            ? -t.amount
            : t.amount
          : 0;

      if (eff > 0) {
        totalIn += eff;
      } else if (eff < 0) {
        totalOut += Math.abs(eff);
      }
    }

    return {
      count,
      totalIn,
      totalOut,
      net: totalIn - totalOut,
    };
  }, [filteredTransactions, accountId]);

  const selectedTotalPaise = useMemo(() => {
    const idSet = new Set(selectedIds);
    return filteredTransactions
      .filter((t) => idSet.has(t.id))
      .reduce((acc, t) => {
        const eff =
          t.effect !== undefined
            ? t.effect
            : t.type === 'income'
            ? t.amount
            : t.type === 'expense'
            ? -t.amount
            : 0;
        return acc + eff;
      }, 0);
  }, [filteredTransactions, selectedIds]);

  // Reset filters
  const resetFilters = () => {
    setSearch('');
    setSelectedAccountId(accountId || 'all');
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

  // Collapse & expand state helpers
  const areAllDaysCollapsed = useMemo(() => {
    if (dayGrouped.length === 0) return false;
    return dayGrouped.every((g) => collapsedDayMap[g.date]);
  }, [dayGrouped, collapsedDayMap]);

  const toggleDayCollapse = (date: string) => {
    setCollapsedDayMap((prev) => ({
      ...prev,
      [date]: !prev[date],
    }));
  };

  const toggleAllDayGroups = () => {
    if (areAllDaysCollapsed) {
      setCollapsedDayMap({});
    } else {
      const next: Record<string, boolean> = {};
      dayGrouped.forEach((g) => {
        next[g.date] = true;
      });
      setCollapsedDayMap(next);
    }
  };

  const areAllRowsExpanded = useMemo(() => {
    if (filteredTransactions.length === 0) return false;
    return filteredTransactions.every((t) => expandedRowIds[t.id]);
  }, [filteredTransactions, expandedRowIds]);

  const toggleRowExpand = (id: string) => {
    setExpandedRowIds((prev) => ({
      ...prev,
      [id]: !prev[id],
    }));
  };

  const toggleAllRows = () => {
    if (areAllRowsExpanded) {
      setExpandedRowIds({});
    } else {
      const next: Record<string, boolean> = {};
      filteredTransactions.forEach((t) => {
        next[t.id] = true;
      });
      setExpandedRowIds(next);
      // Ensure days are also expanded so the row details can be seen
      setCollapsedDayMap({});
    }
  };

  const handleCopyId = async (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    try {
      await navigator.clipboard.writeText(id);
      setCopiedTxId(id);
      toast.success('Transaction ID copied to clipboard');
      setTimeout(() => {
        setCopiedTxId((curr) => (curr === id ? null : curr));
      }, 2000);
    } catch {
      toast.error('Failed to copy ID');
    }
  };

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
          <Select
            value={datePreset}
            onValueChange={(val) => setDatePreset(val as typeof datePreset)}
          >
            <SelectTrigger className="h-9 bg-card px-2.5 text-xs text-muted-foreground focus:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Dates</SelectItem>
              <SelectItem value="today" className="text-xs">Today</SelectItem>
              <SelectItem value="yesterday" className="text-xs">Yesterday</SelectItem>
              <SelectItem value="week" className="text-xs">This Week</SelectItem>
              <SelectItem value="month" className="text-xs">This Month</SelectItem>
              <SelectItem value="last30" className="text-xs">Last 30 Days</SelectItem>
              <SelectItem value="custom" className="text-xs">Custom Range...</SelectItem>
            </SelectContent>
          </Select>

          {/* Type Filter */}
          <Select
            value={selectedType}
            onValueChange={(val) => setSelectedType(val as typeof selectedType)}
          >
            <SelectTrigger className="h-9 bg-card px-2.5 text-xs text-muted-foreground focus:text-foreground">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all" className="text-xs">All Types</SelectItem>
              <SelectItem value="expense" className="text-xs">Expenses</SelectItem>
              <SelectItem value="income" className="text-xs">Income</SelectItem>
              <SelectItem value="transfer" className="text-xs">Transfers</SelectItem>
            </SelectContent>
          </Select>

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

          <Button
            type="button"
            size="sm"
            className="h-9 text-xs gap-1.5 shrink-0"
            onClick={() => openQuickAdd()}
          >
            <PlusIcon className="size-3.5" />
            <span>Add Transaction</span>
          </Button>
        </div>
      </div>

      {/* Expanded Filters Drawer */}
      {showFilters && (
        <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5 p-3 rounded-lg border bg-muted/30">
          {!accountId && (
            <div>
              <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                Account
              </label>
              <Select
                value={selectedAccountId}
                onValueChange={(val) => setSelectedAccountId(val || 'all')}
              >
                <SelectTrigger className="w-full h-8 bg-card px-2 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all" className="text-xs">All Accounts</SelectItem>
                  {accounts.map((a) => (
                    <SelectItem key={a.id} value={a.id} className="text-xs">
                      {a.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          <div>
            <div className="flex items-center justify-between mb-1">
              <label className="text-[11px] font-medium text-muted-foreground block">
                Category
              </label>
              {selectedCategoryId !== 'all' && (
                (() => {
                  const sel = categories.find((c) => c.id === selectedCategoryId);
                  if (!sel) return null;
                  const col = sel.color || getDeterministicCategoryColor(sel.name);
                  return (
                    <span className="flex items-center gap-1 text-[11px] font-medium">
                      <span
                        className="size-1.5 rounded-full inline-block shrink-0 ring-1 ring-border"
                        style={{ backgroundColor: col }}
                      />
                      <span className="truncate max-w-[90px]">{sel.name}</span>
                    </span>
                  );
                })()
              )}
            </div>
            <Select
              value={selectedCategoryId}
              onValueChange={(val) => setSelectedCategoryId(val || 'all')}
            >
              <SelectTrigger className="w-full h-8 bg-card px-2 text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all" className="text-xs">All Categories</SelectItem>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name} ({c.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
                <DatePicker
                  className="h-8 text-xs bg-card"
                  value={customStartDate}
                  onChange={setCustomStartDate}
                  placeholder="Start date"
                  clearable
                />
              </div>
              <div>
                <label className="text-[11px] font-medium text-muted-foreground block mb-1">
                  End Date
                </label>
                <DatePicker
                  className="h-8 text-xs bg-card"
                  value={customEndDate}
                  onChange={setCustomEndDate}
                  placeholder="End date"
                  clearable
                />
              </div>
            </div>
          )}
        </div>
      )}

      {/* Running Totals & Bulk Actions Bar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 px-3 py-2 rounded-lg bg-card border text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Checkbox
              checked={isAllSelected}
              onCheckedChange={handleSelectAll}
              aria-label="Select all filtered transactions"
            />
            <span className="text-muted-foreground">
              {filteredSummary.count} transaction{filteredSummary.count === 1 ? '' : 's'}
            </span>
          </div>

          <span className="text-muted-foreground/60">•</span>

          <div>
            <span className="text-muted-foreground">Total In: </span>
            <span className="font-semibold text-emerald-600 dark:text-emerald-400">
              +{formatINR(filteredSummary.totalIn)}
            </span>
          </div>

          <span className="text-muted-foreground/60">•</span>

          <div>
            <span className="text-muted-foreground">Total Out: </span>
            <span className="font-semibold text-foreground">
              -{formatINR(filteredSummary.totalOut)}
            </span>
          </div>

          <span className="text-muted-foreground/60">•</span>

          <div>
            <span className="text-muted-foreground">Net: </span>
            <span
              className={cn(
                'font-bold',
                filteredSummary.net >= 0
                  ? 'text-emerald-600 dark:text-emerald-400'
                  : 'text-rose-600 dark:text-rose-400'
              )}
            >
              {formatINR(filteredSummary.net, { signDisplay: 'always' })}
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

        {/* Action Controls: Bulk actions & Expand/Collapse Toggles */}
        <div className="flex flex-wrap items-center gap-1.5">
          {selectedIds.length > 0 && (
            <>
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

              <span className="text-muted-foreground/40 hidden sm:inline">|</span>
            </>
          )}

          {/* Group Expand / Collapse All Toggle */}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={toggleAllDayGroups}
            title={areAllDaysCollapsed ? 'Expand all date groups' : 'Collapse all date groups'}
          >
            {areAllDaysCollapsed ? (
              <>
                <ChevronsUpDownIcon className="size-3" />
                <span>Expand Days</span>
              </>
            ) : (
              <>
                <ChevronsDownUpIcon className="size-3" />
                <span>Collapse Days</span>
              </>
            )}
          </Button>

          {/* Row Details Expand / Collapse Toggle */}
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="h-7 text-xs gap-1 text-muted-foreground hover:text-foreground"
            onClick={toggleAllRows}
            title={areAllRowsExpanded ? 'Collapse all row details' : 'Expand all row details'}
          >
            {areAllRowsExpanded ? (
              <>
                <ChevronUpIcon className="size-3" />
                <span>Collapse Details</span>
              </>
            ) : (
              <>
                <ChevronDownIcon className="size-3" />
                <span>Expand Details</span>
              </>
            )}
          </Button>
        </div>
      </div>

      {/* Main Table Container: Fixed Height & Scrolling */}
      <div className="flex-1 min-h-[420px] max-h-[calc(100vh-280px)] rounded-lg border bg-card overflow-y-auto">
        {filteredTransactions.length === 0 ? (
          <div className="flex flex-col items-center justify-center py-16 px-4 text-center">
            <ArrowRightLeftIcon className="size-10 text-muted-foreground/40 mb-3" />
            <h3 className="text-sm font-semibold text-foreground">No transactions found</h3>
            <p className="text-xs text-muted-foreground max-w-sm mt-1">
              {sourceTransactions.length === 0
                ? 'Get started by logging your first transaction or card payment.'
                : 'No transactions match the selected filters or search terms.'}
            </p>
            <div className="mt-4 flex gap-2">
              {sourceTransactions.length > 0 && (
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
            {dayGrouped.map((group) => {
              const isDayCollapsed = Boolean(collapsedDayMap[group.date]);

              return (
                <div key={group.date} className="group-section">
                  {/* Day Header Strip */}
                  <div
                    role="button"
                    tabIndex={0}
                    aria-expanded={!isDayCollapsed}
                    aria-label={`${group.label}, ${group.transactions.length} transactions, ${
                      isDayCollapsed ? 'collapsed. Click to expand' : 'expanded. Click to collapse'
                    }`}
                    onClick={() => toggleDayCollapse(group.date)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        toggleDayCollapse(group.date);
                      }
                    }}
                    className={cn(
                      'sticky top-0 z-10 bg-muted/80 backdrop-blur-xs px-4 py-1.5 flex items-center justify-between text-xs border-b cursor-pointer select-none transition-colors',
                      'hover:bg-muted focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring'
                    )}
                  >
                    <div className="flex items-center gap-2">
                      <span className="p-0.5 rounded text-muted-foreground">
                        <ChevronDownIcon
                          className={cn(
                            'size-3.5 transition-transform duration-200',
                            isDayCollapsed && '-rotate-90 text-muted-foreground'
                          )}
                        />
                      </span>
                      <CalendarIcon className="size-3.5 text-muted-foreground" />
                      <span className="font-semibold text-foreground">{group.label}</span>
                      <span className="text-muted-foreground text-[11px]">
                        ({group.transactions.length})
                      </span>
                      {isDayCollapsed && (
                        <Badge
                          variant="outline"
                          className="text-[10px] h-4 px-1.5 font-normal text-muted-foreground"
                        >
                          Collapsed
                        </Badge>
                      )}
                    </div>
                    <div className="font-medium text-[11px] text-muted-foreground flex items-center gap-1.5">
                      <span>Day Total:</span>
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
                  {!isDayCollapsed && (
                    <div className="divide-y divide-border/60">
                      {group.transactions.map((tx) => {
                        const isSelected = Boolean(rowSelection[tx.id]);
                        const isRowExpanded = Boolean(expandedRowIds[tx.id]);
                        const account = accounts.find((a) => a.id === tx.accountId);
                        const toAccount = tx.toAccountId
                          ? accounts.find((a) => a.id === tx.toAccountId)
                          : null;
                        const category = categories.find((c) => c.id === tx.categoryId);

                        return (
                          <div
                            key={tx.id}
                            className={cn(
                              'transition-colors',
                              isSelected && 'bg-primary/5',
                              isRowExpanded && 'bg-muted/15'
                            )}
                          >
                            <div
                              className={cn(
                                'flex items-center justify-between px-4 py-2.5 hover:bg-muted/40 transition-colors text-xs gap-3',
                                isSelected && 'bg-primary/5'
                              )}
                            >
                              {/* Expand toggle, Checkbox & Details */}
                              <div className="flex items-center gap-2.5 min-w-0">
                                <button
                                  type="button"
                                  onClick={(e) => {
                                    e.stopPropagation();
                                    toggleRowExpand(tx.id);
                                  }}
                                  aria-label={
                                    isRowExpanded
                                      ? `Collapse details for ${tx.payee || tx.type}`
                                      : `Expand details for ${tx.payee || tx.type}`
                                  }
                                  aria-expanded={isRowExpanded}
                                  className="p-1 rounded text-muted-foreground hover:text-foreground hover:bg-muted transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring shrink-0"
                                  title={isRowExpanded ? 'Collapse row details' : 'Expand row details'}
                                >
                                  <ChevronRightIcon
                                    className={cn(
                                      'size-3.5 transition-transform duration-200',
                                      isRowExpanded && 'rotate-90 text-foreground'
                                    )}
                                  />
                                </button>

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
                                      {tx.isOpening ? 'Opening Balance' : tx.payee || (tx.type === 'transfer' ? 'Transfer' : 'Unspecified Payee')}
                                    </span>
                                    {tx.isOpening && (
                                      <Badge variant="outline" className="text-[10px] py-0 px-1.5 h-4 border-primary/40 text-primary">
                                        Opening
                                      </Badge>
                                    )}
                                    {tx.type === 'transfer' && (
                                      <Badge variant="secondary" className="text-[10px] py-0 px-1.5 h-4">
                                        {tx.counterparty ? (tx.accountId === accountId ? `To ${tx.counterparty}` : `From ${tx.counterparty}`) : 'Transfer'}
                                      </Badge>
                                    )}
                                    {tx.isRecurring && (
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] py-0 px-1.5 h-4 text-purple-600"
                                      >
                                        Recurring
                                      </Badge>
                                    )}
                                  </div>

                                  <div className="flex items-center gap-2 mt-0.5 text-[11px] text-muted-foreground truncate">
                                    {category && (
                                      <span className="flex items-center gap-1">
                                        <span
                                          className="size-1.5 rounded-full inline-block shrink-0 ring-1 ring-border"
                                          style={{
                                            backgroundColor:
                                              category.color ||
                                              getDeterministicCategoryColor(category.name),
                                          }}
                                        />
                                        <span>{category.name}</span>
                                      </span>
                                    )}
                                    {!accountId && (
                                      <>
                                        <span>•</span>
                                        <span>
                                          {account?.name || 'Account'}
                                          {toAccount ? ` → ${toAccount.name}` : ''}
                                        </span>
                                      </>
                                    )}
                                    {accountId && tx.type === 'transfer' && tx.counterparty && (
                                      <>
                                        <span>•</span>
                                        <span className="font-medium text-foreground">
                                          {tx.accountId === accountId ? `To: ${tx.counterparty}` : `From: ${tx.counterparty}`}
                                        </span>
                                      </>
                                    )}
                                    {tx.note && (
                                      <>
                                        <span>•</span>
                                        <span className="italic truncate max-w-[160px] sm:max-w-xs">
                                          {tx.note}
                                        </span>
                                      </>
                                    )}
                                  </div>
                                </div>
                              </div>

                              {/* Amount / Effect & Running Balance & Row Actions */}
                              <div className="flex items-center gap-3 shrink-0">
                                <div className="text-right">
                                  {(() => {
                                    const eff =
                                      tx.effect !== undefined
                                        ? tx.effect
                                        : tx.type === 'income'
                                        ? tx.amount
                                        : tx.type === 'expense'
                                        ? -tx.amount
                                        : 0;

                                    return (
                                      <div
                                        className={cn(
                                          'font-bold text-xs sm:text-sm',
                                          eff > 0
                                            ? 'text-emerald-600 dark:text-emerald-400'
                                            : eff < 0
                                            ? 'text-foreground'
                                            : 'text-muted-foreground'
                                        )}
                                      >
                                        {formatINR(eff, { signDisplay: 'always' })}
                                      </div>
                                    );
                                  })()}
                                  {tx.runningBalance !== undefined && (
                                    <div className="text-[10px] text-muted-foreground font-mono tabular-nums">
                                      Bal: {formatINR(tx.runningBalance)}
                                    </div>
                                  )}
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
                                        onClick={() => toggleRowExpand(tx.id)}
                                        className="text-xs gap-2"
                                      >
                                        {isRowExpanded ? (
                                          <>
                                            <ChevronUpIcon className="size-3.5" />
                                            <span>Collapse Details</span>
                                          </>
                                        ) : (
                                          <>
                                            <ChevronDownIcon className="size-3.5" />
                                            <span>Expand Details</span>
                                          </>
                                        )}
                                      </DropdownMenuItem>
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

                            {/* Expanded Details Sub-Panel */}
                            {isRowExpanded && (
                              <div className="px-5 py-3 ml-6 mr-4 mb-2 bg-muted/30 rounded-md border border-border/60 text-xs space-y-2.5">
                                <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
                                  {/* Note */}
                                  {tx.note && (
                                    <div className="sm:col-span-2">
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                                        Note
                                      </span>
                                      <p className="text-foreground whitespace-pre-wrap rounded bg-card p-2 border text-xs">
                                        {tx.note}
                                      </p>
                                    </div>
                                  )}

                                  {/* Tags */}
                                  {tx.tags && (
                                    <div>
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-1">
                                        Tags
                                      </span>
                                      <div className="flex flex-wrap gap-1">
                                        {tx.tags.split(',').map((tag, i) => {
                                          const trimmed = tag.trim();
                                          if (!trimmed) return null;
                                          return (
                                            <Badge
                                              key={i}
                                              variant="secondary"
                                              className="text-[10px] py-0 px-1.5 h-5 gap-1 font-normal"
                                            >
                                              <TagIcon className="size-2.5" />
                                              <span>{trimmed}</span>
                                            </Badge>
                                          );
                                        })}
                                      </div>
                                    </div>
                                  )}

                                  {/* Transfer Route */}
                                  {tx.type === 'transfer' && (
                                    <div>
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                                        Transfer Route
                                      </span>
                                      <p className="text-foreground font-medium flex items-center gap-1.5">
                                        <span>{account?.name || 'Source Account'}</span>
                                        <span className="text-muted-foreground">→</span>
                                        <span>{toAccount?.name || 'Destination Account'}</span>
                                      </p>
                                    </div>
                                  )}

                                  {/* Transaction ID & Metadata */}
                                  <div>
                                    <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                                      Transaction ID
                                    </span>
                                    <div className="flex items-center gap-1.5">
                                      <code className="text-[11px] font-mono bg-muted px-1.5 py-0.5 rounded text-muted-foreground select-all">
                                        {tx.id}
                                      </code>
                                      <Button
                                        type="button"
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 w-6 p-0 text-muted-foreground hover:text-foreground"
                                        onClick={(e) => handleCopyId(tx.id, e)}
                                        title="Copy transaction ID"
                                      >
                                        {copiedTxId === tx.id ? (
                                          <CheckIcon className="size-3 text-emerald-500" />
                                        ) : (
                                          <CopyIcon className="size-3" />
                                        )}
                                      </Button>
                                    </div>
                                  </div>

                                  {/* Created Timestamp */}
                                  {tx.createdAt && (
                                    <div>
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                                        Created At
                                      </span>
                                      <p className="text-muted-foreground text-[11px]">
                                        {new Date(tx.createdAt).toLocaleString('en-IN', {
                                          dateStyle: 'medium',
                                          timeStyle: 'short',
                                        })}
                                      </p>
                                    </div>
                                  )}

                                  {/* Recurring Rule Indicator */}
                                  {tx.isRecurring && (
                                    <div>
                                      <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider block mb-0.5">
                                        Recurring Schedule
                                      </span>
                                      <Badge
                                        variant="outline"
                                        className="text-[10px] text-purple-600 border-purple-200"
                                      >
                                        Recurring rule transaction
                                      </Badge>
                                    </div>
                                  )}
                                </div>

                                {/* Quick Actions Footer */}
                                <div className="flex items-center justify-end gap-2 pt-2 border-t border-border/40">
                                  <Button
                                    type="button"
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5"
                                    onClick={() => setEditingTx(tx)}
                                  >
                                    <Edit2Icon className="size-3" />
                                    <span>Edit</span>
                                  </Button>
                                  <Button
                                    type="button"
                                    variant="ghost"
                                    size="sm"
                                    className="h-7 text-xs gap-1.5 text-destructive hover:text-destructive hover:bg-destructive/10"
                                    onClick={async () => {
                                      await deleteTransaction(tx.id);
                                      toast.success('Transaction deleted');
                                    }}
                                  >
                                    <Trash2Icon className="size-3" />
                                    <span>Delete</span>
                                  </Button>
                                </div>
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              );
            })}
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
            <Select
              items={categories.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.type})`,
              }))}
              value={bulkCategoryTarget || undefined}
              onValueChange={(val) => setBulkCategoryTarget(val || '')}
            >
              <SelectTrigger className="w-full h-9 bg-card px-3 text-xs">
                <SelectValue placeholder="Select category..." />
              </SelectTrigger>
              <SelectContent>
                {categories.map((c) => (
                  <SelectItem key={c.id} value={c.id} className="text-xs">
                    {c.name} ({c.type})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
            <Select
              items={accounts.map((a) => ({
                value: a.id,
                label: a.name,
              }))}
              value={bulkAccountTarget || undefined}
              onValueChange={(val) => setBulkAccountTarget(val || '')}
            >
              <SelectTrigger className="w-full h-9 bg-card px-3 text-xs">
                <SelectValue placeholder="Select account..." />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((a) => (
                  <SelectItem key={a.id} value={a.id} className="text-xs">
                    {a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
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
