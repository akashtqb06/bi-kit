'use client';

import * as React from 'react';
import { useEffect, useState, useMemo } from 'react';
import {
  AnchorIcon,
  CheckCircle2Icon,
  ClockIcon,
  HelpCircleIcon,
  PercentIcon,
  ShieldCheckIcon,
  UploadIcon,
  WalletIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import { formatINR } from '../shared/format';
import { EpfContributionsChart, type EpfMonthlyPoint } from '../charts/epf-contributions-chart';
import { EpfImportDialog } from './epf-import-dialog';
import { EpfRateDialog } from './epf-rate-dialog';
import { getFyFromDate } from '@src/lib/finance/domain/pf/interest';
import type {
  PfAccountSummaryDTO,
  PfEntryDTO,
} from '@src/lib/finance/contract';

interface EpfDetailSectionProps {
  accountId: string;
  accountName: string;
}

export function EpfDetailSection({ accountId, accountName: _accountName }: EpfDetailSectionProps) {
  const [summary, setSummary] = useState<PfAccountSummaryDTO | null>(null);
  const [entries, setEntries] = useState<PfEntryDTO[]>([]);
  const [selectedFy, setSelectedFy] = useState<string>('2026-27');
  const [importDialogOpen, setImportDialogOpen] = useState(false);
  const [rateDialogOpen, setRateDialogOpen] = useState(false);
  const [isUpdatingAnchor, setIsUpdatingAnchor] = useState(false);

  const refreshPfData = async (fy?: string) => {
    try {
      const url = fy && fy !== 'ALL'
        ? `/api/finance/accounts/${accountId}/pf?fy=${encodeURIComponent(fy)}`
        : `/api/finance/accounts/${accountId}/pf`;

      const res = await fetch(url);
      if (!res.ok) {
        throw new Error('Failed to fetch PF data');
      }

      const data = await res.json();
      setSummary(data.summary);
      setEntries(data.entries);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error loading EPFO data');
    }
  };

  useEffect(() => {
    let ignore = false;
    const load = async () => {
      try {
        const url = selectedFy && selectedFy !== 'ALL'
          ? `/api/finance/accounts/${accountId}/pf?fy=${encodeURIComponent(selectedFy)}`
          : `/api/finance/accounts/${accountId}/pf`;

        const res = await fetch(url);
        if (!res.ok) throw new Error('Failed to fetch PF data');
        const data = await res.json();
        if (!ignore) {
          setSummary(data.summary);
          setEntries(data.entries);
        }
      } catch (err) {
        if (!ignore) toast.error(err instanceof Error ? err.message : 'Error loading EPFO data');
      }
    };
    void load();
    return () => {
      ignore = true;
    };
  }, [accountId, selectedFy]);

  // Available FY options from existing entries + current FY
  const fyOptions = useMemo(() => {
    const set = new Set<string>();
    set.add('2026-27');
    set.add('2025-26');
    for (const e of entries) {
      if (e.periodMonth) set.add(getFyFromDate(e.periodMonth));
      if (e.postedDate) set.add(getFyFromDate(e.postedDate));
    }
    return Array.from(set).sort().reverse();
  }, [entries]);

  // Group entries like EPFO Member Portal
  const groupedEntries = useMemo(() => {
    const contributions: PfEntryDTO[] = [];
    const transferIns: PfEntryDTO[] = [];
    const interestCredits: PfEntryDTO[] = [];
    const withdrawals: PfEntryDTO[] = [];
    const openings: PfEntryDTO[] = [];

    for (const e of entries) {
      switch (e.entryKind) {
        case 'contribution':
          contributions.push(e);
          break;
        case 'transfer_in_principal':
        case 'transfer_in_interest':
          transferIns.push(e);
          break;
        case 'interest_credit':
          interestCredits.push(e);
          break;
        case 'withdrawal':
          withdrawals.push(e);
          break;
        case 'opening':
          openings.push(e);
          break;
      }
    }

    return { contributions, transferIns, interestCredits, withdrawals, openings };
  }, [entries]);

  // Monthly points for stacked bar chart
  const chartData = useMemo<EpfMonthlyPoint[]>(() => {
    const map = new Map<string, EpfMonthlyPoint>();

    for (const c of groupedEntries.contributions) {
      const month = c.periodMonth || (c.postedDate ? c.postedDate.slice(0, 7) : 'Unknown');
      const existing = map.get(month) || {
        month,
        employee: 0,
        employer: 0,
        pension: 0,
        epfWages: 0,
      };

      existing.employee += c.employeeAmount / 100;
      existing.employer += c.employerAmount / 100;
      existing.pension += c.pensionAmount / 100;
      existing.epfWages = Math.max(existing.epfWages, c.epfWages / 100);

      map.set(month, existing);
    }

    return Array.from(map.values()).sort((a, b) => a.month.localeCompare(b.month));
  }, [groupedEntries.contributions]);

  const handleUpdateAnchor = async () => {
    if (!summary) return;
    try {
      setIsUpdatingAnchor(true);
      const today = new Date().toISOString().slice(0, 10);
      const res = await fetch(`/api/finance/valuations`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          accountId,
          date: today,
          value: summary.pfBalance,
          note: 'EPFO Passbook Closing Balance Anchor',
        }),
      });

      if (!res.ok) throw new Error('Failed to update anchor');
      toast.success(`Valuation anchor updated to ${formatINR(summary.pfBalance)} as of today`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Anchor update failed');
    } finally {
      setIsUpdatingAnchor(false);
    }
  };

  return (
    <TooltipProvider>
      <div className="space-y-6">
        {/* Staleness Nudge Banner */}
        {summary?.isStale && summary.lastImportDate && (
          <div className="p-3 rounded-xl border border-amber-500/30 bg-amber-500/10 text-amber-900 dark:text-amber-200 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <ClockIcon className="size-4 text-amber-600 dark:text-amber-400 shrink-0" />
              <span>
                <strong>Passbook not updated since {summary.lastImportDate}</strong> ({summary.staleDays} days ago). Import your latest EPFO passbook to keep balances fresh.
              </span>
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs border-amber-500/40 text-amber-900 dark:text-amber-200"
              onClick={() => setImportDialogOpen(true)}
            >
              Update Passbook
            </Button>
          </div>
        )}

        {/* Top Controls Strip */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-4 rounded-xl border bg-card shadow-xs">
          <div className="flex items-center gap-3">
            <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <ShieldCheckIcon className="size-4" />
            </div>
            <div>
              <h3 className="text-sm font-bold text-foreground">EPFO Member Passbook</h3>
              <p className="text-xs text-muted-foreground">
                Employee Provident Fund (EPF 12%), Employer Share (3.67%), and EPS Pension (8.33%)
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* FY Selector */}
            <Select
              items={[
                ...fyOptions.map((fy) => ({ value: fy, label: `FY ${fy}` })),
                { value: 'ALL', label: 'All Years' },
              ]}
              value={selectedFy}
              onValueChange={(val) => val && setSelectedFy(val)}
            >
              <SelectTrigger className="h-8 text-xs font-mono w-32 bg-background">
                <SelectValue placeholder="Select FY" />
              </SelectTrigger>
              <SelectContent>
                {fyOptions.map((fy) => (
                  <SelectItem key={fy} value={fy} className="text-xs font-mono">
                    FY {fy}
                  </SelectItem>
                ))}
                <SelectItem value="ALL" className="text-xs">
                  All Years
                </SelectItem>
              </SelectContent>
            </Select>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              onClick={() => setRateDialogOpen(true)}
            >
              <PercentIcon className="size-3.5" />
              <span>{summary?.interestRate ? `${summary.interestRate}% Rate` : 'Set Rate'}</span>
            </Button>

            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 text-xs gap-1.5"
              disabled={isUpdatingAnchor || !summary}
              onClick={handleUpdateAnchor}
            >
              <AnchorIcon className="size-3.5" />
              <span>Set Anchor</span>
            </Button>

            <Button
              type="button"
              size="sm"
              className="h-8 text-xs gap-1.5 shadow-xs"
              onClick={() => setImportDialogOpen(true)}
            >
              <UploadIcon className="size-3.5" />
              <span>Import Passbook</span>
            </Button>
          </div>
        </div>

        {/* Summary Cards Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {/* Card 1: PF Balance */}
          <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">PF Balance</span>
              <Badge variant="outline" className="text-[10px] py-0 px-1 font-semibold text-emerald-600 dark:text-emerald-400">
                Employee + Employer
              </Badge>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-foreground">
                {formatINR(summary?.pfBalance ?? 0)}
              </div>
              <div className="flex items-center gap-2 text-[11px] text-muted-foreground mt-1">
                <span>Emp: {formatINR(summary?.employeeShare ?? 0)}</span>
                <span>•</span>
                <span>Emplyr: {formatINR(summary?.employerShare ?? 0)}</span>
              </div>
            </div>
          </div>

          {/* Card 2: Pension Memo (EPS) */}
          <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Pension (EPS) Memo</span>
              <Tooltip>
                <TooltipTrigger>
                  <span className="text-muted-foreground hover:text-foreground cursor-pointer">
                    <HelpCircleIcon className="size-3.5" />
                  </span>
                </TooltipTrigger>
                <TooltipContent className="max-w-xs text-xs">
                  The employer&apos;s 12% PF contribution splits into 3.67% PF and 8.33% EPS. EPS is an EPFO pension annuity scheme not counted in your net worth by default.
                </TooltipContent>
              </Tooltip>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-amber-600 dark:text-amber-400">
                {formatINR(summary?.pensionBalance ?? 0)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                Separate memo (Excluded from net worth)
              </div>
            </div>
          </div>

          {/* Card 3: This FY Contributions & Transfer-ins */}
          <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">
                FY {selectedFy} Contributions
              </span>
              <span className="text-[10px] text-muted-foreground font-mono">
                {groupedEntries.contributions.length} mo
              </span>
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-foreground">
                {formatINR(summary?.thisFyContributions?.total ?? 0)}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1 truncate">
                Transfer-ins: {formatINR(summary?.thisFyTransferIns?.total ?? 0)}
              </div>
            </div>
          </div>

          {/* Card 4: Accrued Interest Estimate */}
          <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
            <div className="flex items-center justify-between">
              <span className="text-xs font-medium text-muted-foreground">Interest Accrued</span>
              {summary?.interestRate ? (
                <Badge variant="outline" className="text-[10px] py-0 px-1 font-mono">
                  {summary.interestRate}% p.a.
                </Badge>
              ) : (
                <button
                  type="button"
                  className="text-[10px] text-primary hover:underline font-medium"
                  onClick={() => setRateDialogOpen(true)}
                >
                  Set rate
                </button>
              )}
            </div>
            <div className="mt-2">
              <div className="text-2xl font-extrabold text-blue-600 dark:text-blue-400">
                {summary?.accruedInterestEstimate
                  ? formatINR(summary.accruedInterestEstimate)
                  : '₹0'}
              </div>
              <div className="text-[11px] text-muted-foreground mt-1">
                {summary?.interestRate
                  ? 'Estimate (Credited at FY end)'
                  : 'Set annual rate to calculate'}
              </div>
            </div>
          </div>
        </div>

        {/* Virtual Next Contribution Banner */}
        {summary?.virtualNextContribution && (
          <div className="p-3 rounded-lg border bg-muted/40 flex items-center justify-between gap-3 text-xs">
            <div className="flex items-center gap-2">
              <WalletIcon className="size-4 text-primary shrink-0" />
              <span>
                <strong>Next Expected Contribution (Virtual Forecast):</strong>{' '}
                Emp {formatINR(summary.virtualNextContribution.employee)} + Emplyr{' '}
                {formatINR(summary.virtualNextContribution.employer)} = Total{' '}
                <strong className="text-foreground">
                  {formatINR(
                    summary.virtualNextContribution.employee +
                      summary.virtualNextContribution.employer
                  )}
                </strong>{' '}
                (EPS: {formatINR(summary.virtualNextContribution.pension)})
              </span>
            </div>
            <Badge variant="secondary" className="text-[10px] font-normal">
              Based on latest actual
            </Badge>
          </div>
        )}

        {/* Monthly Contributions & Wages Chart */}
        <div className="p-5 rounded-2xl border bg-card space-y-3 shadow-xs">
          <div className="flex items-center justify-between border-b pb-2">
            <div>
              <h4 className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Monthly Contributions & EPF Wages
              </h4>
              <p className="text-[11px] text-muted-foreground">
                Stacked breakdown of employee, employer, and pension shares with EPF wages trend
              </p>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <CheckCircle2Icon className="size-3.5 text-emerald-500" />
              <span>Idempotent passbook actuals</span>
            </div>
          </div>

          <EpfContributionsChart data={chartData} height={260} />
        </div>

        {/* Portal-Style Grouped Passbook Tables */}
        <div className="space-y-4">
          <div className="flex items-center justify-between border-b pb-2">
            <h4 className="text-sm font-bold text-foreground">
              Passbook Ledger • FY {selectedFy}
            </h4>
            <div className="flex items-center gap-2">
              <span className="text-xs text-muted-foreground">
                {entries.length} recorded entries
              </span>
            </div>
          </div>

          {/* Section A: Monthly Contributions */}
          {groupedEntries.contributions.length > 0 && (
            <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
              <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between text-xs font-semibold">
                <span>Monthly Contributions</span>
                <span className="text-muted-foreground">
                  {groupedEntries.contributions.length} Months
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 border-b text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-left font-medium">Due Month</th>
                      <th className="p-2.5 text-right font-medium">EPF Wages</th>
                      <th className="p-2.5 text-right font-medium">EPS Wages</th>
                      <th className="p-2.5 text-right font-medium">Employee Share (12%)</th>
                      <th className="p-2.5 text-right font-medium">Employer Share (3.67%)</th>
                      <th className="p-2.5 text-right font-medium">Pension Share (8.33%)</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {groupedEntries.contributions.map((c) => (
                      <tr key={c.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2.5 font-mono font-medium">
                          {c.periodMonth || c.postedDate || '-'}
                        </td>
                        <td className="p-2.5 text-right font-mono text-muted-foreground">
                          {formatINR(c.epfWages)}
                        </td>
                        <td className="p-2.5 text-right font-mono text-muted-foreground">
                          {formatINR(c.epsWages)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-foreground">
                          {formatINR(c.employeeAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-foreground">
                          {formatINR(c.employerAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                          {formatINR(c.pensionAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section B: Transfer-Ins */}
          {groupedEntries.transferIns.length > 0 && (
            <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
              <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between text-xs font-semibold">
                <span>Transfer Claims / VDRs</span>
                <span className="text-muted-foreground">
                  {groupedEntries.transferIns.length} Records
                </span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 border-b text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-left font-medium">Particulars / Source</th>
                      <th className="p-2.5 text-left font-medium">Type</th>
                      <th className="p-2.5 text-right font-medium">Employee Share</th>
                      <th className="p-2.5 text-right font-medium">Employer Share</th>
                      <th className="p-2.5 text-right font-medium">Pension Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {groupedEntries.transferIns.map((t) => (
                      <tr key={t.id} className="hover:bg-muted/30 transition-colors">
                        <td className="p-2.5 font-medium text-foreground">
                          {t.sourceLabel || 'Transfer Claim'}
                        </td>
                        <td className="p-2.5 text-muted-foreground capitalize">
                          {t.entryKind.replace('transfer_in_', '')}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-foreground">
                          {formatINR(t.employeeAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold text-foreground">
                          {formatINR(t.employerAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-medium text-amber-600 dark:text-amber-400">
                          {formatINR(t.pensionAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section C: Withdrawals & Interest */}
          {(groupedEntries.withdrawals.length > 0 || groupedEntries.interestCredits.length > 0) && (
            <div className="border rounded-xl bg-card overflow-hidden shadow-xs">
              <div className="bg-muted/40 px-4 py-2 border-b flex items-center justify-between text-xs font-semibold">
                <span>Withdrawals, Claims & Interest Credits</span>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead className="bg-muted/20 border-b text-muted-foreground">
                    <tr>
                      <th className="p-2.5 text-left font-medium">Description</th>
                      <th className="p-2.5 text-left font-medium">Date</th>
                      <th className="p-2.5 text-right font-medium">Employee Share</th>
                      <th className="p-2.5 text-right font-medium">Employer Share</th>
                      <th className="p-2.5 text-right font-medium">Pension Share</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {groupedEntries.withdrawals.map((w) => (
                      <tr key={w.id} className="text-destructive">
                        <td className="p-2.5 font-medium">Withdrawal / Claim Paid</td>
                        <td className="p-2.5 font-mono">{w.postedDate || '-'}</td>
                        <td className="p-2.5 text-right font-mono font-semibold">
                          {formatINR(w.employeeAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold">
                          {formatINR(w.employerAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold">
                          {formatINR(w.pensionAmount)}
                        </td>
                      </tr>
                    ))}
                    {groupedEntries.interestCredits.map((i) => (
                      <tr key={i.id} className="text-blue-600 dark:text-blue-400">
                        <td className="p-2.5 font-medium">Interest Credited</td>
                        <td className="p-2.5 font-mono">{i.postedDate || '-'}</td>
                        <td className="p-2.5 text-right font-mono font-semibold">
                          {formatINR(i.employeeAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold">
                          {formatINR(i.employerAmount)}
                        </td>
                        <td className="p-2.5 text-right font-mono font-semibold">
                          {formatINR(i.pensionAmount)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Section D: Overall Closing Balance Strip */}
          <div className="p-4 rounded-xl border bg-muted/40 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheckIcon className="size-4 text-emerald-600" />
              <span className="font-bold text-foreground">Closing Balance Summary</span>
            </div>
            <div className="flex items-center gap-4">
              <div>
                <span className="text-muted-foreground mr-1">Employee:</span>
                <span className="font-mono font-bold text-foreground">
                  {formatINR(summary?.employeeShare ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground mr-1">Employer:</span>
                <span className="font-mono font-bold text-foreground">
                  {formatINR(summary?.employerShare ?? 0)}
                </span>
              </div>
              <div>
                <span className="text-muted-foreground mr-1">Pension (EPS):</span>
                <span className="font-mono font-bold text-amber-600 dark:text-amber-400">
                  {formatINR(summary?.pensionBalance ?? 0)}
                </span>
              </div>
              <div className="border-l pl-4 font-bold text-foreground text-sm">
                PF Total: {formatINR(summary?.pfBalance ?? 0)}
              </div>
            </div>
          </div>
        </div>

        {/* Dialogs */}
        <EpfImportDialog
          accountId={accountId}
          open={importDialogOpen}
          onOpenChange={setImportDialogOpen}
          onSuccess={() => void refreshPfData(selectedFy)}
        />

        <EpfRateDialog
          accountId={accountId}
          currentFy={selectedFy}
          initialRate={summary?.interestRate ?? null}
          open={rateDialogOpen}
          onOpenChange={setRateDialogOpen}
          onSuccess={() => void refreshPfData(selectedFy)}
        />
      </div>
    </TooltipProvider>
  );
}
