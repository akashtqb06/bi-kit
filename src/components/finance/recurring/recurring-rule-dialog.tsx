'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { paiseToRupees, rupeesToPaise } from '@src/components/finance/shared/format';
import type {
  AccountDTO,
  CategoryDTO,
  CreateRecurringRuleDTO,
  RecurringRuleDTO,
  UpdateRecurringRuleDTO,
} from '@src/lib/finance/contract';
import type { RecurringFrequency } from '@src/lib/finance/constants';
import { RECURRING_PRESETS } from '@src/lib/finance/recurring/presets';
import {
  createRecurringRuleAction,
  updateRecurringRuleAction,
} from '@src/app/(app)/finance/recurring/actions';
import { extractAnchorDay } from '@src/lib/finance/recurring/date-math';

interface RecurringRuleDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  ruleToEdit?: RecurringRuleDTO | null;
  initialPresetId?: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom' | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onSuccess: () => void;
}

interface FormInitialValues {
  type: 'expense' | 'income' | 'transfer';
  payee: string;
  amountRupees: string;
  frequency: RecurringFrequency;
  interval: number;
  dayOfMonth: number;
  accountId: string;
  toAccountId: string;
  categoryId: string;
  startDate: string;
  endDate: string;
  note: string;
}

function computeInitialValues(
  ruleToEdit: RecurringRuleDTO | null | undefined,
  initialPresetId: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom' | null | undefined,
  accounts: AccountDTO[],
  categories: CategoryDTO[]
): FormInitialValues {
  const today = new Date().toISOString().slice(0, 10);
  const todayDay = parseInt(today.split('-')[2], 10);

  if (ruleToEdit) {
    const dom = extractAnchorDay(ruleToEdit);
    const cleanNote = ruleToEdit.note ? ruleToEdit.note.replace(/\[DOM:\d+\]/, '').trim() : '';
    return {
      type: ruleToEdit.type,
      payee: ruleToEdit.payee || '',
      amountRupees: String(paiseToRupees(ruleToEdit.amount)),
      frequency: ruleToEdit.frequency,
      interval: ruleToEdit.interval || 1,
      dayOfMonth: dom,
      accountId: ruleToEdit.accountId,
      toAccountId: ruleToEdit.toAccountId || '',
      categoryId: ruleToEdit.categoryId || '',
      startDate: ruleToEdit.startDate,
      endDate: ruleToEdit.endDate || '',
      note: cleanNote,
    };
  }

  const preset = initialPresetId && initialPresetId !== 'custom'
    ? RECURRING_PRESETS.find((p) => p.id === initialPresetId)
    : null;

  const matchingCat = preset
    ? categories.find((c) => c.name.toLowerCase() === preset.defaultCategoryName.toLowerCase())
    : categories.find((c) => c.type === 'expense');

  return {
    type: (preset?.type as 'expense' | 'income' | 'transfer') || 'expense',
    payee: preset?.defaultPayee || '',
    amountRupees: '',
    frequency: preset?.defaultFrequency || 'monthly',
    interval: preset?.defaultInterval || 1,
    dayOfMonth: preset?.defaultDayOfMonth || todayDay,
    accountId: accounts[0]?.id || '',
    toAccountId: '',
    categoryId: matchingCat?.id || '',
    startDate: today,
    endDate: '',
    note: preset?.defaultNote || '',
  };
}

