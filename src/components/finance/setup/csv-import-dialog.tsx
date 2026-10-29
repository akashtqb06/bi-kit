'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DownloadIcon,
  UploadIcon,
  AlertCircleIcon,
  CheckCircle2Icon,
  FileSpreadsheetIcon,
} from 'lucide-react';
import { parseAccountsCSV, type CSVParseResult } from '@src/lib/finance/setup/csv';
import type { DraftAccount } from '@src/lib/finance/setup/types';
import { formatINR } from '../shared/format';

interface CSVImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (importedAccounts: DraftAccount[]) => void;
}

export function CSVImportDialog({
  open,
  onOpenChange,
  onImport,
}: CSVImportDialogProps) {
  const [csvText, setCsvText] = useState('');
  const [parseResult, setParseResult] = useState<CSVParseResult | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setFileName(file.name);
    const reader = new FileReader();
    reader.onload = (event) => {
      const content = event.target?.result as string;
      setCsvText(content);
      const res = parseAccountsCSV(content);
      setParseResult(res);
    };
    reader.readAsText(file);
  };

  const handleTextChange = (text: string) => {
    setCsvText(text);
    if (!text.trim()) {
      setParseResult(null);
      return;
    }
    const res = parseAccountsCSV(text);
    setParseResult(res);
  };

  const handleConfirm = () => {
    if (!parseResult || parseResult.accounts.length === 0) return;
    onImport(parseResult.accounts);
    onOpenChange(false);
    // Reset state
    setCsvText('');
    setParseResult(null);
    setFileName(null);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center justify-between">
            <span className="flex items-center gap-2">
              <FileSpreadsheetIcon className="size-4 text-primary" />
              <span>Import Accounts from CSV</span>
            </span>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs gap-1.5"
              render={<a href="/finance/setup/template.csv" download="accounts-setup-template.csv" />}
              nativeButton={false}
            >
              <DownloadIcon className="size-3" />
              <span>Download Template</span>
            </Button>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 pt-2">
          {/* File Upload / Drop Area */}
          <div className="p-4 rounded-xl border-2 border-dashed bg-muted/20 text-center space-y-2">
            <UploadIcon className="size-6 text-muted-foreground mx-auto" />
            <div className="text-xs">
              <label
                htmlFor="csv-file-input"
                className="font-semibold text-primary cursor-pointer hover:underline"
              >
                Choose a CSV file
              </label>{' '}
              <span className="text-muted-foreground">or drag and drop</span>
              <input
                id="csv-file-input"
                type="file"
                accept=".csv"
                onChange={handleFileUpload}
                className="hidden"
              />
            </div>
            {fileName && (
              <p className="text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                Selected: {fileName}
              </p>
            )}
            <p className="text-[11px] text-muted-foreground">
              Supports ₹ symbols, commas, Indian lakh grouping (e.g. 1,25,000.00), and (parentheses) negatives.
            </p>
          </div>

          {/* Paste CSV option */}
          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground">
              Or paste CSV text directly:
            </label>
            <textarea
              rows={4}
              value={csvText}
              onChange={(e) => handleTextChange(e.target.value)}
              placeholder="Name,Kind,Balance,Owed,Credit Limit..."
              className="w-full text-xs font-mono p-2.5 rounded-lg border bg-background resize-y focus:outline-hidden focus:ring-1 focus:ring-primary"
            />
          </div>

          {/* Dry Run Preview / Errors */}
          {parseResult && (
            <div className="space-y-3">
              {/* Errors banner */}
              {parseResult.errors.length > 0 && (
                <div className="p-3 rounded-lg bg-destructive/10 border border-destructive/20 space-y-1.5 text-xs text-destructive">
                  <div className="font-semibold flex items-center gap-1.5">
                    <AlertCircleIcon className="size-4 shrink-0" />
                    <span>{parseResult.errors.length} row warning(s) found:</span>
                  </div>
                  <ul className="list-disc list-inside space-y-0.5 text-[11px] max-h-28 overflow-y-auto pl-1">
                    {parseResult.errors.map((err, i) => (
                      <li key={i}>
                        Row {err.row}: {err.message}
                      </li>
                    ))}
                  </ul>
                </div>
              )}

              {/* Preview Table */}
              <div className="space-y-1.5">
                <div className="flex items-center justify-between text-xs font-semibold text-foreground">
                  <span className="flex items-center gap-1.5">
                    <CheckCircle2Icon className="size-3.5 text-emerald-500" />
                    <span>Preview Parsed Accounts ({parseResult.accounts.length})</span>
                  </span>
                </div>

                {parseResult.accounts.length === 0 ? (
                  <p className="text-xs text-muted-foreground italic py-2">
                    No valid accounts found in this CSV. Please check formatting or download the template.
                  </p>
                ) : (
                  <div className="border rounded-lg overflow-x-auto max-h-48 text-xs">
                    <table className="w-full text-left">
                      <thead className="bg-muted/50 border-b text-[11px] text-muted-foreground">
                        <tr>
                          <th className="p-2">Name</th>
                          <th className="p-2">Kind</th>
                          <th className="p-2">Institution</th>
                          <th className="p-2 text-right">Balance / Owed</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y">
                        {parseResult.accounts.map((acc, i) => {
                          const isLiability = acc.kind === 'credit_card' || acc.kind === 'loan';
                          return (
                            <tr key={i} className="hover:bg-muted/30">
                              <td className="p-2 font-medium text-foreground">{acc.name}</td>
                              <td className="p-2">
                                <Badge variant="outline" className="text-[10px] uppercase">
                                  {acc.kind.replace('_', ' ')}
                                </Badge>
                              </td>
                              <td className="p-2 text-muted-foreground">
                                {acc.institution || '—'}
                              </td>
                              <td className="p-2 text-right font-mono font-medium">
                                {isLiability ? (
                                  <span className="text-destructive">
                                    - {formatINR(acc.owedPaise || 0)}
                                  </span>
                                ) : (
                                  <span className="text-foreground">
                                    {formatINR(acc.balancePaise || acc.currentValuePaise || 0)}
                                  </span>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        <DialogFooter className="pt-2">
          <Button
            type="button"
            variant="outline"
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
            disabled={!parseResult || parseResult.accounts.length === 0}
            onClick={handleConfirm}
          >
            Merge {parseResult?.accounts.length || 0} Accounts into Draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
