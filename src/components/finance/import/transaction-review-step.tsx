'use client';

import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  ArrowLeftIcon,
  CheckCircle2Icon,
  CopyIcon,
  PlusCircleIcon,
  SearchIcon,
  SparklesIcon,
  XCircleIcon,
} from 'lucide-react';
import { formatINR } from '@src/components/finance/shared/format';
import type { ParsedImportRow } from '@src/lib/finance/import/types';
import type { CategoryDTO } from '@src/lib/finance/contract';

interface TransactionReviewStepProps {
  rows: ParsedImportRow[];
  categories: CategoryDTO[];
  accountName: string;
  isSubmitting: boolean;
  onRowsChange: (rows: ParsedImportRow[]) => void;
  onBack: () => void;
  onCommit: () => void;
  onAddRule: (keyword: string, categoryId: string) => void;
}

export function TransactionReviewStep({
  rows,
  categories,
  accountName,
  isSubmitting,
  onRowsChange,
  onBack,
  onCommit,
  onAddRule,
}: TransactionReviewStepProps) {
  const [filterTab, setFilterTab] = useState<'all' | 'valid' | 'duplicates' | 'errors'>('all');
  const [search, setSearch] = useState('');
  const [savedRulePayee, setSavedRulePayee] = useState<string | null>(null);

  // Summary counts
  const summary = useMemo(() => {
    let valid = 0;
    let duplicates = 0;
    let errors = 0;
    let included = 0;
    let totalInflow = 0;
    let totalOutflow = 0;

    for (const r of rows) {
      if (!r.isValid) errors++;
      else if (r.isDuplicate) duplicates++;
      else valid++;

      if (r.included && r.isValid) {
        included++;
        if (r.type === 'income') {
          totalInflow += r.amountPaise;
        } else {
          totalOutflow += r.amountPaise;
        }
      }
    }

    return {
      total: rows.length,
      valid,
      duplicates,
      errors,
      included,
      totalInflow,
      totalOutflow,
      netChange: totalInflow - totalOutflow,
    };
  }, [rows]);

  // Filtered rows
  const visibleRows = useMemo(() => {
    return rows.filter((r) => {
      // Tab filter
      if (filterTab === 'valid' && (!r.isValid || r.isDuplicate)) return false;
      if (filterTab === 'duplicates' && !r.isDuplicate) return false;
      if (filterTab === 'errors' && r.isValid) return false;

      // Search query
      if (search.trim()) {
        const q = search.toLowerCase();
        const desc = r.description.toLowerCase();
        const date = (r.date || r.rawDate || '').toLowerCase();
        const amt = (r.amountPaise / 100).toString();
        if (!desc.includes(q) && !date.includes(q) && !amt.includes(q)) {
          return false;
        }
      }

      return true;
    });
  }, [rows, filterTab, search]);

  // Toggles single row inclusion
  const handleToggleRow = (id: string) => {
    onRowsChange(
      rows.map((r) => {
        if (r.id === id) {
          if (!r.isValid) return r; // Cannot include invalid rows
          return { ...r, included: !r.included };
        }
        return r;
      })
    );
  };

  // Bulk inclusion
  const handleSelectAll = (select: boolean) => {
    onRowsChange(
      rows.map((r) => {
        if (!r.isValid) return { ...r, included: false };
        return { ...r, included: select };
      })
    );
  };

  const handleExcludeDuplicates = () => {
    onRowsChange(
      rows.map((r) => {
        if (r.isDuplicate || !r.isValid) return { ...r, included: false };
        return { ...r, included: true };
      })
    );
  };

  // Inline category update
  const handleCategoryChange = (rowId: string, newCategoryId: string) => {
    onRowsChange(
      rows.map((r) => (r.id === rowId ? { ...r, selectedCategoryId: newCategoryId || null } : r))
    );
  };

  // Rule creation from row payee
  const handleCreateRuleForKeyword = (keyword: string, categoryId: string) => {
    if (!keyword || !categoryId) return;
    onAddRule(keyword.toLowerCase().trim(), categoryId);

    // Apply immediately to all rows containing this keyword
    const lowerKw = keyword.toLowerCase().trim();
    onRowsChange(
      rows.map((r) => {
        if (r.description.toLowerCase().includes(lowerKw)) {
          return {
            ...r,
            selectedCategoryId: categoryId,
            categoryRuleMatched: keyword,
          };
        }
        return r;
      })
    );

    setSavedRulePayee(keyword);
    setTimeout(() => setSavedRulePayee(null), 3000);
  };

  return (
    <div className="space-y-6">
      {/* Top Header & Commit Action Bar */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Step 3: Review & Categorize</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Target account: <span className="font-medium text-foreground">{accountName}</span>. Review transactions, inline-edit categories, and verify duplicates.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack} disabled={isSubmitting}>
            <ArrowLeftIcon className="h-4 w-4 mr-1.5" />
            Back to Mapping
          </Button>
          <Button
            size="sm"
            onClick={onCommit}
            disabled={isSubmitting || summary.included === 0}
            className="bg-primary text-primary-foreground font-medium shadow-xs"
          >
            {isSubmitting ? (
              'Importing in 1 Transaction...'
            ) : (
              `Import ${summary.included} Transactions`
            )}
          </Button>
        </div>
      </div>

      {/* Summary KPI Strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-3">
        <div className="rounded-lg border p-3 bg-card">
          <span className="text-[11px] text-muted-foreground uppercase font-medium">Total In File</span>
          <p className="text-lg font-semibold mt-1">{summary.total}</p>
        </div>

        <div className="rounded-lg border p-3 bg-card border-emerald-500/20">
          <span className="text-[11px] text-emerald-600 dark:text-emerald-400 uppercase font-medium flex items-center gap-1">
            <CheckCircle2Icon className="h-3 w-3" /> Ready
          </span>
          <p className="text-lg font-semibold text-emerald-600 dark:text-emerald-400 mt-1">{summary.valid}</p>
        </div>

        <div className="rounded-lg border p-3 bg-card border-amber-500/20">
          <span className="text-[11px] text-amber-600 dark:text-amber-400 uppercase font-medium flex items-center gap-1">
            <CopyIcon className="h-3 w-3" /> Duplicates
          </span>
          <p className="text-lg font-semibold text-amber-600 dark:text-amber-400 mt-1">{summary.duplicates}</p>
        </div>

        <div className="rounded-lg border p-3 bg-card border-rose-500/20">
          <span className="text-[11px] text-rose-600 dark:text-rose-400 uppercase font-medium flex items-center gap-1">
            <XCircleIcon className="h-3 w-3" /> Errors
          </span>
          <p className="text-lg font-semibold text-rose-600 dark:text-rose-400 mt-1">{summary.errors}</p>
        </div>

        <div className="rounded-lg border p-3 bg-card col-span-2 sm:col-span-2">
          <span className="text-[11px] text-muted-foreground uppercase font-medium">Net Selected Inflow/Outflow</span>
          <div className="flex items-center gap-2 mt-1">
            <span className="text-sm font-semibold text-emerald-600 dark:text-emerald-400">
              +{formatINR(summary.totalInflow)}
            </span>
            <span className="text-xs text-muted-foreground">/</span>
            <span className="text-sm font-semibold text-rose-600 dark:text-rose-400">
              -{formatINR(summary.totalOutflow)}
            </span>
          </div>
        </div>
      </div>

      {savedRulePayee && (
        <div className="rounded-md bg-emerald-500/10 border border-emerald-500/20 p-2.5 text-xs text-emerald-600 dark:text-emerald-400 flex items-center gap-2">
          <SparklesIcon className="h-4 w-4 shrink-0" />
          Learned and saved auto-categorization rule for &quot;{savedRulePayee}&quot;. Matching rows updated!
        </div>
      )}

      {/* Filter and Selection Controls */}
      <div className="flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3 pt-2">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            variant={filterTab === 'all' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterTab('all')}
            className="text-xs h-8"
          >
            All ({summary.total})
          </Button>
          <Button
            variant={filterTab === 'valid' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterTab('valid')}
            className="text-xs h-8 text-emerald-600 dark:text-emerald-400"
          >
            Ready to Import ({summary.valid})
          </Button>
          <Button
            variant={filterTab === 'duplicates' ? 'secondary' : 'ghost'}
            size="sm"
            onClick={() => setFilterTab('duplicates')}
            className="text-xs h-8 text-amber-600 dark:text-amber-400"
          >
            Duplicates ({summary.duplicates})
          </Button>
          {summary.errors > 0 && (
            <Button
              variant={filterTab === 'errors' ? 'secondary' : 'ghost'}
              size="sm"
              onClick={() => setFilterTab('errors')}
              className="text-xs h-8 text-rose-600 dark:text-rose-400"
            >
              Errors ({summary.errors})
            </Button>
          )}
        </div>

        <div className="flex items-center gap-2">
          <div className="relative w-full md:w-56">
            <SearchIcon className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              type="text"
              placeholder="Search narration..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="pl-8 h-8 text-xs bg-card"
            />
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSelectAll(true)}
            className="text-xs h-8 whitespace-nowrap"
          >
            Select All
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExcludeDuplicates}
            className="text-xs h-8 whitespace-nowrap"
          >
            Exclude Dups
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => handleSelectAll(false)}
            className="text-xs h-8 whitespace-nowrap"
          >
            Deselect All
          </Button>
        </div>
      </div>

      {/* Review Table */}
      <div className="overflow-x-auto rounded-lg border bg-card">
        <table className="w-full text-xs text-left">
          <thead className="bg-muted/60 text-muted-foreground border-b font-medium">
            <tr>
              <th className="p-3 w-10 text-center">
                <span className="sr-only">Include</span>
              </th>
              <th className="p-3 w-28 whitespace-nowrap">Date</th>
              <th className="p-3 min-w-[240px]">Description</th>
              <th className="p-3 w-24">Type</th>
              <th className="p-3 w-28 text-right">Amount</th>
              <th className="p-3 min-w-[200px]">Category & Rule</th>
              <th className="p-3 w-32">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {visibleRows.length === 0 ? (
              <tr>
                <td colSpan={7} className="p-8 text-center text-muted-foreground">
                  No transactions match the selected filter or search query.
                </td>
              </tr>
            ) : (
              visibleRows.map((row) => (
                <tr
                  key={row.id}
                  className={`hover:bg-muted/40 transition-colors ${
                    !row.included ? 'opacity-60 bg-muted/10' : ''
                  } ${!row.isValid ? 'bg-rose-500/5' : ''}`}
                >
                  {/* Checkbox */}
                  <td className="p-3 text-center">
                    <input
                      type="checkbox"
                      checked={row.included}
                      disabled={!row.isValid}
                      onChange={() => handleToggleRow(row.id)}
                      className="rounded border-input text-primary focus:ring-primary h-4 w-4 cursor-pointer disabled:cursor-not-allowed"
                    />
                  </td>

                  {/* Date */}
                  <td className="p-3 font-mono text-[11px] whitespace-nowrap">
                    {row.date || (
                      <span className="text-rose-500 font-sans italic">{row.rawDate || 'Missing'}</span>
                    )}
                  </td>

                  {/* Description */}
                  <td className="p-3">
                    <div className="font-medium text-foreground text-xs leading-snug">
                      {row.description}
                    </div>
                    {row.balancePaise !== null && (
                      <div className="text-[10px] text-muted-foreground mt-0.5">
                        Balance after: {formatINR(row.balancePaise)}
                      </div>
                    )}
                  </td>

                  {/* Type */}
                  <td className="p-3 whitespace-nowrap">
                    {row.type === 'income' ? (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 font-medium">
                        Income
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-muted text-muted-foreground font-medium">
                        Expense
                      </Badge>
                    )}
                  </td>

                  {/* Amount */}
                  <td className="p-3 text-right font-mono font-medium whitespace-nowrap">
                    {row.isValid ? (
                      <span className={row.type === 'income' ? 'text-emerald-600 dark:text-emerald-400 font-semibold' : 'text-foreground'}>
                        {row.type === 'income' ? '+' : '-'}
                        {formatINR(row.amountPaise)}
                      </span>
                    ) : (
                      <span className="text-rose-500 italic text-[11px]">Invalid</span>
                    )}
                  </td>

                  {/* Category Inline Dropdown */}
                  <td className="p-3">
                    <div className="flex flex-col gap-1.5">
                      <select
                        aria-label={`Category for ${row.description}`}
                        value={row.selectedCategoryId || ''}
                        disabled={!row.isValid}
                        onChange={(e) => handleCategoryChange(row.id, e.target.value)}
                        className="w-full h-8 text-xs rounded-md border border-input bg-background px-2.5 focus:ring-1 focus:ring-primary focus:outline-hidden"
                      >
                        <option value="">-- Uncategorized --</option>
                        {categories.map((c) => (
                          <option key={c.id} value={c.id}>
                            {c.name} ({c.type})
                          </option>
                        ))}
                      </select>

                      {/* Rule Badge & Option to save rule */}
                      <div className="flex items-center gap-1.5 flex-wrap">
                        {row.categoryRuleMatched && (
                          <span className="inline-flex items-center gap-1 text-[10px] text-primary/80 bg-primary/10 px-1.5 py-0.5 rounded font-mono">
                            <SparklesIcon className="h-2.5 w-2.5" />
                            Matched: &quot;{row.categoryRuleMatched}&quot;
                          </span>
                        )}

                        {row.selectedCategoryId && !row.categoryRuleMatched && row.description.length >= 3 && (
                          <button
                            type="button"
                            onClick={() =>
                              handleCreateRuleForKeyword(
                                row.description.split(/[\s/,-]+/)[0] || row.description.slice(0, 15),
                                row.selectedCategoryId!
                              )
                            }
                            className="inline-flex items-center gap-1 text-[10px] text-muted-foreground hover:text-primary transition-colors cursor-pointer"
                          >
                            <PlusCircleIcon className="h-2.5 w-2.5" />
                            Always categorize this
                          </button>
                        )}
                      </div>
                    </div>
                  </td>

                  {/* Status */}
                  <td className="p-3 whitespace-nowrap">
                    {!row.isValid ? (
                      <Badge variant="destructive" className="text-[10px] gap-1 font-normal" title={row.error}>
                        <XCircleIcon className="h-3 w-3" />
                        {row.error?.slice(0, 18) || 'Error'}
                      </Badge>
                    ) : row.isDuplicate ? (
                      <Badge variant="outline" className="text-[10px] bg-amber-500/10 text-amber-600 dark:text-amber-400 border-amber-500/30 gap-1 font-normal">
                        <CopyIcon className="h-3 w-3" />
                        {row.duplicateReason === 'file_duplicate' ? 'Duplicate (File)' : 'Duplicate (DB)'}
                      </Badge>
                    ) : (
                      <Badge variant="outline" className="text-[10px] bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border-emerald-500/20 gap-1 font-normal">
                        <CheckCircle2Icon className="h-3 w-3" />
                        Ready
                      </Badge>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
