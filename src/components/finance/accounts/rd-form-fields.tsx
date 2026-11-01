'use client';

import React, { useMemo } from 'react';
import { cn } from 'cn';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { DatePicker } from '@/components/ui/date-picker';
import {
  rdValue,
  type RDConfig,
  type RDCompounding,
  type RDFirstInstallmentOn,
} from '@src/lib/finance/domain/rd';
import { formatINR } from '../shared/format';
import { TrendingUpIcon, InfoIcon } from 'lucide-react';

export interface RDFormFieldsProps {
  monthlyInstallmentRupees: string;
  setMonthlyInstallmentRupees: (v: string) => void;
  startDate: string;
  setStartDate: (v: string) => void;
  installmentDay: number | 'last';
  setInstallmentDay: (v: number | 'last') => void;
  firstInstallmentOn: RDFirstInstallmentOn;
  setFirstInstallmentOn: (v: RDFirstInstallmentOn) => void;
  tenureMonths: string;
  setTenureMonths: (v: string) => void;
  interestRate: string;
  setInterestRate: (v: string) => void;
  compounding: RDCompounding;
  setCompounding: (v: RDCompounding) => void;
  currentValueRupees?: string;
  setCurrentValueRupees?: (v: string) => void;
  payFromAccountId: string | null;
  setPayFromAccountId: (v: string | null) => void;
  autoDebit: boolean;
  setAutoDebit: (v: boolean) => void;
  bankAccounts?: Array<{ id: string; name: string }>;
}

const INSTALLMENT_DAY_OPTIONS: Array<{ value: string; label: string }> = [
  ...Array.from({ length: 28 }, (_, i) => {
    const d = i + 1;
    const suffix = d === 1 ? 'st' : d === 2 ? 'nd' : d === 3 ? 'rd' : 'th';
    return { value: String(d), label: `${d}${suffix} of every month` };
  }),
  { value: '29', label: '29th of every month (clamps on Feb)' },
  { value: '30', label: '30th of every month (clamps on Feb)' },
  { value: '31', label: '31st of every month (clamps on shorter months)' },
  { value: 'last', label: 'Last day of month' },
];

const COMPOUNDING_OPTIONS: Array<{ value: RDCompounding; label: string }> = [
  { value: 'quarterly', label: 'Quarterly (Indian Banking Default)' },
  { value: 'monthly', label: 'Monthly' },
  { value: 'half_yearly', label: 'Half-yearly' },
  { value: 'yearly', label: 'Yearly' },
  { value: 'simple', label: 'Simple Interest' },
];

