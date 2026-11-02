'use client';

import React, { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  InboxIcon,
  CheckCheckIcon,
  XCircleIcon,
  AlertTriangleIcon,
  SparklesIcon,
  RotateCwIcon,
  ArrowDownLeftIcon,
  ArrowUpRightIcon,
  SearchIcon,
  LightbulbIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { useFinanceStore } from '../shared/finance-store';
import type { InboxItemDTO } from '@src/lib/finance/inbox/service';

interface EditableInboxRow {
  id: string;
  idempotencyKey: string;
  source: string;
  receivedAt: string;
  date: string;
  amountRupees: number;
  direction: 'debit' | 'credit';
  currency: string;
  merchant: string;
  description: string;
  accountId: string;
  categoryId: string;
  initialCategoryId: string;
  duplicateWarning: Array<{ reason: string; existingId?: string }> | null;
  status: string;
}

export function InboxView() {
  const { accounts, categories, refreshTransactions, refreshAccounts } = useFinanceStore();

  const [items, setItems] = useState<EditableInboxRow[]>([]);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [isLoading, setIsLoading] = useState(true);
  const [isActing, setIsActing] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [tabFilter, setTabFilter] = useState<'pending' | 'duplicate' | 'all'>('pending');

  // Rule learning state
  const [rulePrompt, setRulePrompt] = useState<{
    inboxId: string;
    payee: string;
    categoryId: string;
    categoryName: string;
  } | null>(null);

  const fetchInboxData = useCallback(async (filter: string) => {
    try {
      const res = await fetch(`/api/finance/inbox?status=${filter}&limit=100`);
      if (!res.ok) throw new Error('Failed to load inbox items');
      const data = await res.json();

      const mapped: EditableInboxRow[] = (data.items || []).map((item: InboxItemDTO) => ({
        id: item.id,
        idempotencyKey: item.idempotencyKey,
        source: item.source,
        receivedAt: item.receivedAt,
        date: item.date,
        amountRupees: item.amount / 100,
        direction: item.direction,
        currency: item.currency,
        merchant: item.merchant || '',
        description: item.description || '',
        accountId: item.matchedAccountId || '',
        categoryId: item.suggestedCategoryId || '',
        initialCategoryId: item.suggestedCategoryId || '',
        duplicateWarning: item.duplicateWarning,
        status: item.status,
      }));

      setItems(mapped);
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error fetching inbox');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const res = await fetch(`/api/finance/inbox?status=${tabFilter}&limit=100`);
        if (!res.ok) throw new Error('Failed to load inbox items');
        const data = await res.json();

        if (!ignore) {
          const mapped: EditableInboxRow[] = (data.items || []).map((item: InboxItemDTO) => ({
            id: item.id,
            idempotencyKey: item.idempotencyKey,
            source: item.source,
            receivedAt: item.receivedAt,
            date: item.date,
            amountRupees: item.amount / 100,
            direction: item.direction,
            currency: item.currency,
            merchant: item.merchant || '',
            description: item.description || '',
            accountId: item.matchedAccountId || '',
            categoryId: item.suggestedCategoryId || '',
            initialCategoryId: item.suggestedCategoryId || '',
            duplicateWarning: item.duplicateWarning,
            status: item.status,
          }));

          setItems(mapped);
          setSelectedIds(new Set());
          setIsLoading(false);
        }
      } catch (err: unknown) {
        if (!ignore) {
          toast.error(err instanceof Error ? err.message : 'Error fetching inbox');
          setIsLoading(false);
        }
      }
    };

    load();
    return () => {
      ignore = true;
    };
  }, [tabFilter]);

  const updateRow = (id: string, updates: Partial<EditableInboxRow>) => {
    setItems((prev) => prev.map((row) => (row.id === id ? { ...row, ...updates } : row)));
  };

  const toggleSelect = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleBulkApprove = useCallback(async () => {
    const toApprove = items.filter((item) => selectedIds.has(item.id));
    if (toApprove.length === 0) return;

    // Validate account assignment
    const missingAccount = toApprove.find((i) => !i.accountId);
    if (missingAccount) {
      toast.error(`Please select an account for "${missingAccount.merchant || 'item'}"`);
      return;
    }

    setIsActing(true);
    try {
      const payload = {
        items: toApprove.map((item) => ({
          id: item.id,
          accountId: item.accountId,
          categoryId: item.categoryId || null,
          payee: item.merchant || null,
          amount: Math.round(item.amountRupees * 100),
          note: item.description || null,
        })),
      };

      const res = await fetch('/api/finance/inbox/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to approve items');
      }

      const { result } = await res.json();
      toast.success(`Approved ${result.approved.length} item(s)`);

      // Refresh ledger & accounts
      void refreshTransactions();
      void refreshAccounts();

      // Check if any approved item changed category from suggested or null (rule learning)
      const changed = toApprove.find(
        (i) => i.categoryId && i.categoryId !== i.initialCategoryId && i.merchant
      );
      if (changed) {
        const cat = categories.find((c) => c.id === changed.categoryId);
        setRulePrompt({
          inboxId: changed.id,
          payee: changed.merchant,
          categoryId: changed.categoryId,
          categoryName: cat?.name || 'Category',
        });
      }

      // Remove approved items from local list
      setItems((prev) => prev.filter((i) => !result.approved.includes(i.id)));
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error approving items');
    } finally {
      setIsActing(false);
    }
  }, [items, selectedIds, categories, refreshTransactions, refreshAccounts]);

  const handleBulkReject = useCallback(async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;

    setIsActing(true);
    try {
      const res = await fetch('/api/finance/inbox/reject', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to reject items');
      }

      toast.success(`Rejected ${ids.length} item(s)`);
      setItems((prev) => prev.filter((i) => !ids.includes(i.id)));
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error rejecting items');
    } finally {
      setIsActing(false);
    }
  }, [selectedIds]);

  const handleApproveAllClean = async () => {
    const cleanItems = items.filter(
      (item) =>
        (!item.duplicateWarning || item.duplicateWarning.length === 0) &&
        Boolean(item.accountId) &&
        item.status === 'pending'
    );

    if (cleanItems.length === 0) {
      toast.info('No clean items ready for auto-approval. Ensure accounts are selected.');
      return;
    }

    setIsActing(true);
    try {
      const payload = {
        items: cleanItems.map((item) => ({
          id: item.id,
          accountId: item.accountId,
          categoryId: item.categoryId || null,
          payee: item.merchant || null,
          amount: Math.round(item.amountRupees * 100),
          note: item.description || null,
        })),
      };

      const res = await fetch('/api/finance/inbox/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.error || 'Failed to approve clean items');
      }

      const { result } = await res.json();
      toast.success(`Approved all ${result.approved.length} clean items!`);

      void refreshTransactions();
      void refreshAccounts();

      setItems((prev) => prev.filter((i) => !result.approved.includes(i.id)));
      setSelectedIds(new Set());
    } catch (err: unknown) {
      toast.error(err instanceof Error ? err.message : 'Error approving clean items');
    } finally {
      setIsActing(false);
    }
  };

  const handleLearnRule = async () => {
    if (!rulePrompt) return;
    try {
      const res = await fetch(`/api/finance/inbox/${rulePrompt.inboxId}/learn-rule`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ categoryId: rulePrompt.categoryId }),
      });
      if (res.ok) {
        toast.success(`Rule saved: Always map "${rulePrompt.payee}" to ${rulePrompt.categoryName}`);
      }
    } catch {
      toast.error('Failed to save payee rule');
    } finally {
      setRulePrompt(null);
    }
  };

  // Keyboard navigation & shortcuts: 'A' to approve selected, 'R' to reject selected
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (['INPUT', 'SELECT', 'TEXTAREA'].includes((e.target as HTMLElement)?.tagName)) {
        return;
      }

      if (e.key === 'a' || e.key === 'A') {
        if (selectedIds.size > 0 && !isActing) {
          e.preventDefault();
          void handleBulkApprove();
        }
      } else if (e.key === 'r' || e.key === 'R') {
        if (selectedIds.size > 0 && !isActing) {
          e.preventDefault();
          void handleBulkReject();
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [selectedIds, isActing, items, handleBulkApprove, handleBulkReject]);

  // Filtered items by search
  const filteredItems = searchQuery.trim()
    ? items.filter((item) => {
        const q = searchQuery.toLowerCase();
        return (
          item.merchant.toLowerCase().includes(q) ||
          item.description.toLowerCase().includes(q) ||
          item.date.includes(q)
        );
      })
    : items;

  const toggleSelectAll = () => {
    if (selectedIds.size === filteredItems.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredItems.map((i) => i.id)));
    }
  };

  const cleanCount = items.filter(
    (i) => (!i.duplicateWarning || i.duplicateWarning.length === 0) && Boolean(i.accountId)
  ).length;

  return (
    <TooltipProvider>
      <div className="flex flex-col h-[calc(100vh-12rem)] min-h-0 space-y-3">
        {/* Top Toolbar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <div className="flex items-center rounded-lg bg-muted p-1 text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setTabFilter('pending');
                }}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  tabFilter === 'pending'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Pending ({items.filter((i) => i.status === 'pending').length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setTabFilter('duplicate');
                }}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  tabFilter === 'duplicate'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                Duplicates ({items.filter((i) => i.status === 'duplicate').length})
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsLoading(true);
                  setTabFilter('all');
                }}
                className={`px-3 py-1 rounded-md font-medium transition-colors ${
                  tabFilter === 'all'
                    ? 'bg-background text-foreground shadow-xs font-semibold'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
              >
                All
              </button>
            </div>

            <div className="relative w-48 sm:w-64">
              <SearchIcon className="absolute left-2.5 top-2.5 size-3.5 text-muted-foreground" />
              <Input
                placeholder="Search merchant, desc..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                className="pl-8 h-8 text-xs"
              />
            </div>
          </div>

          <div className="flex items-center gap-2 flex-wrap">
            {cleanCount > 0 && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleApproveAllClean}
                disabled={isActing}
                className="h-8 text-xs border-emerald-500/30 text-emerald-600 dark:text-emerald-400 hover:bg-emerald-500/10"
              >
                <SparklesIcon className="size-3.5 mr-1" />
                Approve {cleanCount} Clean Items
              </Button>
            )}

            {selectedIds.size > 0 && (
              <>
                <Button
                  variant="default"
                  size="sm"
                  onClick={handleBulkApprove}
                  disabled={isActing}
                  className="h-8 text-xs bg-emerald-600 hover:bg-emerald-700 text-white"
                >
                  <CheckCheckIcon className="size-3.5 mr-1" />
                  Approve ({selectedIds.size})
                  <kbd className="ml-1.5 hidden sm:inline-block px-1 py-0.2 bg-emerald-700/50 rounded text-[10px]">A</kbd>
                </Button>
                <Button
                  variant="destructive"
                  size="sm"
                  onClick={handleBulkReject}
                  disabled={isActing}
                  className="h-8 text-xs"
                >
                  <XCircleIcon className="size-3.5 mr-1" />
                  Reject ({selectedIds.size})
                  <kbd className="ml-1.5 hidden sm:inline-block px-1 py-0.2 bg-red-900/50 rounded text-[10px]">R</kbd>
                </Button>
              </>
            )}

            <Button
              variant="outline"
              size="icon"
              onClick={() => {
                setIsLoading(true);
                void fetchInboxData(tabFilter);
              }}
              disabled={isLoading}
              className="size-8"
              title="Refresh inbox"
            >
              <RotateCwIcon className={`size-3.5 ${isLoading ? 'animate-spin' : ''}`} />
            </Button>
          </div>
        </div>

        {/* DataTable Container (Fixed Height + Scrollable Body) */}
        <div className="flex-1 min-h-0 border rounded-lg bg-card overflow-hidden flex flex-col shadow-xs">
          <div className="overflow-x-auto overflow-y-auto flex-1">
            <table className="w-full text-xs text-left border-collapse">
              <thead className="sticky top-0 bg-muted/80 backdrop-blur-xs z-10 border-b font-medium text-muted-foreground select-none">
                <tr>
                  <th className="p-3 w-10 text-center">
                    <Checkbox
                      checked={
                        filteredItems.length > 0 &&
                        selectedIds.size === filteredItems.length
                      }
                      onCheckedChange={toggleSelectAll}
                      aria-label="Select all"
                    />
                  </th>
                  <th className="p-3 w-28">Date & Source</th>
                  <th className="p-3 min-w-44">Payee / Merchant</th>
                  <th className="p-3 w-32">Amount</th>
                  <th className="p-3 min-w-44">Account</th>
                  <th className="p-3 min-w-44">Category</th>
                  <th className="p-3 w-28 text-center">Flags</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {isLoading ? (
                  <tr>
                    <td colSpan={7} className="text-center py-12 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <RotateCwIcon className="size-6 animate-spin text-muted-foreground/60" />
                        <span>Loading inbox items...</span>
                      </div>
                    </td>
                  </tr>
                ) : filteredItems.length === 0 ? (
                  <tr>
                    <td colSpan={7} className="text-center py-16 text-muted-foreground">
                      <div className="flex flex-col items-center gap-2">
                        <InboxIcon className="size-10 text-muted-foreground/40" />
                        <span className="font-medium text-foreground">Inbox is clear!</span>
                        <span className="text-xs max-w-sm">
                          No pending items to review. Ingest transactions via n8n, email alerts, or the API to see them here.
                        </span>
                      </div>
                    </td>
                  </tr>
                ) : (
                  filteredItems.map((item) => {
                    const isSelected = selectedIds.has(item.id);
                    const hasWarning =
                      item.duplicateWarning && item.duplicateWarning.length > 0;
                    const isDebit = item.direction === 'debit';

                    return (
                      <tr
                        key={item.id}
                        className={`hover:bg-muted/40 transition-colors ${
                          isSelected ? 'bg-primary/5' : ''
                        } ${hasWarning ? 'bg-amber-500/5' : ''}`}
                      >
                        {/* Checkbox */}
                        <td className="p-3 text-center">
                          <Checkbox
                            checked={isSelected}
                            onCheckedChange={() => toggleSelect(item.id)}
                            aria-label={`Select ${item.merchant}`}
                          />
                        </td>

                        {/* Date & Source */}
                        <td className="p-3">
                          <div className="font-mono text-xs">{item.date}</div>
                          <div className="flex items-center gap-1 mt-0.5">
                            <Badge variant="outline" className="text-[10px] px-1 py-0 uppercase">
                              {item.source}
                            </Badge>
                          </div>
                        </td>

                        {/* Payee / Merchant (Editable) */}
                        <td className="p-3">
                          <Input
                            value={item.merchant}
                            onChange={(e) => updateRow(item.id, { merchant: e.target.value })}
                            placeholder="Payee or description"
                            className="h-7 text-xs bg-transparent hover:bg-background focus:bg-background border-transparent hover:border-input focus:border-input transition-colors"
                          />
                          {item.description && item.description !== item.merchant && (
                            <p
                              className="text-[10px] text-muted-foreground truncate max-w-xs mt-0.5 px-1"
                              title={item.description}
                            >
                              {item.description}
                            </p>
                          )}
                        </td>

                        {/* Amount & Direction (Editable) */}
                        <td className="p-3">
                          <div className="flex items-center gap-1">
                            {isDebit ? (
                              <ArrowDownLeftIcon className="size-3.5 text-red-500 shrink-0" />
                            ) : (
                              <ArrowUpRightIcon className="size-3.5 text-emerald-500 shrink-0" />
                            )}
                            <Input
                              type="number"
                              step="0.01"
                              value={item.amountRupees}
                              onChange={(e) =>
                                updateRow(item.id, {
                                  amountRupees: parseFloat(e.target.value) || 0,
                                })
                              }
                              className={`h-7 w-24 text-xs font-mono font-medium bg-transparent hover:bg-background focus:bg-background border-transparent hover:border-input focus:border-input ${
                                isDebit ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'
                              }`}
                            />
                          </div>
                        </td>

                        {/* Account Selector (Editable) */}
                        <td className="p-3">
                          <Select
                            value={item.accountId}
                            onValueChange={(val) => updateRow(item.id, { accountId: val ?? '' })}
                          >
                            <SelectTrigger className="h-7 text-xs bg-transparent border-transparent hover:border-input focus:border-input">
                              <SelectValue placeholder="Select account..." />
                            </SelectTrigger>
                            <SelectContent>
                              {accounts.map((acc) => (
                                <SelectItem key={acc.id} value={acc.id}>
                                  {acc.name} ({acc.kind})
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Category Selector (Editable) */}
                        <td className="p-3">
                          <Select
                            value={item.categoryId || 'none'}
                            onValueChange={(val) =>
                              updateRow(item.id, { categoryId: !val || val === 'none' ? '' : val })
                            }
                          >
                            <SelectTrigger className="h-7 text-xs bg-transparent border-transparent hover:border-input focus:border-input">
                              <SelectValue placeholder="Select category..." />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="none">Uncategorized</SelectItem>
                              {categories.map((cat) => (
                                <SelectItem key={cat.id} value={cat.id}>
                                  {cat.name}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        </td>

                        {/* Flags / Duplicate warnings */}
                        <td className="p-3 text-center">
                          {hasWarning ? (
                            <Tooltip>
                              <TooltipTrigger>
                                <span className="inline-flex items-center gap-1 text-[11px] font-medium text-amber-600 dark:text-amber-400 bg-amber-500/15 px-2 py-0.5 rounded-full cursor-help">
                                  <AlertTriangleIcon className="size-3" />
                                  Duplicate?
                                </span>
                              </TooltipTrigger>
                              <TooltipContent className="max-w-xs text-xs space-y-1">
                                <p className="font-semibold">Possible Duplicate Warning:</p>
                                {item.duplicateWarning?.map((w, idx) => (
                                  <p key={idx} className="text-muted-foreground text-[11px]">
                                    • {w.reason === 'import_hash_match'
                                      ? 'Identical import hash already exists in ledger.'
                                      : 'Similar transaction detected with matching amount and date.'}
                                  </p>
                                ))}
                              </TooltipContent>
                            </Tooltip>
                          ) : item.status === 'duplicate' ? (
                            <Badge variant="destructive" className="text-[10px]">
                              Duplicate
                            </Badge>
                          ) : (
                            <span className="text-[11px] text-muted-foreground font-mono">Clean</span>
                          )}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>

        {/* Rule Learning Dialog */}
        <Dialog open={Boolean(rulePrompt)} onOpenChange={(open) => !open && setRulePrompt(null)}>
          <DialogContent className="sm:max-w-md">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <LightbulbIcon className="size-5 text-amber-500" />
                Learn Categorization Rule?
              </DialogTitle>
              <DialogDescription>
                You changed the category for <strong>&quot;{rulePrompt?.payee}&quot;</strong> to{' '}
                <strong>&quot;{rulePrompt?.categoryName}&quot;</strong>.
              </DialogDescription>
            </DialogHeader>
            <div className="py-2 text-xs text-muted-foreground">
              Would you like to automatically assign <strong>&quot;{rulePrompt?.categoryName}&quot;</strong> whenever transactions from <strong>&quot;{rulePrompt?.payee}&quot;</strong> are ingested in the future?
            </div>
            <DialogFooter>
              <Button variant="ghost" size="sm" onClick={() => setRulePrompt(null)}>
                Skip
              </Button>
              <Button size="sm" onClick={handleLearnRule}>
                Always Use This Category
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </TooltipProvider>
  );
}
