'use client';

import React from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { ArrowLeftIcon, ArrowRightIcon, CheckCircle2Icon, SlidersHorizontalIcon } from 'lucide-react';
import type { ColumnMapping, DateFormat, NumberFormatConfig } from '@src/lib/finance/import/types';

interface ColumnMappingStepProps {
  headers: string[];
  sampleRows: Record<string, string>[];
  mapping: ColumnMapping;
  dateFormat: DateFormat;
  numberFormat: NumberFormatConfig;
  isCreditCard: boolean;
  onMappingChange: (mapping: ColumnMapping) => void;
  onDateFormatChange: (format: DateFormat) => void;
  onNumberFormatChange: (config: NumberFormatConfig) => void;
  onCreditCardChange: (isCard: boolean) => void;
  onBack: () => void;
  onProceed: () => void;
}

export function ColumnMappingStep({
  headers,
  sampleRows,
  mapping,
  dateFormat,
  numberFormat,
  isCreditCard,
  onMappingChange,
  onDateFormatChange,
  onNumberFormatChange,
  onCreditCardChange,
  onBack,
  onProceed,
}: ColumnMappingStepProps) {
  const canProceed =
    Boolean(mapping.dateColumn) &&
    Boolean(mapping.descriptionColumn) &&
    (mapping.amountMode === 'separate_debit_credit'
      ? Boolean(mapping.debitColumn || mapping.creditColumn)
      : mapping.amountMode === 'type_and_amount'
      ? Boolean(mapping.amountColumn && mapping.typeColumn)
      : Boolean(mapping.amountColumn));

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 border-b pb-4">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Step 2: Map Columns & Formats</h2>
          <p className="text-xs text-muted-foreground mt-0.5">
            Verify how columns and date/number formats in your CSV map to BI Kit transaction fields.
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" onClick={onBack}>
            <ArrowLeftIcon className="h-4 w-4 mr-1.5" />
            Back
          </Button>
          <Button
            size="sm"
            disabled={!canProceed}
            onClick={onProceed}
            className="bg-primary text-primary-foreground"
          >
            Review Transactions
            <ArrowRightIcon className="h-4 w-4 ml-1.5" />
          </Button>
        </div>
      </div>

      {/* Raw Sample Preview Table */}
      <div className="space-y-2">
        <div className="flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">
            Raw CSV Sample Preview (First {sampleRows.length} Rows)
          </span>
          <span className="text-xs text-muted-foreground">{headers.length} columns detected</span>
        </div>
        <div className="overflow-x-auto rounded-lg border bg-card/50">
          <table className="w-full text-xs text-left">
            <thead className="bg-muted/60 text-muted-foreground border-b font-medium">
              <tr>
                <th className="p-2.5 w-12 text-center text-[11px]">#</th>
                {headers.map((h) => (
                  <th key={h} className="p-2.5 whitespace-nowrap">
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y">
              {sampleRows.slice(0, 5).map((row, idx) => (
                <tr key={idx} className="hover:bg-muted/30">
                  <td className="p-2.5 text-center text-muted-foreground font-mono text-[10px]">
                    {idx + 1}
                  </td>
                  {headers.map((h) => (
                    <td key={h} className="p-2.5 font-mono text-[11px] whitespace-nowrap max-w-[220px] truncate">
                      {row[h] || <span className="text-muted-foreground/40 italic">empty</span>}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Column Mapping Selectors */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {/* Date Column */}
        <div className="rounded-lg border p-3.5 space-y-2 bg-card">
          <div className="flex items-center justify-between">
            <label htmlFor="select-date-col" className="text-xs font-semibold">Date Column *</label>
            <Badge variant="outline" className="text-[10px] text-primary">Required</Badge>
          </div>
          <Select
            value={mapping.dateColumn || undefined}
            onValueChange={(val) => onMappingChange({ ...mapping, dateColumn: val || '' })}
          >
            <SelectTrigger id="select-date-col" className="w-full h-8 text-xs bg-background">
              <SelectValue placeholder="-- Select Date Column --" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Column containing transaction date</p>
        </div>

        {/* Description Column */}
        <div className="rounded-lg border p-3.5 space-y-2 bg-card">
          <div className="flex items-center justify-between">
            <label htmlFor="select-desc-col" className="text-xs font-semibold">Description / Narration *</label>
            <Badge variant="outline" className="text-[10px] text-primary">Required</Badge>
          </div>
          <Select
            value={mapping.descriptionColumn || undefined}
            onValueChange={(val) => onMappingChange({ ...mapping, descriptionColumn: val || '' })}
          >
            <SelectTrigger id="select-desc-col" className="w-full h-8 text-xs bg-background">
              <SelectValue placeholder="-- Select Description Column --" />
            </SelectTrigger>
            <SelectContent>
              {headers.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Column containing merchant or narration details</p>
        </div>

        {/* Amount Mode */}
        <div className="rounded-lg border p-3.5 space-y-2 bg-card">
          <div className="flex items-center justify-between">
            <label htmlFor="select-amount-mode" className="text-xs font-semibold">Amount Layout *</label>
            <SlidersHorizontalIcon className="h-3.5 w-3.5 text-muted-foreground" />
          </div>
          <Select
            value={mapping.amountMode}
            onValueChange={(val) => onMappingChange({ ...mapping, amountMode: val as ColumnMapping['amountMode'] })}
          >
            <SelectTrigger id="select-amount-mode" className="w-full h-8 text-xs bg-background">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="separate_debit_credit" className="text-xs">Separate Debit & Credit Columns</SelectItem>
              <SelectItem value="single_signed" className="text-xs">Single Signed Amount Column</SelectItem>
              <SelectItem value="type_and_amount" className="text-xs">Type Column (CR/DR) + Amount Column</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">How amounts are presented in the statement</p>
        </div>

        {/* Amount Specific Columns */}
        {mapping.amountMode === 'separate_debit_credit' ? (
          <>
            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <label htmlFor="select-debit-col" className="text-xs font-semibold">Debit / Withdrawal Column</label>
              <Select
                value={mapping.debitColumn || '__none__'}
                onValueChange={(val) => onMappingChange({ ...mapping, debitColumn: (!val || val === '__none__') ? undefined : val })}
              >
                <SelectTrigger id="select-debit-col" className="w-full h-8 text-xs bg-background">
                  <SelectValue placeholder="-- None / Select Column --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">-- None / Select Column --</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Expenses and money withdrawn</p>
            </div>

            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <label htmlFor="select-credit-col" className="text-xs font-semibold">Credit / Deposit Column</label>
              <Select
                value={mapping.creditColumn || '__none__'}
                onValueChange={(val) => onMappingChange({ ...mapping, creditColumn: (!val || val === '__none__') ? undefined : val })}
              >
                <SelectTrigger id="select-credit-col" className="w-full h-8 text-xs bg-background">
                  <SelectValue placeholder="-- None / Select Column --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">-- None / Select Column --</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Income, salary and deposits received</p>
            </div>
          </>
        ) : mapping.amountMode === 'type_and_amount' ? (
          <>
            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <label htmlFor="select-type-col" className="text-xs font-semibold">Type Column (CR / DR)</label>
              <Select
                value={mapping.typeColumn || '__none__'}
                onValueChange={(val) => onMappingChange({ ...mapping, typeColumn: (!val || val === '__none__') ? undefined : val })}
              >
                <SelectTrigger id="select-type-col" className="w-full h-8 text-xs bg-background">
                  <SelectValue placeholder="-- Select Type Column --" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">-- Select Type Column --</SelectItem>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Indicator for Credit (CR) vs Debit (DR)</p>
            </div>

            <div className="rounded-lg border p-3.5 space-y-2 bg-card">
              <label htmlFor="select-amount-col-1" className="text-xs font-semibold">Amount Column</label>
              <Select
                value={mapping.amountColumn || undefined}
                onValueChange={(val) => onMappingChange({ ...mapping, amountColumn: val || undefined })}
              >
                <SelectTrigger id="select-amount-col-1" className="w-full h-8 text-xs bg-background">
                  <SelectValue placeholder="-- Select Amount Column --" />
                </SelectTrigger>
                <SelectContent>
                  {headers.map((h) => (
                    <SelectItem key={h} value={h} className="text-xs">
                      {h}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <p className="text-[11px] text-muted-foreground">Numerical value of the transaction</p>
            </div>
          </>
        ) : (
          <div className="rounded-lg border p-3.5 space-y-2 bg-card">
            <label htmlFor="select-amount-col-2" className="text-xs font-semibold">Signed Amount Column</label>
            <Select
              value={mapping.amountColumn || undefined}
              onValueChange={(val) => onMappingChange({ ...mapping, amountColumn: val || undefined })}
            >
              <SelectTrigger id="select-amount-col-2" className="w-full h-8 text-xs bg-background">
                <SelectValue placeholder="-- Select Amount Column --" />
              </SelectTrigger>
              <SelectContent>
                {headers.map((h) => (
                  <SelectItem key={h} value={h} className="text-xs">
                    {h}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-[11px] text-muted-foreground">Negative for outflow, positive for inflow</p>
          </div>
        )}

        {/* Balance Column (Optional) */}
        <div className="rounded-lg border p-3.5 space-y-2 bg-card">
          <label htmlFor="select-balance-col" className="text-xs font-semibold">Closing Balance Column (Optional)</label>
          <Select
            value={mapping.balanceColumn || '__none__'}
            onValueChange={(val) => onMappingChange({ ...mapping, balanceColumn: (!val || val === '__none__') ? undefined : val })}
          >
            <SelectTrigger id="select-balance-col" className="w-full h-8 text-xs bg-background">
              <SelectValue placeholder="-- None / Do not map --" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="__none__" className="text-xs">-- None / Do not map --</SelectItem>
              {headers.map((h) => (
                <SelectItem key={h} value={h} className="text-xs">
                  {h}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <p className="text-[11px] text-muted-foreground">Running account balance after transaction</p>
        </div>
      </div>

      {/* Date & Number Formats */}
      <div className="rounded-lg border p-4 bg-muted/20 space-y-4">
        <h3 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground flex items-center gap-2">
          <CheckCircle2Icon className="h-4 w-4 text-emerald-500" />
          Detected Formats & Parsing Conventions
        </h3>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
          {/* Date Format */}
          <div className="space-y-1.5">
            <label htmlFor="select-date-format" className="text-xs font-medium text-muted-foreground">Date Format</label>
            <Select
              value={dateFormat}
              onValueChange={(val) => onDateFormatChange(val as DateFormat)}
            >
              <SelectTrigger id="select-date-format" className="w-full h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="DD/MM/YYYY" className="text-xs">DD/MM/YYYY (e.g. 01/10/2026)</SelectItem>
                <SelectItem value="DD-MM-YYYY" className="text-xs">DD-MM-YYYY (e.g. 01-10-2026)</SelectItem>
                <SelectItem value="YYYY-MM-DD" className="text-xs">YYYY-MM-DD (e.g. 2026-10-01)</SelectItem>
                <SelectItem value="MM/DD/YYYY" className="text-xs">MM/DD/YYYY (e.g. 10/01/2026)</SelectItem>
                <SelectItem value="YYYY/MM/DD" className="text-xs">YYYY/MM/DD (e.g. 2026/10/01)</SelectItem>
                <SelectItem value="DD MMM YYYY" className="text-xs">DD MMM YYYY (e.g. 01 Oct 2026)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Decimal & Thousands */}
          <div className="space-y-1.5">
            <label htmlFor="select-decimal-separator" className="text-xs font-medium text-muted-foreground">Number Format</label>
            <Select
              value={numberFormat.decimalSeparator}
              onValueChange={(val) =>
                onNumberFormatChange({
                  decimalSeparator: val as '.' | ',',
                  thousandsSeparator: val === '.' ? ',' : '.',
                })
              }
            >
              <SelectTrigger id="select-decimal-separator" className="w-full h-8 text-xs bg-background">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="." className="text-xs">Dot Decimal (1,25,000.00 / 125,000.00)</SelectItem>
                <SelectItem value="," className="text-xs">Comma Decimal (125.000,00)</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Credit Card Convention */}
          <div className="flex items-center gap-2 pt-6">
            <label className="flex items-center gap-2 text-xs font-medium cursor-pointer">
              <input
                type="checkbox"
                checked={isCreditCard}
                onChange={(e) => onCreditCardChange(e.target.checked)}
                className="rounded border-input text-primary focus:ring-primary h-4 w-4"
              />
              Credit Card Statement (positive = charges)
            </label>
          </div>
        </div>
      </div>
    </div>
  );
}