export function RDFormFields(props: RDFormFieldsProps) {
  const {
    monthlyInstallmentRupees,
    setMonthlyInstallmentRupees,
    startDate,
    setStartDate,
    installmentDay,
    setInstallmentDay,
    firstInstallmentOn,
    setFirstInstallmentOn,
    tenureMonths,
    setTenureMonths,
    interestRate,
    setInterestRate,
    compounding,
    setCompounding,
    currentValueRupees = '',
    setCurrentValueRupees,
    payFromAccountId,
    setPayFromAccountId,
    autoDebit,
    setAutoDebit,
    bankAccounts = [],
  } = props;

  const installmentPaise = Math.round((parseFloat(monthlyInstallmentRupees) || 0) * 100);
  const tenure = parseInt(tenureMonths, 10) || 12;
  const rateNum = parseFloat(interestRate) || 6.8;
  const anchorPaise = currentValueRupees ? Math.round(parseFloat(currentValueRupees) * 100) : undefined;

  // Live preview calculation
  const preview = useMemo(() => {
    if (installmentPaise <= 0 || tenure <= 0) return null;

    const config: RDConfig = {
      monthlyInstallment: installmentPaise,
      startDate: startDate || new Date().toISOString().slice(0, 10),
      installmentDay,
      firstInstallmentOn,
      tenureMonths: tenure,
      interestRate: rateNum,
      compounding,
      installmentsMode: 'schedule',
    };

    const today = new Date().toISOString().slice(0, 10);
    const anchor = anchorPaise ? { date: today, value: anchorPaise } : undefined;
    return rdValue(config, today, anchor);
  }, [installmentPaise, startDate, installmentDay, firstInstallmentOn, tenure, rateNum, compounding, anchorPaise]);

  const previewDates = useMemo(() => {
    if (!preview || preview.schedule.length === 0) return null;
    const sched = preview.schedule;
    const firstThree = sched.slice(0, 3);
    const lastTwo = sched.length > 3 ? sched.slice(-2) : [];
    return { firstThree, lastTwo };
  }, [preview]);

  return (
    <div className="space-y-4 pt-2 border-t text-xs">
      {/* Monthly Installment & Interest Rate */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rd-inst-amount" className="font-semibold text-foreground">
            Monthly Installment (₹)
          </Label>
          <Input
            id="rd-inst-amount"
            type="number"
            min="1"
            placeholder="5000"
            className="h-9 text-xs bg-card"
            value={monthlyInstallmentRupees}
            onChange={(e) => setMonthlyInstallmentRupees(e.target.value)}
            required
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rd-interest-rate" className="font-semibold text-foreground">
            Interest Rate (% p.a.)
          </Label>
          <Input
            id="rd-interest-rate"
            type="number"
            step="0.05"
            placeholder="6.8"
            className="h-9 text-xs bg-card"
            value={interestRate}
            onChange={(e) => setInterestRate(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Start Date & Tenure */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rd-start-date" className="font-semibold text-foreground">
            Account Opening (Start Date)
          </Label>
          <DatePicker
            id="rd-start-date"
            className="h-9 text-xs bg-card"
            value={startDate}
            onChange={(d) => setStartDate(d)}
            placeholder="Select opening date"
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rd-tenure-months" className="font-semibold text-foreground">
            Tenure (Months)
          </Label>
          <Input
            id="rd-tenure-months"
            type="number"
            min="1"
            max="120"
            placeholder="12"
            className="h-9 text-xs bg-card"
            value={tenureMonths}
            onChange={(e) => setTenureMonths(e.target.value)}
            required
          />
        </div>
      </div>

      {/* Installment Day & Compounding */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="rd-installment-day" className="font-semibold text-foreground">
            Installment Day
          </Label>
          <Select
            items={INSTALLMENT_DAY_OPTIONS}
            value={String(installmentDay)}
            onValueChange={(val) => {
              if (val) setInstallmentDay(val === 'last' ? 'last' : parseInt(val, 10));
            }}
          >
            <SelectTrigger id="rd-installment-day" className="h-9 text-xs bg-card">
              <SelectValue placeholder="Select installment day" />
            </SelectTrigger>
            <SelectContent>
              {INSTALLMENT_DAY_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="rd-compounding-select" className="font-semibold text-foreground">
            Compounding Frequency
          </Label>
          <Select
            items={COMPOUNDING_OPTIONS}
            value={compounding}
            onValueChange={(val) => {
              if (val) setCompounding(val as RDCompounding);
            }}
          >
            <SelectTrigger id="rd-compounding-select" className="h-9 text-xs bg-card">
              <SelectValue placeholder="Select compounding" />
            </SelectTrigger>
            <SelectContent>
              {COMPOUNDING_OPTIONS.map((opt) => (
                <SelectItem key={opt.value} value={opt.value}>
                  {opt.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* First Installment Choice */}
      <div className="space-y-2 p-3 rounded-lg bg-muted/40 border">
        <Label className="font-semibold text-foreground">First Installment Schedule</Label>
        <div role="radiogroup" aria-label="First Installment Schedule" className="space-y-2 pt-1">
          <label
            htmlFor="rd-first-start-date"
            className={cn(
              "flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors",
              firstInstallmentOn === 'start_date' ? "bg-accent/50 border-primary/40" : "bg-card border-border hover:bg-muted/30"
            )}
          >
            <input
              type="radio"
              id="rd-first-start-date"
              name="firstInstallmentOn"
              value="start_date"
              checked={firstInstallmentOn === 'start_date'}
              onChange={() => setFirstInstallmentOn('start_date')}
              className="mt-1 h-3.5 w-3.5 text-primary border-primary focus:ring-primary"
            />
            <div className="grid gap-0.5">
              <span className="text-xs font-medium text-foreground">
                Deposit on opening date (start date)
              </span>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Installment 1 falls on the account start date. Installments 2 onwards fall on the chosen installment day in following months. (Recommended)
              </p>
            </div>
          </label>

          <label
            htmlFor="rd-first-inst-day"
            className={cn(
              "flex items-start gap-2.5 p-2 rounded-md border cursor-pointer transition-colors",
              firstInstallmentOn === 'first_installment_day' ? "bg-accent/50 border-primary/40" : "bg-card border-border hover:bg-muted/30"
            )}
          >
            <input
              type="radio"
              id="rd-first-inst-day"
              name="firstInstallmentOn"
              value="first_installment_day"
              checked={firstInstallmentOn === 'first_installment_day'}
              onChange={() => setFirstInstallmentOn('first_installment_day')}
              className="mt-1 h-3.5 w-3.5 text-primary border-primary focus:ring-primary"
            />
            <div className="grid gap-0.5">
              <span className="text-xs font-medium text-foreground">
                First installment on upcoming installment day
              </span>
              <p className="text-[11px] text-muted-foreground leading-snug">
                Installment 1 falls on the first occurrence of the installment day strictly after account opening.
              </p>
            </div>
          </label>
        </div>
      </div>

      {/* Auto-Debit Settings */}
      <div className="p-3 rounded-lg bg-muted/40 border space-y-3">
        <div className="flex items-center justify-between">
          <div className="space-y-0.5">
            <Label htmlFor="rd-autodebit-toggle" className="font-semibold text-foreground cursor-pointer">
              Auto-Debit from Bank Account
            </Label>
            <p className="text-[11px] text-muted-foreground">
              Automatically creates a recurring transfer to keep your bank balance accurate.
            </p>
          </div>
          <Switch
            id="rd-autodebit-toggle"
            checked={autoDebit}
            onCheckedChange={setAutoDebit}
          />
        </div>

        {autoDebit ? (
          <div className="space-y-1.5 pt-1">
            <Label htmlFor="rd-pay-from" className="font-medium text-foreground">
              Pay From Account
            </Label>
            <Select
              items={[
                { value: 'none', label: 'Select source bank account' },
                ...bankAccounts.map((b) => ({ value: b.id, label: b.name })),
              ]}
              value={payFromAccountId || 'none'}
              onValueChange={(val) => setPayFromAccountId(val === 'none' ? null : val)}
            >
              <SelectTrigger id="rd-pay-from" className="h-9 text-xs bg-card">
                <SelectValue placeholder="Select bank account" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="none">Select source bank account</SelectItem>
                {bankAccounts.map((b) => (
                  <SelectItem key={b.id} value={b.id}>
                    {b.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        ) : (
          <div className="flex items-center gap-2 p-2 rounded bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px]">
            <InfoIcon className="size-4 shrink-0" />
            <span>
              Auto-debit is disabled. Installments are assumed deposited on schedule for RD valuation, but no bank balance transfers will be generated.
            </span>
          </div>
        )}
      </div>

      {/* Optional Passbook Anchor */}
      {setCurrentValueRupees && (
        <div className="space-y-1.5">
          <Label htmlFor="rd-anchor-value" className="text-muted-foreground flex items-center justify-between">
            <span>Current Value as per Passbook (Optional Anchor)</span>
            <span className="text-[10px] text-muted-foreground">Overrides calculations up to today</span>
          </Label>
          <Input
            id="rd-anchor-value"
            type="number"
            placeholder="Leave blank to calculate automatically"
            className="h-9 text-xs bg-card"
            value={currentValueRupees}
            onChange={(e) => setCurrentValueRupees(e.target.value)}
          />
        </div>
      )}

      {/* Live Schedule & Valuation Preview Card */}
      {preview && previewDates && (
        <div className="p-3 rounded-lg border bg-primary/5 space-y-2.5">
          <div className="flex items-center justify-between border-b pb-1.5">
            <div className="flex items-center gap-1.5 font-bold text-foreground">
              <TrendingUpIcon className="size-3.5 text-primary" />
              <span>Schedule & Maturity Preview</span>
            </div>
            <span className="text-[11px] text-muted-foreground">
              Maturity: <strong className="text-foreground">{preview.maturityDate}</strong>
            </span>
          </div>

          <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 text-[11px]">
            <div>
              <span className="text-muted-foreground block">Total Deposits:</span>
              <strong className="text-foreground">{formatINR(preview.totalDeposited)}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block">Projected Maturity:</span>
              <strong className="text-primary">{formatINR(preview.projectedMaturityValue)}</strong>
            </div>
            <div>
              <span className="text-muted-foreground block">Estimated Interest:</span>
              <strong className="text-emerald-600 dark:text-emerald-400">
                +{formatINR(preview.projectedMaturityValue - preview.totalDeposited)}
              </strong>
            </div>
          </div>

          <div className="pt-1.5 border-t space-y-1">
            <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
              Installment Dates Preview:
            </span>
            <div className="flex flex-wrap items-center gap-1 text-[11px] text-muted-foreground">
              {previewDates.firstThree.map((item) => (
                <span key={item.n} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px] text-foreground">
                  #{item.n}: {item.dueDate}
                </span>
              ))}
              {preview.schedule.length > 5 && <span className="text-muted-foreground">...</span>}
              {previewDates.lastTwo.map((item) => (
                <span key={item.n} className="px-1.5 py-0.5 rounded bg-muted font-mono text-[10px] text-foreground">
                  #{item.n}: {item.dueDate}
                </span>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