function RecurringRuleForm({
  ruleToEdit,
  initialPresetId,
  accounts,
  categories,
  onClose,
  onSuccess,
}: {
  ruleToEdit?: RecurringRuleDTO | null;
  initialPresetId?: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom' | null;
  accounts: AccountDTO[];
  categories: CategoryDTO[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const isEditing = Boolean(ruleToEdit);
  const initial = computeInitialValues(ruleToEdit, initialPresetId, accounts, categories);

  const [type, setType] = useState<'expense' | 'income' | 'transfer'>(initial.type);
  const [payee, setPayee] = useState(initial.payee);
  const [amountRupees, setAmountRupees] = useState(initial.amountRupees);
  const [frequency, setFrequency] = useState<RecurringFrequency>(initial.frequency);
  const [interval, setInterval] = useState(initial.interval);
  const [dayOfMonth, setDayOfMonth] = useState<number>(initial.dayOfMonth);
  const [accountId, setAccountId] = useState(initial.accountId);
  const [toAccountId, setToAccountId] = useState(initial.toAccountId);
  const [categoryId, setCategoryId] = useState(initial.categoryId);
  const [startDate, setStartDate] = useState(initial.startDate);
  const [endDate, setEndDate] = useState(initial.endDate);
  const [note, setNote] = useState(initial.note);
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const applyPreset = (presetId: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom') => {
    if (presetId === 'custom') return;
    const preset = RECURRING_PRESETS.find((p) => p.id === presetId);
    if (!preset) return;

    setType(preset.type as 'expense' | 'income' | 'transfer');
    setPayee(preset.defaultPayee);
    setFrequency(preset.defaultFrequency);
    setInterval(preset.defaultInterval);
    setDayOfMonth(preset.defaultDayOfMonth);

    const match = categories.find(
      (c) => c.name.toLowerCase() === preset.defaultCategoryName.toLowerCase()
    );
    if (match) {
      setCategoryId(match.id);
    }

    setNote(preset.defaultNote);
  };

  const handleDayOfMonthChange = (newDom: number) => {
    setDayOfMonth(newDom);
    if (!isEditing && startDate) {
      const [y, m] = startDate.split('-');
      const maxDays = new Date(Date.UTC(Number(y), Number(m), 0)).getUTCDate();
      const clamped = Math.min(newDom, maxDays);
      setStartDate(`${y}-${m}-${String(clamped).padStart(2, '0')}`);
    }
  };

  const validate = (): boolean => {
    const errs: Record<string, string> = {};

    const amountNum = parseFloat(amountRupees);
    if (isNaN(amountNum) || amountNum <= 0) {
      errs.amount = 'Enter a valid positive amount';
    }

    if (!accountId) {
      errs.accountId = 'Source account is required';
    }

    if (type === 'transfer') {
      if (!toAccountId) {
        errs.toAccountId = 'Destination account is required for transfers';
      } else if (toAccountId === accountId) {
        errs.toAccountId = 'Destination account must be different from source';
      }
    }

    if (!startDate) {
      errs.startDate = 'Start date is required';
    } else if (!/^\d{4}-\d{2}-\d{2}$/.test(startDate)) {
      errs.startDate = 'Invalid date format (YYYY-MM-DD)';
    }

    if (endDate && !/^\d{4}-\d{2}-\d{2}$/.test(endDate)) {
      errs.endDate = 'Invalid date format (YYYY-MM-DD)';
    } else if (endDate && startDate && endDate < startDate) {
      errs.endDate = 'End date cannot be earlier than start date';
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate()) return;

    try {
      setIsSubmitting(true);
      const paise = rupeesToPaise(parseFloat(amountRupees));

      const cleanNoteText = note.trim();
      const noteWithDom =
        frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly'
          ? cleanNoteText
            ? `${cleanNoteText} [DOM:${dayOfMonth}]`
            : `[DOM:${dayOfMonth}]`
          : cleanNoteText || null;

      if (isEditing && ruleToEdit) {
        const payload: UpdateRecurringRuleDTO = {
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type !== 'transfer' ? (categoryId || null) : null,
          amount: paise,
          payee: payee.trim() || null,
          note: noteWithDom,
          frequency,
          interval: Number(interval),
          startDate,
          endDate: endDate.trim() ? endDate : null,
        };

        await updateRecurringRuleAction(ruleToEdit.id, payload);
        toast.success('Recurring rule updated successfully');
      } else {
        const payload: CreateRecurringRuleDTO = {
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type !== 'transfer' ? (categoryId || null) : null,
          type,
          amount: paise,
          payee: payee.trim() || null,
          note: noteWithDom,
          frequency,
          interval: Number(interval),
          startDate,
          endDate: endDate.trim() ? endDate : null,
          nextOccurrence: startDate,
        };

        await createRecurringRuleAction(payload);
        toast.success('Recurring rule created successfully');
      }

      onClose();
      onSuccess();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to save recurring rule');
    } finally {
      setIsSubmitting(false);
    }
  };

  const filteredCategories = categories.filter(
    (c) => c.type === (type === 'income' ? 'income' : 'expense')
  );

  return (
    <div>
      {/* Quick Presets (Only on Create) */}
      {!isEditing && (
        <div className="flex flex-col gap-1.5 pt-1 mb-4">
          <span className="text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">
            Quick Templates
          </span>
          <div className="flex flex-wrap gap-1.5">
            {RECURRING_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() => applyPreset(preset.id)}
                className="px-2.5 py-1 text-xs rounded-full border bg-muted/60 hover:bg-muted font-medium transition-colors cursor-pointer"
              >
                {preset.label}
              </button>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-4">
        {/* Transaction Type */}
        {!isEditing && (
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Transaction Type</Label>
            <div className="grid grid-cols-3 gap-2">
              {(['expense', 'income', 'transfer'] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  onClick={() => {
                    setType(t);
                    if (t === 'income') {
                      setCategoryId(categories.find((c) => c.type === 'income')?.id || '');
                    } else if (t === 'expense') {
                      setCategoryId(categories.find((c) => c.type === 'expense')?.id || '');
                    }
                  }}
                  className={`py-1.5 text-xs font-semibold rounded-lg border transition-colors capitalize cursor-pointer ${
                    type === t
                      ? 'border-primary bg-primary/10 text-primary'
                      : 'border-border bg-card text-muted-foreground hover:bg-muted/50'
                  }`}
                >
                  {t}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Payee / Name & Amount */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="rule-payee" className="text-xs font-medium">
              Payee / Description
            </Label>
            <Input
              id="rule-payee"
              type="text"
              placeholder="e.g. Landlord, Netflix, SIP"
              value={payee}
              onChange={(e) => setPayee(e.target.value)}
              className="h-8 text-xs"
            />
          </div>

          <div className="space-y-1">
            <Label htmlFor="rule-amount" className="text-xs font-medium">
              Amount (₹) *
            </Label>
            <Input
              id="rule-amount"
              type="number"
              step="any"
              placeholder="0.00"
              value={amountRupees}
              onChange={(e) => setAmountRupees(e.target.value)}
              className="h-8 text-xs"
              required
            />
            {errors.amount && <p className="text-[11px] text-destructive">{errors.amount}</p>}
          </div>
        </div>

        {/* Frequency & Interval */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="rule-frequency" className="text-xs font-medium">
              Frequency
            </Label>
            <Select
              value={frequency}
              onValueChange={(val) => setFrequency(val as RecurringFrequency)}
            >
              <SelectTrigger id="rule-frequency" className="h-8 w-full text-xs">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="daily" className="text-xs">Daily</SelectItem>
                <SelectItem value="weekly" className="text-xs">Weekly</SelectItem>
                <SelectItem value="monthly" className="text-xs">Monthly</SelectItem>
                <SelectItem value="quarterly" className="text-xs">Quarterly</SelectItem>
                <SelectItem value="yearly" className="text-xs">Yearly</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-1">
            <Label htmlFor="rule-interval" className="text-xs font-medium">
              Interval (every X {frequency === 'daily' ? 'days' : frequency === 'weekly' ? 'weeks' : frequency === 'yearly' ? 'years' : 'months'})
            </Label>
            <Input
              id="rule-interval"
              type="number"
              min="1"
              value={interval}
              onChange={(e) => setInterval(Math.max(1, parseInt(e.target.value, 10) || 1))}
              className="h-8 text-xs"
            />
          </div>
        </div>

        {/* Day of Month (Monthly / Quarterly / Yearly) */}
        {(frequency === 'monthly' || frequency === 'quarterly' || frequency === 'yearly') && (
          <div className="p-2.5 rounded-lg border bg-muted/30 space-y-2">
            <div className="flex items-center justify-between">
              <Label htmlFor="rule-dom" className="text-xs font-medium">
                Day of Month
              </Label>
              <Badge variant="outline" className="text-[10px] font-mono">
                {dayOfMonth === 31 ? 'Last Day / 31st' : `${dayOfMonth}${['st','nd','rd'][((dayOfMonth+90)%100-10)%10-1]||'th'}`}
              </Badge>
            </div>

            <div className="flex items-center gap-2">
              <Input
                id="rule-dom"
                type="number"
                min="1"
                max="31"
                value={dayOfMonth}
                onChange={(e) => handleDayOfMonthChange(Math.min(31, Math.max(1, parseInt(e.target.value, 10) || 1)))}
                className="h-8 w-24 text-xs"
              />
              <div className="flex gap-1.5 flex-wrap">
                {[1, 5, 10, 15, 25, 31].map((d) => (
                  <button
                    key={d}
                    type="button"
                    onClick={() => handleDayOfMonthChange(d)}
                    className={`px-2 py-0.5 text-[11px] rounded border transition-colors cursor-pointer ${
                      dayOfMonth === d
                        ? 'border-primary bg-primary text-primary-foreground font-semibold'
                        : 'border-border bg-card hover:bg-muted text-muted-foreground'
                    }`}
                  >
                    {d === 31 ? '31st / Last' : `${d}th`}
                  </button>
                ))}
              </div>
            </div>

            <p className="text-[11px] text-muted-foreground leading-relaxed">
              Month-end clamping automatically adjusts dates on shorter months (e.g. Feb 28/29, Apr 30) and restores the anchor day on 31-day months.
            </p>
          </div>
        )}

        {/* Account Selection */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="rule-account" className="text-xs font-medium">
              {type === 'transfer' ? 'From Account *' : 'Account *'}
            </Label>
            <Select
              value={accountId || undefined}
              onValueChange={(val) => setAccountId(val || '')}
            >
              <SelectTrigger id="rule-account" className="h-8 w-full text-xs">
                <SelectValue placeholder="Select account" />
              </SelectTrigger>
              <SelectContent>
                {accounts.map((acc) => (
                  <SelectItem key={acc.id} value={acc.id} className="text-xs">
                    {acc.name} ({acc.kind.replace('_', ' ')})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {errors.accountId && <p className="text-[11px] text-destructive">{errors.accountId}</p>}
          </div>

          {type === 'transfer' ? (
            <div className="space-y-1">
              <Label htmlFor="rule-to-account" className="text-xs font-medium">
                To Account *
              </Label>
              <Select
                value={toAccountId || undefined}
                onValueChange={(val) => setToAccountId(val || '')}
              >
                <SelectTrigger id="rule-to-account" className="h-8 w-full text-xs">
                  <SelectValue placeholder="Select target account" />
                </SelectTrigger>
                <SelectContent>
                  {accounts
                    .filter((a) => a.id !== accountId)
                    .map((acc) => (
                      <SelectItem key={acc.id} value={acc.id} className="text-xs">
                        {acc.name} ({acc.kind.replace('_', ' ')})
                      </SelectItem>
                    ))}
                </SelectContent>
              </Select>
              {errors.toAccountId && <p className="text-[11px] text-destructive">{errors.toAccountId}</p>}
            </div>
          ) : (
            <div className="space-y-1">
              <Label htmlFor="rule-category" className="text-xs font-medium">
                Category
              </Label>
              <Select
                value={categoryId || '__none__'}
                onValueChange={(val) => setCategoryId((!val || val === '__none__') ? '' : val)}
              >
                <SelectTrigger id="rule-category" className="h-8 w-full text-xs">
                  <SelectValue placeholder="None / Uncategorized" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__" className="text-xs">None / Uncategorized</SelectItem>
                  {filteredCategories.map((cat) => (
                    <SelectItem key={cat.id} value={cat.id} className="text-xs">
                      {cat.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        {/* Dates */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1">
            <Label htmlFor="rule-start-date" className="text-xs font-medium">
              Start Date *
            </Label>
            <DatePicker
              id="rule-start-date"
              value={startDate}
              onChange={setStartDate}
              className="h-8 text-xs"
              required
              placeholder="Select start date"
            />
            {errors.startDate && <p className="text-[11px] text-destructive">{errors.startDate}</p>}
          </div>

          <div className="space-y-1">
            <Label htmlFor="rule-end-date" className="text-xs font-medium">
              End Date (Optional)
            </Label>
            <DatePicker
              id="rule-end-date"
              value={endDate}
              onChange={setEndDate}
              className="h-8 text-xs"
              placeholder="Select end date"
              clearable
            />
            {errors.endDate && <p className="text-[11px] text-destructive">{errors.endDate}</p>}
          </div>
        </div>

        {/* Note */}
        <div className="space-y-1">
          <Label htmlFor="rule-note" className="text-xs font-medium">
            Note (Optional)
          </Label>
          <Textarea
            id="rule-note"
            placeholder="Add any reminders, reference details or description"
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="text-xs min-h-[50px] resize-none"
          />
        </div>

        <DialogFooter className="gap-2 sm:gap-0 pt-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={onClose}
            disabled={isSubmitting}
          >
            Cancel
          </Button>
          <Button type="submit" size="sm" disabled={isSubmitting}>
            {isSubmitting ? (isEditing ? 'Updating...' : 'Creating...') : isEditing ? 'Update Rule' : 'Create Rule'}
          </Button>
        </DialogFooter>
      </form>
    </div>
  );
}

export function RecurringRuleDialog({
  open,
  onOpenChange,
  ruleToEdit,
  initialPresetId,
  accounts,
  categories,
  onSuccess,
}: RecurringRuleDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[520px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {ruleToEdit ? 'Edit Recurring Rule' : 'Create Recurring Rule'}
          </DialogTitle>
        </DialogHeader>

        {open && (
          <RecurringRuleForm
            key={ruleToEdit?.id ?? `new_${initialPresetId || 'blank'}`}
            ruleToEdit={ruleToEdit}
            initialPresetId={initialPresetId}
            accounts={accounts}
            categories={categories}
            onClose={() => onOpenChange(false)}
            onSuccess={onSuccess}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}
