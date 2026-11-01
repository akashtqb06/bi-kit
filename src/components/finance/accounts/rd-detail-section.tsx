'use client';

import React, { useEffect, useState, useMemo, useCallback } from 'react';
import {
  PiggyBankIcon,
  RefreshCwIcon,
  CalendarIcon,
  ClockIcon,
  MoreVerticalIcon,
  Edit2Icon,
  ArrowRightIcon,
  InfoIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
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
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { DatePicker } from '@/components/ui/date-picker';
import { formatINR } from '../shared/format';
import type { AccountWithBalance } from '../shared/fixtures';
import type { RDInstallmentItem, RDValuationResult } from '@src/lib/finance/domain/rd';
import { cn } from '@/lib/utils';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';

export interface RDDetailSectionProps {
  account: AccountWithBalance;
  onRefreshNeeded?: () => void;
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

export function RDDetailSection({ account, onRefreshNeeded }: RDDetailSectionProps) {
  const [loading, setLoading] = useState(true);
  const [isRecalculating, setIsRecalculating] = useState(false);
  const [scheduleData, setScheduleData] = useState<RDValuationResult | null>(null);

  // Dialog states
  const [changeDateOpen, setChangeDateOpen] = useState(false);
  const [newDay, setNewDay] = useState<string>('2');
  const [effectiveFromMonth, setEffectiveFromMonth] = useState<string>(() =>
    new Date().toISOString().slice(0, 7)
  );

  const [lateDialogOpen, setLateDialogOpen] = useState(false);
  const [selectedDueDate, setSelectedDueDate] = useState<string | null>(null);
  const [actualPaidDate, setActualPaidDate] = useState<string>('');

  const today = todayInTz(DEFAULT_TZ);

  // Fetch full schedule & valuation for user actions
  const fetchSchedule = useCallback(async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/finance/accounts/${account.id}/rd-schedule`);
      if (!res.ok) {
        throw new Error('Failed to load schedule');
      }
      const data = await res.json();
      setScheduleData(data.valuation);
    } catch (err) {
      console.warn('Error fetching RD schedule:', err);
    } finally {
      setLoading(false);
    }
  }, [account.id]);

  useEffect(() => {
    let ignore = false;
    fetch(`/api/finance/accounts/${account.id}/rd-schedule`)
      .then((res) => (res.ok ? res.json() : Promise.reject(new Error('Failed to load'))))
      .then((data) => {
        if (!ignore) {
          setScheduleData(data.valuation);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (!ignore) {
          console.warn('Error fetching RD schedule:', err);
          setLoading(false);
        }
      });
    return () => {
      ignore = true;
    };
  }, [account.id]);

  // Recalculate action
  const handleRecalculate = async () => {
    try {
      setIsRecalculating(true);
      const res = await fetch(`/api/finance/accounts/${account.id}/rd-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'recalculate' }),
      });
      if (!res.ok) throw new Error('Recalculation failed');
      await fetchSchedule();
      onRefreshNeeded?.();
      toast.success('RD valuations recalculated');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Recalculation failed');
    } finally {
      setIsRecalculating(false);
    }
  };

  // Change installment day
  const handleChangeDaySubmit = async () => {
    try {
      const parsedDay = newDay === 'last' ? 'last' : parseInt(newDay, 10);
      const res = await fetch(`/api/finance/accounts/${account.id}/rd-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'change_installment_day',
          data: {
            newDay: parsedDay,
            effectiveFrom: effectiveFromMonth,
          },
        }),
      });
      if (!res.ok) throw new Error('Failed to update installment day');
      toast.success(`Installment day updated to ${newDay} from ${effectiveFromMonth}`);
      setChangeDateOpen(false);
      await fetchSchedule();
      onRefreshNeeded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to change installment day');
    }
  };

  // Mark skipped / unskip
  const handleToggleSkip = async (dueDate: string, currentStatus: string) => {
    try {
      const shouldSkip = currentStatus !== 'skipped';
      const res = await fetch(`/api/finance/accounts/${account.id}/rd-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_skipped',
          data: { dueDate, skipped: shouldSkip },
        }),
      });
      if (!res.ok) throw new Error('Failed to update installment status');
      toast.success(shouldSkip ? `Installment on ${dueDate} marked skipped` : `Installment on ${dueDate} restored`);
      await fetchSchedule();
      onRefreshNeeded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  };

  // Mark paid late
  const handleMarkLateSubmit = async () => {
    if (!selectedDueDate || !actualPaidDate) return;
    try {
      const res = await fetch(`/api/finance/accounts/${account.id}/rd-action`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'mark_paid_late',
          data: { dueDate: selectedDueDate, paidDate: actualPaidDate },
        }),
      });
      if (!res.ok) throw new Error('Failed to record late installment');
      toast.success(`Installment marked paid on ${actualPaidDate}`);
      setLateDialogOpen(false);
      await fetchSchedule();
      onRefreshNeeded?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Action failed');
    }
  };

  // Fallback metrics from account if schedule is loading
  const totalDeposited = scheduleData?.totalDeposited ?? account.totalDeposited ?? account.balance;
  const currentValue = scheduleData?.currentValue ?? account.accruedValue ?? account.balance;
  const interestEarned = scheduleData?.interestAccrued ?? account.interestEarned ?? Math.max(0, currentValue - totalDeposited);
  const projectedMaturity = scheduleData?.projectedMaturityValue ?? account.projectedMaturityAmount ?? account.balance;
  const maturityDate = scheduleData?.maturityDate ?? account.maturityDate ?? '—';
  const installmentsPaid = scheduleData?.installmentsPaid ?? account.installmentsPaid ?? 0;
  const totalInstallments = account.totalInstallments ?? scheduleData?.schedule.length ?? 12;
  const nextDate = scheduleData?.nextInstallmentDate ?? account.nextInstallmentDate ?? null;

  // Countdown text for next installment
  const countdownText = useMemo(() => {
    if (!nextDate) return 'Maturity Reached';
    if (nextDate === today) return 'Due Today!';
    const [y1, m1, d1] = today.split('-').map(Number);
    const [y2, m2, d2] = nextDate.split('-').map(Number);
    const diffDays = Math.round((Date.UTC(y2, m2 - 1, d2) - Date.UTC(y1, m1 - 1, d1)) / 86400000);
    if (diffDays === 1) return 'Due Tomorrow';
    if (diffDays > 1) return `in ${diffDays} days`;
    return 'Past Due';
  }, [nextDate, today]);

  const meta = (account.metadata || {}) as Record<string, unknown>;
  const autoDebit = meta.autoDebit !== undefined ? Boolean(meta.autoDebit) : Boolean(meta.payFromAccountId);

  return (
    <div className="space-y-4">
      {/* Top Header Card */}
      <div className="p-4 rounded-xl border bg-card space-y-4 shadow-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b pb-3">
          <div className="flex items-center gap-2">
            <PiggyBankIcon className="size-5 text-amber-500" />
            <div>
              <h3 className="text-sm font-bold text-foreground">Recurring Deposit Account</h3>
              <p className="text-[11px] text-muted-foreground">
                Automatic schedule generation, quarterly day-count compounding, and passbook reconciliation.
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-8 text-xs gap-1.5"
              onClick={() => {
                setNewDay(String(meta.installmentDay || 2));
                setChangeDateOpen(true);
              }}
            >
              <Edit2Icon className="size-3 text-muted-foreground" />
              <span>Change Installment Day</span>
            </Button>

            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={isRecalculating}
              className="h-8 text-xs gap-1.5"
              onClick={handleRecalculate}
            >
              <RefreshCwIcon
                className={cn('size-3.5 text-primary', isRecalculating && 'animate-spin')}
              />
              <span>{isRecalculating ? 'Recalculating...' : 'Recalculate'}</span>
            </Button>
          </div>
        </div>

        {/* Notice if autoDebit is disabled */}
        {!autoDebit && (
          <div className="flex items-center gap-2 p-2.5 rounded-lg bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-xs">
            <InfoIcon className="size-4 shrink-0" />
            <span>
              Auto-debit is disabled. Installments are assumed deposited on schedule for RD valuation, but no bank balance transfers will be generated.
            </span>
          </div>
        )}

        {/* Primary Metrics Grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground">Current Value</span>
            <div className="text-xl font-bold text-foreground mt-0.5">
              {formatINR(currentValue)}
            </div>
            <span className="text-[10px] text-muted-foreground">Compounded to {today}</span>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground">Interest Accrued</span>
            <div className="text-xl font-bold text-emerald-600 dark:text-emerald-400 mt-0.5">
              +{formatINR(interestEarned)}
            </div>
            <span className="text-[10px] text-muted-foreground">
              Rate: {meta.interestRate ? `${meta.interestRate}%` : '6.8%'} p.a.
            </span>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground">Total Deposited</span>
            <div className="text-xl font-bold text-foreground mt-0.5">
              {formatINR(totalDeposited)}
            </div>
            <span className="text-[10px] text-muted-foreground">Principal invested so far</span>
          </div>

          <div className="p-3 rounded-lg bg-muted/40 border">
            <span className="text-[11px] text-muted-foreground">Projected Maturity</span>
            <div className="text-xl font-bold text-primary mt-0.5">
              {formatINR(projectedMaturity)}
            </div>
            <span className="text-[10px] text-muted-foreground">Matures on {maturityDate}</span>
          </div>
        </div>

        {/* Progress & Next Installment Banner */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
          <div className="p-3 rounded-lg border bg-card space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-foreground">
                Installments Paid: {installmentsPaid} of {totalInstallments}
              </span>
              <span className="text-muted-foreground font-mono">
                {Math.round((installmentsPaid / Math.max(1, totalInstallments)) * 100)}%
              </span>
            </div>
            <Progress
              value={(installmentsPaid / Math.max(1, totalInstallments)) * 100}
              className="h-2"
            />
          </div>

          <div className="p-3 rounded-lg border bg-card flex items-center justify-between">
            <div>
              <span className="text-[10px] uppercase font-bold tracking-wider text-muted-foreground block">
                Next Installment Date
              </span>
              <div className="text-base font-bold text-foreground mt-0.5">
                {nextDate || 'None pending'}
              </div>
            </div>
            {nextDate && (
              <Badge
                variant={nextDate === today ? 'default' : 'secondary'}
                className="text-xs px-2.5 py-1 gap-1"
              >
                <ClockIcon className="size-3" />
                <span>{countdownText}</span>
              </Badge>
            )}
          </div>
        </div>
      </div>

      {/* Schedule Timeline Table */}
      <div className="p-4 rounded-xl border bg-card space-y-3 shadow-xs">
        <div className="flex items-center justify-between border-b pb-2">
          <div className="flex items-center gap-2">
            <CalendarIcon className="size-4 text-primary" />
            <h4 className="text-xs font-bold uppercase tracking-wider text-foreground">
              Installment Schedule Timeline ({scheduleData?.schedule.length || totalInstallments} Months)
            </h4>
          </div>
          <span className="text-[11px] text-muted-foreground">
            Monthly amount: {account.monthlyInstallment ? formatINR(account.monthlyInstallment) : '—'}
          </span>
        </div>

        {loading ? (
          <div className="py-12 text-center text-xs text-muted-foreground">
            Loading installment schedule...
          </div>
        ) : !scheduleData || scheduleData.schedule.length === 0 ? (
          <div className="py-8 text-center text-xs text-muted-foreground">
            No schedule available. Click &quot;Recalculate&quot; to generate.
          </div>
        ) : (
          <div className="border rounded-lg overflow-x-auto bg-card">
            <table className="w-full text-xs">
              <thead className="bg-muted/50 border-b text-muted-foreground text-[11px]">
                <tr>
                  <th className="py-2.5 px-3 text-left font-semibold">#</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Due Date</th>
                  <th className="py-2.5 px-3 text-left font-semibold">Paid Date</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Amount</th>
                  <th className="py-2.5 px-3 text-center font-semibold">Status</th>
                  <th className="py-2.5 px-3 text-right font-semibold">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border/60">
                {scheduleData.schedule.map((item) => {
                  const isDueToday = item.dueDate === today && item.status !== 'skipped';
                  return (
                    <tr
                      key={item.n}
                      className={cn(
                        'hover:bg-muted/30 transition-colors',
                        isDueToday && 'bg-amber-500/5 font-medium'
                      )}
                    >
                      <td className="py-2.5 px-3 text-muted-foreground font-mono text-[11px]">
                        #{item.n}
                      </td>
                      <td className="py-2.5 px-3 font-medium text-foreground">
                        {item.dueDate}
                      </td>
                      <td className="py-2.5 px-3 text-muted-foreground">
                        {item.paidDate || '—'}
                      </td>
                      <td className="py-2.5 px-3 text-right font-semibold text-foreground">
                        {formatINR(item.amount)}
                      </td>
                      <td className="py-2.5 px-3 text-center">
                        {item.status === 'paid' ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-emerald-500/10 text-emerald-700 dark:text-emerald-400 border-emerald-500/30 font-medium"
                          >
                            Paid
                          </Badge>
                        ) : isDueToday ? (
                          <Badge
                            variant="default"
                            className="text-[10px] bg-amber-500 text-white hover:bg-amber-600 font-semibold"
                          >
                            Due Today
                          </Badge>
                        ) : item.status === 'skipped' ? (
                          <Badge
                            variant="outline"
                            className="text-[10px] bg-destructive/10 text-destructive border-destructive/30 font-medium"
                          >
                            Skipped
                          </Badge>
                        ) : (
                          <Badge
                            variant="secondary"
                            className="text-[10px] text-muted-foreground font-normal"
                          >
                            Upcoming
                          </Badge>
                        )}
                      </td>
                      <td className="py-2.5 px-3 text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger
                            className="inline-flex items-center justify-center rounded-md hover:bg-accent hover:text-accent-foreground h-7 w-7 p-0 text-muted-foreground transition-colors"
                          >
                            <MoreVerticalIcon className="size-3.5" />
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="text-xs">
                            <DropdownMenuGroup>
                              <DropdownMenuLabel>Installment #{item.n}</DropdownMenuLabel>
                              <DropdownMenuItem
                                onClick={() => handleToggleSkip(item.dueDate, item.status)}
                              >
                                {item.status === 'skipped' ? 'Restore Installment' : 'Mark as Skipped'}
                              </DropdownMenuItem>
                              <DropdownMenuItem
                                onClick={() => {
                                  setSelectedDueDate(item.dueDate);
                                  setActualPaidDate(item.paidDate || item.dueDate);
                                  setLateDialogOpen(true);
                                }}
                              >
                                Mark Paid Late (Date)
                              </DropdownMenuItem>
                            </DropdownMenuGroup>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Change Installment Date Dialog */}
      <Dialog open={changeDateOpen} onOpenChange={setChangeDateOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>Change Installment Date</DialogTitle>
          </DialogHeader>

          <div className="space-y-4 py-2 text-xs">
            <p className="text-muted-foreground">
              Select a new installment day and the month from which it takes effect. Earlier installments will remain on their original dates.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="change-inst-day" className="font-semibold text-foreground">
                New Installment Day
              </Label>
              <Select
                items={INSTALLMENT_DAY_OPTIONS}
                value={newDay}
                onValueChange={(val) => {
                  if (val) setNewDay(val);
                }}
              >
                <SelectTrigger id="change-inst-day" className="h-9 text-xs">
                  <SelectValue placeholder="Select day" />
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
              <Label htmlFor="change-effective-month" className="font-semibold text-foreground">
                Effective From Month (YYYY-MM)
              </Label>
              <Input
                id="change-effective-month"
                type="month"
                className="h-9 text-xs"
                value={effectiveFromMonth}
                onChange={(e) => setEffectiveFromMonth(e.target.value)}
              />
              <p className="text-[10px] text-muted-foreground">
                All installments from this month onward will shift to day {newDay}.
              </p>
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setChangeDateOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleChangeDaySubmit}
            >
              Apply Change
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Mark Paid Late Dialog */}
      <Dialog open={lateDialogOpen} onOpenChange={setLateDialogOpen}>
        <DialogContent className="max-w-sm">
          <DialogHeader>
            <DialogTitle>Record Actual Paid Date</DialogTitle>
          </DialogHeader>

          <div className="space-y-3 py-2 text-xs">
            <p className="text-muted-foreground">
              Installment due date: <strong>{selectedDueDate}</strong>. Late installments compound interest starting from their actual payment date.
            </p>

            <div className="space-y-1.5">
              <Label htmlFor="actual-paid-picker" className="font-semibold text-foreground">
                Actual Deposit Date
              </Label>
              <DatePicker
                id="actual-paid-picker"
                className="h-9 text-xs"
                value={actualPaidDate}
                onChange={setActualPaidDate}
                placeholder="Select payment date"
              />
            </div>
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => setLateDialogOpen(false)}
            >
              Cancel
            </Button>
            <Button
              type="button"
              size="sm"
              onClick={handleMarkLateSubmit}
            >
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
