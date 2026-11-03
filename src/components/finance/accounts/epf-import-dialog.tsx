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
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import {
  AlertCircleIcon,
  CheckCircle2Icon,
  DownloadIcon,
  FileTextIcon,
  PlusIcon,
  Trash2Icon,
  UploadIcon,
  XCircleIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { formatINR } from '../shared/format';
import type {
  PfEntryKind,
  PfParsedRowDTO,
  PreviewPfPassbookResultDTO,
  CommitPfPassbookResultDTO,
} from '@src/lib/finance/contract';

interface EpfImportDialogProps {
  accountId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onSuccess: (result: CommitPfPassbookResultDTO) => void;
}

const ENTRY_KINDS: Array<{ value: PfEntryKind; label: string }> = [
  { value: 'contribution', label: 'Monthly Contribution' },
  { value: 'transfer_in_principal', label: 'Transfer In (Principal)' },
  { value: 'transfer_in_interest', label: 'Transfer In (Interest)' },
  { value: 'interest_credit', label: 'Interest Credit' },
  { value: 'withdrawal', label: 'Withdrawal / Claim' },
  { value: 'opening', label: 'Opening Balance' },
];

export function EpfImportDialog({
  accountId,
  open,
  onOpenChange,
  onSuccess,
}: EpfImportDialogProps) {
  const [tab, setTab] = useState<'paste' | 'csv' | 'preview'>('paste');
  const [pastedText, setPastedText] = useState('');
  const [isLoadingPreview, setIsLoadingPreview] = useState(false);
  const [isCommitting, setIsCommitting] = useState(false);
  const [forceMismatch, setForceMismatch] = useState(false);
  const [setClosingAnchor, setSetClosingAnchor] = useState(true);

  const [previewResult, setPreviewResult] = useState<PreviewPfPassbookResultDTO | null>(null);
  const [editableRows, setEditableRows] = useState<PfParsedRowDTO[]>([]);

  const handleDownloadTemplate = () => {
    window.open('/api/finance/pf/template.csv', '_blank');
  };

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (event) => {
      const content = String(event.target?.result || '');
      void generatePreview({ csvContent: content });
    };
    reader.readAsText(file);
  };

  const generatePreview = async (input: { rawText?: string; csvContent?: string }) => {
    try {
      setIsLoadingPreview(true);
      const res = await fetch(`/api/finance/accounts/${accountId}/pf/preview`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Failed to preview passbook');
      }

      const data: PreviewPfPassbookResultDTO = await res.json();
      setPreviewResult(data);
      setEditableRows(data.rows);
      setTab('preview');
      setForceMismatch(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview error');
    } finally {
      setIsLoadingPreview(false);
    }
  };

  const handleRowChange = (index: number, updates: Partial<PfParsedRowDTO>) => {
    setEditableRows((prev) => {
      const copy = [...prev];
      copy[index] = { ...copy[index], ...updates };
      if (updates.entryKind && copy[index].requiresClassification) {
        copy[index].requiresClassification = false;
      }
      return copy;
    });
  };

  const handleAddManualRow = () => {
    const newRow: PfParsedRowDTO = {
      entryKind: 'contribution',
      periodMonth: new Date().toISOString().slice(0, 7),
      postedDate: new Date().toISOString().slice(0, 10),
      dateApprox: false,
      epfWages: 0,
      epsWages: 0,
      employeeAmount: 0,
      employerAmount: 0,
      pensionAmount: 0,
      sourceLabel: null,
      note: 'Manual entry',
      requiresClassification: false,
    };
    setEditableRows((prev) => [newRow, ...prev]);
  };

  const handleDeleteRow = (index: number) => {
    setEditableRows((prev) => prev.filter((_, idx) => idx !== index));
  };

  const unresolvedCount = editableRows.filter((r) => r.requiresClassification).length;

  // Recomputed totals from editable rows
  const computedTotals = React.useMemo(() => {
    let emp = 0;
    let emplyr = 0;
    let pen = 0;

    for (const r of editableRows) {
      if (r.entryKind === 'withdrawal') {
        emp -= Math.abs(r.employeeAmount);
        emplyr -= Math.abs(r.employerAmount);
        pen -= Math.abs(r.pensionAmount);
      } else {
        emp += r.employeeAmount;
        emplyr += r.employerAmount;
        pen += r.pensionAmount;
      }
    }

    return { employee: emp, employer: emplyr, pension: pen, total: emp + emplyr + pen };
  }, [editableRows]);

  const hasTotalsMismatch =
    previewResult?.reconciliation?.parsedTotals?.closingBalance &&
    !previewResult.reconciliation.isMatched;

  const handleCommit = async () => {
    if (unresolvedCount > 0) {
      toast.error(`Please classify all ${unresolvedCount} unresolved row(s) before importing`);
      return;
    }

    if (hasTotalsMismatch && !forceMismatch) {
      toast.error('Passbook totals do not match computed totals. Check "Import anyway" to proceed.');
      return;
    }

    try {
      setIsCommitting(true);
      const res = await fetch(`/api/finance/accounts/${accountId}/pf/commit`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          entries: editableRows,
          setClosingBalanceAnchor: setClosingAnchor,
          forceMismatch,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.message || 'Commit failed');
      }

      const result: CommitPfPassbookResultDTO = await res.json();
      toast.success(
        `Imported passbook: ${result.added} added, ${result.updated} updated, ${result.unchanged} unchanged`
      );

      if (result.removedCandidateKeys?.length > 0) {
        toast.info(
          `${result.removedCandidateKeys.length} older row(s) in this FY were not present in the new passbook and were kept unchanged.`
        );
      }

      onSuccess(result);
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setIsCommitting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl max-h-[90vh] flex flex-col p-6 overflow-hidden">
        <DialogHeader>
          <div className="flex items-center justify-between">
            <div>
              <DialogTitle className="text-lg font-bold">Import from EPFO Passbook</DialogTitle>
              <DialogDescription className="text-xs text-muted-foreground mt-0.5">
                Paste portal text, upload passbook CSV, or review entries before atomic commit
              </DialogDescription>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="gap-1.5 text-xs h-8"
              onClick={handleDownloadTemplate}
            >
              <DownloadIcon className="size-3.5" />
              <span>CSV Template</span>
            </Button>
          </div>
        </DialogHeader>

        <Tabs value={tab} onValueChange={(v) => setTab(v as typeof tab)} className="flex-1 min-h-0 flex flex-col mt-2">
          <TabsList className="grid grid-cols-3 w-full h-9">
            <TabsTrigger value="paste" className="text-xs gap-1.5">
              <FileTextIcon className="size-3.5" />
              <span>Paste Portal Text</span>
            </TabsTrigger>
            <TabsTrigger value="csv" className="text-xs gap-1.5">
              <UploadIcon className="size-3.5" />
              <span>Upload CSV</span>
            </TabsTrigger>
            <TabsTrigger value="preview" className="text-xs gap-1.5" disabled={editableRows.length === 0}>
              <span>Preview & Reconcile ({editableRows.length})</span>
            </TabsTrigger>
          </TabsList>

          {/* Paste Tab */}
          <TabsContent value="paste" className="flex-1 flex flex-col gap-3 py-2">
            <p className="text-xs text-muted-foreground">
              Copy the passbook table rows directly from your EPFO Member Portal and paste below.
              Tab and multi-space separation, currency symbols (₹), and lakh commas are supported.
            </p>
            <Textarea
              placeholder={`Cont. for the Due-Month 202605    ₹ 28,000    ₹ 15,000    ₹ 3,360    ₹ 2,110    ₹ 1,250\nTRANSFER CLAIM - PRINCIPAL AMOUNT | SOURCE MEMBER ID: MHBAN000...    ₹ 13,932    ₹ 4,257    ₹ 7,500`}
              value={pastedText}
              onChange={(e) => setPastedText(e.target.value)}
              className="flex-1 min-h-[220px] font-mono text-xs"
            />
            <div className="flex justify-end gap-2">
              <Button
                type="button"
                size="sm"
                disabled={!pastedText.trim() || isLoadingPreview}
                onClick={() => generatePreview({ rawText: pastedText })}
              >
                {isLoadingPreview ? 'Parsing...' : 'Parse & Preview'}
              </Button>
            </div>
          </TabsContent>

          {/* CSV Upload Tab */}
          <TabsContent value="csv" className="flex-1 flex flex-col gap-4 py-4">
            <div className="border-2 border-dashed rounded-xl p-8 flex flex-col items-center justify-center text-center gap-3">
              <UploadIcon className="size-8 text-muted-foreground/60" />
              <div>
                <h4 className="text-sm font-semibold">Upload EPFO Passbook CSV</h4>
                <p className="text-xs text-muted-foreground mt-1">
                  Format: entry_kind, period_month, posted_date, source_label, epf_wages, eps_wages, employee, employer, pension
                </p>
              </div>
              <label className="cursor-pointer">
                <Input
                  type="file"
                  accept=".csv,text/csv"
                  className="hidden"
                  onChange={handleFileUpload}
                />
                <Button type="button" variant="outline" size="sm" render={<span />} nativeButton={false}>
                  Select CSV File
                </Button>
              </label>
            </div>
          </TabsContent>

          {/* Preview & Reconcile Tab */}
          <TabsContent value="preview" className="flex-1 min-h-0 flex flex-col gap-3 overflow-hidden">
            {/* Reconciliation Strip */}
            <div className="p-3 rounded-lg border bg-muted/30 flex flex-wrap items-center justify-between gap-3 text-xs">
              <div className="flex items-center gap-3">
                <div className="flex items-center gap-1.5">
                  {hasTotalsMismatch ? (
                    <XCircleIcon className="size-4 text-destructive" />
                  ) : (
                    <CheckCircle2Icon className="size-4 text-emerald-500" />
                  )}
                  <span className="font-semibold">
                    {hasTotalsMismatch ? 'Reconciliation Mismatch' : 'Passbook Reconciled'}
                  </span>
                </div>
                <div className="text-muted-foreground">
                  PF Total:{' '}
                  <span className="font-bold text-foreground">
                    {formatINR(computedTotals.employee + computedTotals.employer)}
                  </span>
                  {' • '}
                  EPS Memo:{' '}
                  <span className="font-bold text-foreground">
                    {formatINR(computedTotals.pension)}
                  </span>
                </div>
              </div>

              {unresolvedCount > 0 && (
                <Badge variant="destructive" className="gap-1 text-[11px]">
                  <AlertCircleIcon className="size-3" />
                  <span>{unresolvedCount} unclassified row(s)</span>
                </Badge>
              )}

              <Button
                type="button"
                variant="outline"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={handleAddManualRow}
              >
                <PlusIcon className="size-3" />
                <span>Add Row</span>
              </Button>
            </div>

            {hasTotalsMismatch && (
              <div className="p-2.5 rounded-lg border border-destructive/40 bg-destructive/5 text-destructive text-xs flex items-center justify-between">
                <div>
                  <strong>Discrepancy detected:</strong> Passbook totals differ from row sum.
                  {previewResult?.reconciliation?.diff && (
                    <span className="ml-2 font-mono">
                      (Diff: Emp {formatINR(previewResult.reconciliation.diff.employee)}, Emplyr {formatINR(previewResult.reconciliation.diff.employer)}, EPS {formatINR(previewResult.reconciliation.diff.pension)})
                    </span>
                  )}
                </div>
                <label className="flex items-center gap-1.5 cursor-pointer font-medium">
                  <Checkbox
                    checked={forceMismatch}
                    onCheckedChange={(c) => setForceMismatch(Boolean(c))}
                  />
                  <span>Import anyway</span>
                </label>
              </div>
            )}

            {/* Editable Grid */}
            <div className="flex-1 min-h-0 border rounded-lg overflow-auto text-xs">
              <table className="w-full border-collapse">
                <thead className="bg-muted/50 sticky top-0 border-b text-muted-foreground">
                  <tr>
                    <th className="p-2 text-left font-medium">Type</th>
                    <th className="p-2 text-left font-medium">Period</th>
                    <th className="p-2 text-left font-medium">Date</th>
                    <th className="p-2 text-right font-medium">Employee</th>
                    <th className="p-2 text-right font-medium">Employer</th>
                    <th className="p-2 text-right font-medium">Pension (EPS)</th>
                    <th className="p-2 text-left font-medium">Source / Label</th>
                    <th className="p-2 text-center font-medium w-8"></th>
                  </tr>
                </thead>
                <tbody className="divide-y">
                  {editableRows.map((row, idx) => (
                    <tr
                      key={idx}
                      className={row.requiresClassification ? 'bg-amber-500/10' : undefined}
                    >
                      <td className="p-2">
                        <Select
                          value={row.entryKind}
                          onValueChange={(val) =>
                            handleRowChange(idx, { entryKind: val as PfEntryKind })
                          }
                        >
                          <SelectTrigger className="h-7 text-xs w-44">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {ENTRY_KINDS.map((k) => (
                              <SelectItem key={k.value} value={k.value} className="text-xs">
                                {k.label}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-7 text-xs w-24 font-mono"
                          value={row.periodMonth || ''}
                          placeholder="YYYY-MM"
                          onChange={(e) => handleRowChange(idx, { periodMonth: e.target.value })}
                        />
                      </td>
                      <td className="p-2">
                        <Input
                          className="h-7 text-xs w-28 font-mono"
                          value={row.postedDate || ''}
                          placeholder="YYYY-MM-DD"
                          onChange={(e) => handleRowChange(idx, { postedDate: e.target.value })}
                        />
                      </td>
                      <td className="p-2 text-right font-mono font-medium">
                        {formatINR(row.employeeAmount)}
                      </td>
                      <td className="p-2 text-right font-mono font-medium">
                        {formatINR(row.employerAmount)}
                      </td>
                      <td className="p-2 text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                        {formatINR(row.pensionAmount)}
                      </td>
                      <td className="p-2 text-muted-foreground truncate max-w-[160px]">
                        {row.sourceLabel || '-'}
                      </td>
                      <td className="p-2 text-center">
                        <Button
                          type="button"
                          variant="ghost"
                          size="icon"
                          className="size-6 text-muted-foreground hover:text-destructive"
                          onClick={() => handleDeleteRow(idx)}
                        >
                          <Trash2Icon className="size-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {/* Anchor Option */}
            <div className="flex items-center justify-between pt-2 border-t text-xs">
              <label className="flex items-center gap-2 cursor-pointer font-medium">
                <Checkbox
                  checked={setClosingAnchor}
                  onCheckedChange={(c) => setSetClosingAnchor(Boolean(c))}
                />
                <span>
                  Set closing balance ({formatINR(computedTotals.employee + computedTotals.employer)}) as the valuation anchor
                </span>
              </label>
              <div className="text-muted-foreground text-[11px]">
                {editableRows.length} rows ready
              </div>
            </div>
          </TabsContent>
        </Tabs>

        {tab === 'preview' && (
          <DialogFooter className="mt-4 pt-3 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setTab('paste')}
            >
              Back
            </Button>
            <Button
              type="button"
              size="sm"
              disabled={isCommitting || unresolvedCount > 0 || (hasTotalsMismatch && !forceMismatch)}
              onClick={handleCommit}
            >
              {isCommitting ? 'Importing...' : 'Commit Passbook'}
            </Button>
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  );
}
