'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  CalendarDaysIcon,
  PlayIcon,
  PlusIcon,
  RepeatIcon,
  CheckCircle2Icon,
  MoreVerticalIcon,
  TrendingDownIcon,
  TrendingUpIcon,
  SparklesIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuLabel,
  DropdownMenuItem,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { formatINR } from '@src/components/finance/shared/format';
import type { RecurringRuleDTO } from '@src/lib/finance/contract';
import {
  generateDueNowAction,
  getRecurringPageDataAction,
  toggleRecurringRuleAction,
  type RecurringPageData,
} from '@src/app/(app)/finance/recurring/actions';
import { RecurringRuleDialog } from './recurring-rule-dialog';
import { RecurringDeleteDialog } from './recurring-delete-dialog';
import { extractAnchorDay } from '@src/lib/finance/recurring/date-math';

interface RecurringViewProps {
  initialData: RecurringPageData;
}

export function RecurringView({ initialData }: RecurringViewProps) {
  const [data, setData] = useState<RecurringPageData>(initialData);
  const [isGenerating, setIsGenerating] = useState(false);
  const [activeTab, setActiveTab] = useState<'upcoming' | 'rules'>('upcoming');

  // Dialog states
  const [ruleDialogOpen, setRuleDialogOpen] = useState(false);
  const [ruleToEdit, setRuleToEdit] = useState<RecurringRuleDTO | null>(null);
  const [selectedPreset, setSelectedPreset] = useState<'rent' | 'sip' | 'emi' | 'subscription' | 'custom' | null>(null);

  const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
  const [ruleToDelete, setRuleToDelete] = useState<RecurringRuleDTO | null>(null);

  const refreshData = async () => {
    try {
      const refreshed = await getRecurringPageDataAction();
      setData(refreshed);
    } catch (_err) {
      toast.error('Failed to reload recurring rules');
    }
  };

  const handleGenerateDueNow = async () => {
    try {
      setIsGenerating(true);
      const res = await generateDueNowAction();

      if (res.generated > 0) {
        toast.success(
          `Generated ${res.generated} transaction${res.generated > 1 ? 's' : ''}${
            res.backfilled > 0 ? ` (${res.backfilled} back-filled)` : ''
          }!`,
          {
            description: `Processed ${res.processed} active rule${res.processed > 1 ? 's' : ''}.`,
          }
        );
      } else {
        toast.info('All recurring transactions are up to date! No pending rules.');
      }

      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to generate recurring transactions');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleToggleActive = async (rule: RecurringRuleDTO) => {
    try {
      const updatedStatus = !rule.isActive;
      await toggleRecurringRuleAction(rule.id, updatedStatus);
      toast.success(updatedStatus ? 'Rule resumed' : 'Rule paused');
      await refreshData();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to toggle rule state');
    }
  };

  const openCreateWithPreset = (preset: 'rent' | 'sip' | 'emi' | 'subscription') => {
    setRuleToEdit(null);
    setSelectedPreset(preset);
    setRuleDialogOpen(true);
  };

  const openCreateBlank = () => {
    setRuleToEdit(null);
    setSelectedPreset('custom');
    setRuleDialogOpen(true);
  };

  const openEdit = (rule: RecurringRuleDTO) => {
    setRuleToEdit(rule);
    setSelectedPreset(null);
    setRuleDialogOpen(true);
  };

  const openDelete = (rule: RecurringRuleDTO) => {
    setRuleToDelete(rule);
    setDeleteDialogOpen(true);
  };

  // KPI Calculations
  const activeRules = data.rules.filter((r) => r.isActive);
  const pausedRules = data.rules.filter((r) => !r.isActive);

  // Compute monthly normalized amounts
  let monthlyExpensePaise = 0;
  let monthlyIncomePaise = 0;

  for (const r of activeRules) {
    let multiplier = 1;
    if (r.frequency === 'daily') multiplier = 30 / r.interval;
    else if (r.frequency === 'weekly') multiplier = 4.33 / r.interval;
    else if (r.frequency === 'monthly') multiplier = 1 / r.interval;
    else if (r.frequency === 'quarterly') multiplier = (1 / 3) / r.interval;
    else if (r.frequency === 'yearly') multiplier = (1 / 12) / r.interval;

    if (r.type === 'expense') {
      monthlyExpensePaise += Math.round(r.amount * multiplier);
    } else if (r.type === 'income') {
      monthlyIncomePaise += Math.round(r.amount * multiplier);
    }
  }

  // 60-day projected totals
  const totalUpcomingOutflow = data.upcoming
    .filter((u) => u.type === 'expense' || u.type === 'transfer')
    .reduce((sum, u) => sum + u.amount, 0);

  const accountMap = new Map(data.accounts.map((a) => [a.id, a.name]));
  const categoryMap = new Map(data.categories.map((c) => [c.id, c.name]));

  return (
    <div className="flex-1 min-h-0 flex flex-col gap-6 w-full pb-10">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <h2 className="text-lg font-bold tracking-tight">Recurring Rules</h2>
            <Badge variant="secondary" className="text-[11px] font-semibold">
              {data.rules.length} total
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground mt-0.5">
            Automate repeating transactions, rent, SIPs, EMIs, and subscriptions with month-end clamping
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={handleGenerateDueNow}
            disabled={isGenerating}
            className="gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
          >
            <PlayIcon className={`size-3.5 ${isGenerating ? 'animate-spin' : 'text-primary'}`} />
            <span>{isGenerating ? 'Generating...' : 'Generate due now'}</span>
          </Button>

          <Button
            type="button"
            size="sm"
            onClick={openCreateBlank}
            className="gap-1.5 text-xs font-semibold shadow-xs cursor-pointer"
          >
            <PlusIcon className="size-3.5" />
            <span>New Rule</span>
          </Button>
        </div>
      </div>

      {/* KPI Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
        {/* Active Rules */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Active Schedules</span>
            <div className="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <CheckCircle2Icon className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold tracking-tight">{activeRules.length}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {pausedRules.length} paused rule{pausedRules.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Monthly Projected Outflow */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Est. Monthly Outflow</span>
            <div className="size-7 rounded-lg bg-rose-500/10 text-rose-600 dark:text-rose-400 flex items-center justify-center">
              <TrendingDownIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold tracking-tight text-rose-600 dark:text-rose-400">
              {formatINR(monthlyExpensePaise)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Rent, EMIs & subscriptions</div>
          </div>
        </div>

        {/* Monthly Projected Inflow */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Est. Monthly Inflow</span>
            <div className="size-7 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
              <TrendingUpIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold tracking-tight text-emerald-600 dark:text-emerald-400">
              {formatINR(monthlyIncomePaise)}
            </div>
            <div className="text-[11px] text-muted-foreground mt-0.5">Salary & expected deposits</div>
          </div>
        </div>

        {/* 60-Day Projected Outflow */}
        <div className="p-4 rounded-xl border bg-card flex flex-col justify-between shadow-xs">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium text-muted-foreground">Upcoming (Next 60 Days)</span>
            <div className="size-7 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
              <CalendarDaysIcon className="size-3.5" />
            </div>
          </div>
          <div className="mt-3">
            <div className="text-xl font-bold tracking-tight">{formatINR(totalUpcomingOutflow)}</div>
            <div className="text-[11px] text-muted-foreground mt-0.5">
              {data.upcoming.length} scheduled occurrences
            </div>
          </div>
        </div>
      </div>

      {/* Quick Templates Bar */}
      <div className="flex items-center gap-2 p-3 rounded-xl border bg-muted/20">
        <span className="text-xs font-semibold text-muted-foreground flex items-center gap-1.5 shrink-0">
          <SparklesIcon className="size-3.5 text-primary" />
          Quick Add:
        </span>
        <div className="flex items-center gap-2 flex-wrap">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openCreateWithPreset('rent')}
            className="h-7 text-xs rounded-full gap-1 px-3 cursor-pointer"
          >
            <span>🏠 House Rent</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openCreateWithPreset('sip')}
            className="h-7 text-xs rounded-full gap-1 px-3 cursor-pointer"
          >
            <span>📈 Mutual Fund SIP</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openCreateWithPreset('emi')}
            className="h-7 text-xs rounded-full gap-1 px-3 cursor-pointer"
          >
            <span>💳 Loan EMI</span>
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => openCreateWithPreset('subscription')}
            className="h-7 text-xs rounded-full gap-1 px-3 cursor-pointer"
          >
            <span>🍿 Subscriptions</span>
          </Button>
        </div>
      </div>

      {/* Main Tabs (Upcoming Schedule vs All Rules) */}
      <Tabs
        value={activeTab}
        onValueChange={(val) => setActiveTab(val as 'upcoming' | 'rules')}
        className="w-full space-y-4"
      >
        <div className="flex items-center justify-between border-b pb-2">
          <TabsList>
            <TabsTrigger value="upcoming" className="gap-1.5 text-xs font-semibold cursor-pointer">
              <CalendarDaysIcon className="size-3.5" />
              <span>Upcoming Schedule (60 Days)</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {data.upcoming.length}
              </Badge>
            </TabsTrigger>
            <TabsTrigger value="rules" className="gap-1.5 text-xs font-semibold cursor-pointer">
              <RepeatIcon className="size-3.5" />
              <span>Recurring Rules</span>
              <Badge variant="secondary" className="ml-1 text-[10px] px-1.5 py-0">
                {data.rules.length}
              </Badge>
            </TabsTrigger>
          </TabsList>
        </div>

        {/* Tab 1: Upcoming Occurrences (Next 60 Days) */}
        <TabsContent value="upcoming" className="space-y-3 outline-none">
          {data.upcoming.length === 0 ? (
            <div className="p-8 text-center rounded-xl border bg-card space-y-2">
              <CalendarDaysIcon className="size-8 mx-auto text-muted-foreground opacity-50" />
              <div className="text-sm font-semibold">No upcoming recurring events in the next 60 days</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Create recurring rules for your rent, SIP investments, EMI deductions, or streaming subscriptions.
              </p>
              <Button type="button" size="sm" onClick={openCreateBlank} className="mt-2 text-xs">
                Add Rule
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {data.upcoming.map((occ) => {
                const isExpense = occ.type === 'expense';
                const isIncome = occ.type === 'income';

                let relativeText = 'In ' + occ.daysUntil + ' days';
                if (occ.daysUntil === 0) relativeText = 'Today';
                else if (occ.daysUntil === 1) relativeText = 'Tomorrow';

                return (
                  <div
                    key={occ.id}
                    className="p-3.5 rounded-xl border bg-card hover:border-primary/40 transition-colors shadow-xs flex flex-col justify-between gap-3"
                  >
                    <div className="space-y-1.5">
                      <div className="flex items-center justify-between gap-2">
                        <Badge
                          variant={occ.daysUntil <= 3 ? 'destructive' : 'secondary'}
                          className="text-[10px] font-mono px-1.5 py-0"
                        >
                          {relativeText}
                        </Badge>
                        <span className="text-[11px] font-mono text-muted-foreground">{occ.date}</span>
                      </div>

                      <div className="font-semibold text-xs tracking-tight text-foreground line-clamp-1">
                        {occ.ruleName}
                      </div>

                      <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
                        <span className="capitalize">{occ.type}</span>
                        <span>•</span>
                        <span className="line-clamp-1">
                          {occ.accountName}
                          {occ.toAccountName ? ` → ${occ.toAccountName}` : ''}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between border-t pt-2 mt-1">
                      <Badge variant="outline" className="text-[10px] capitalize">
                        {occ.categoryName || 'General'}
                      </Badge>

                      <span
                        className={`text-xs font-bold font-mono ${
                          isExpense
                            ? 'text-rose-600 dark:text-rose-400'
                            : isIncome
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-blue-600 dark:text-blue-400'
                        }`}
                      >
                        {isExpense ? '-' : isIncome ? '+' : ''}
                        {formatINR(occ.amount)}
                      </span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </TabsContent>

        {/* Tab 2: Recurring Rules Table */}
        <TabsContent value="rules" className="space-y-3 outline-none">
          {data.rules.length === 0 ? (
            <div className="p-8 text-center rounded-xl border bg-card space-y-2">
              <RepeatIcon className="size-8 mx-auto text-muted-foreground opacity-50" />
              <div className="text-sm font-semibold">No recurring rules configured</div>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Set up automated schedules for regular rent, SIPs, loans, and subscriptions.
              </p>
              <Button type="button" size="sm" onClick={openCreateBlank} className="mt-2 text-xs">
                Create Recurring Rule
              </Button>
            </div>
          ) : (
            <div className="rounded-xl border bg-card overflow-hidden shadow-xs">
              <div className="overflow-x-auto">
                <table className="w-full text-left text-xs">
                  <thead className="bg-muted/50 border-b text-muted-foreground font-medium">
                    <tr>
                      <th className="py-2.5 px-3">Rule / Payee</th>
                      <th className="py-2.5 px-3">Type</th>
                      <th className="py-2.5 px-3">Schedule</th>
                      <th className="py-2.5 px-3">Account & Category</th>
                      <th className="py-2.5 px-3 text-right">Amount</th>
                      <th className="py-2.5 px-3">Next Due</th>
                      <th className="py-2.5 px-3">Status</th>
                      <th className="py-2.5 px-3 text-right">Actions</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y">
                    {data.rules.map((rule) => {
                      const isExpired = rule.endDate && rule.nextOccurrence > rule.endDate;
                      const title =
                        rule.payee ||
                        (rule.note ? rule.note.replace(/\[DOM:\d+\]/, '').trim() : '') ||
                        'Recurring Rule';
                      const cleanNote = rule.note
                        ? rule.note.replace(/\[DOM:\d+\]/, '').trim()
                        : '';
                      const dom = extractAnchorDay(rule);
                      const accountName = accountMap.get(rule.accountId) || 'Account';
                      const toAccountName = rule.toAccountId ? accountMap.get(rule.toAccountId) : null;
                      const categoryName = rule.categoryId ? categoryMap.get(rule.categoryId) : null;

                      return (
                        <tr key={rule.id} className="hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="font-semibold text-foreground">{title}</div>
                            {cleanNote && cleanNote !== title && (
                              <div className="text-[11px] text-muted-foreground line-clamp-1">{cleanNote}</div>
                            )}
                          </td>

                          <td className="py-3 px-3 capitalize font-medium text-muted-foreground">
                            {rule.type}
                          </td>

                          <td className="py-3 px-3">
                            <div className="capitalize font-medium">
                              {rule.frequency} (every {rule.interval} {rule.frequency === 'daily' ? 'day' : rule.frequency === 'weekly' ? 'wk' : rule.frequency === 'yearly' ? 'yr' : 'mo'}{rule.interval > 1 ? 's' : ''})
                            </div>
                            {(rule.frequency === 'monthly' || rule.frequency === 'quarterly' || rule.frequency === 'yearly') && (
                              <div className="text-[10px] text-muted-foreground">
                                Day {dom} of month (clamped)
                              </div>
                            )}
                          </td>

                          <td className="py-3 px-3 space-y-0.5">
                            <div className="font-medium text-foreground">
                              {accountName}
                              {toAccountName ? ` → ${toAccountName}` : ''}
                            </div>
                            <div className="text-[11px] text-muted-foreground">
                              {categoryName || 'Uncategorized'}
                            </div>
                          </td>

                          <td className="py-3 px-3 text-right font-mono font-bold text-foreground">
                            {formatINR(rule.amount)}
                          </td>

                          <td className="py-3 px-3 font-mono text-muted-foreground">
                            {rule.nextOccurrence}
                          </td>

                          <td className="py-3 px-3">
                            {isExpired ? (
                              <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                Completed
                              </Badge>
                            ) : rule.isActive ? (
                              <Badge variant="outline" className="text-[10px] border-emerald-500/40 text-emerald-600 dark:text-emerald-400 bg-emerald-500/10">
                                Active
                              </Badge>
                            ) : (
                              <Badge variant="outline" className="text-[10px] border-amber-500/40 text-amber-600 dark:text-amber-400 bg-amber-500/10">
                                Paused
                              </Badge>
                            )}
                          </td>

                          <td className="py-3 px-3 text-right">
                            <DropdownMenu>
                              <DropdownMenuTrigger
                                className="p-1 rounded-md hover:bg-muted text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                              >
                                <MoreVerticalIcon className="size-4" />
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end" className="w-36">
                                <DropdownMenuGroup>
                                  <DropdownMenuLabel>Rule Actions</DropdownMenuLabel>
                                  <DropdownMenuItem onClick={() => openEdit(rule)} className="cursor-pointer">
                                    Edit Rule
                                  </DropdownMenuItem>
                                  <DropdownMenuItem onClick={() => handleToggleActive(rule)} className="cursor-pointer">
                                    {rule.isActive ? 'Pause Rule' : 'Resume Rule'}
                                  </DropdownMenuItem>
                                  <DropdownMenuSeparator />
                                  <DropdownMenuItem
                                    onClick={() => openDelete(rule)}
                                    className="text-destructive focus:text-destructive cursor-pointer"
                                  >
                                    Delete Rule
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
            </div>
          )}
        </TabsContent>
      </Tabs>

      {/* Rule Create/Edit Dialog */}
      <RecurringRuleDialog
        open={ruleDialogOpen}
        onOpenChange={setRuleDialogOpen}
        ruleToEdit={ruleToEdit}
        initialPresetId={selectedPreset}
        accounts={data.accounts}
        categories={data.categories}
        onSuccess={refreshData}
      />

      {/* Delete Rule Confirmation Dialog */}
      <RecurringDeleteDialog
        rule={ruleToDelete}
        open={deleteDialogOpen}
        onOpenChange={setDeleteDialogOpen}
        onSuccess={refreshData}
      />
    </div>
  );
}
