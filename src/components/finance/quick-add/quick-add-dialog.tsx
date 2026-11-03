'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import {
  CreditCardIcon,
  CheckIcon,
  ArrowRightLeftIcon,
  SparklesIcon,
  AlertTriangleIcon,
} from 'lucide-react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { useIsMobile } from '@/hooks/use-mobile';
import { useFinanceStore } from '../shared/finance-store';
import { parseAmountExpression } from '../shared/expression-parser';
import { getDeterministicCategoryColor } from '@src/lib/finance/colors';
import { formatINR, formatAccountDisplayBalance } from '../shared/format';
import { CategoryCombobox } from '../shared/category-combobox';
import { todayInTz, yesterdayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import type { TransactionType } from '@src/lib/finance/constants';
import type { CreateTransactionDTO } from '@src/lib/finance/contract';
import { cn } from '@/lib/utils';

export function QuickAddForm({
  onClose,
  initialData,
}: {
  onClose?: () => void;
  initialData?: Partial<CreateTransactionDTO> | null;
}) {
  const {
    accounts,
    categories,
    transactions,
    lastUsedAccountId,
    addTransaction,
    openPayBill,
  } = useFinanceStore();

  // Form states
  const [type, setType] = useState<TransactionType>('expense');
  const [amountInput, setAmountInput] = useState('');
  const [accountId, setAccountId] = useState('');
  const [toAccountId, setToAccountId] = useState('');
  const [showCardsAndLoans, setShowCardsAndLoans] = useState(false);
  const [categoryId, setCategoryId] = useState('');
  const [payee, setPayee] = useState('');
  const [note, setNote] = useState('');
  const [dateSelection, setDateSelection] = useState<'today' | 'yesterday' | 'custom'>('today');
  const [customDate, setCustomDate] = useState(() => todayInTz(DEFAULT_TZ));
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Default asset account helper (never defaults to a liability)
  const defaultAssetAccountId = useMemo(() => {
    const lastAcc = accounts.find((a) => a.id === lastUsedAccountId);
    if (lastAcc && lastAcc.class === 'asset') return lastAcc.id;
    const firstBankOrCash = accounts.find((a) => (a.kind === 'bank' || a.kind === 'cash' || a.kind === 'wallet') && a.isActive);
    if (firstBankOrCash) return firstBankOrCash.id;
    const firstAsset = accounts.find((a) => a.class === 'asset' && a.isActive);
    return firstAsset?.id || accounts[0]?.id || '';
  }, [accounts, lastUsedAccountId]);

  // Today and Yesterday date strings in user timezone (Asia/Kolkata)
  const todayStr = useMemo(() => todayInTz(DEFAULT_TZ), []);
  const yesterdayStr = useMemo(() => yesterdayInTz(DEFAULT_TZ), []);

  const activeDate = useMemo(() => {
    if (dateSelection === 'today') return todayStr;
    if (dateSelection === 'yesterday') return yesterdayStr;
    return customDate;
  }, [dateSelection, todayStr, yesterdayStr, customDate]);

  // Evaluated expression amount
  const parsedExpression = useMemo(
    () => parseAmountExpression(amountInput),
    [amountInput]
  );

  // Sync initial data
  useEffect(() => {
    if (initialData) {
      const initType = initialData.type || 'expense';
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setType(initType);
      if (initialData.amount) {
        setAmountInput((initialData.amount / 100).toString());
      } else {
        setAmountInput('');
      }

      let fromId = initialData.accountId || lastUsedAccountId || '';
      if (initType === 'transfer') {
        const fromAcc = accounts.find((a) => a.id === fromId);
        if (!fromAcc || fromAcc.class === 'liability') {
          fromId = defaultAssetAccountId;
        }
      } else {
        if (!fromId) fromId = accounts[0]?.id || '';
      }
      setAccountId(fromId);
      setToAccountId(initialData.toAccountId || '');
      setCategoryId(initialData.categoryId || '');
      setPayee(initialData.payee || '');
      setNote(initialData.note || '');
      if (initialData.date) {
        if (initialData.date === todayStr) {
          setDateSelection('today');
        } else if (initialData.date === yesterdayStr) {
          setDateSelection('yesterday');
        } else {
          setDateSelection('custom');
          setCustomDate(initialData.date);
        }
      }
    } else {
      setType('expense');
      setAmountInput('');
      setAccountId(lastUsedAccountId || accounts[0]?.id || '');
      setToAccountId('');
      setCategoryId('');
      setPayee('');
      setNote('');
      setDateSelection('today');
    }
    setErrors({});
    setShowCardsAndLoans(false);
  }, [initialData, lastUsedAccountId, accounts, defaultAssetAccountId, todayStr, yesterdayStr]);

  // Auto-suggest category based on payee
  const handlePayeeChange = (val: string) => {
    setPayee(val);
    if (!val.trim()) return;

    const matchedCatId = transactions.find(
      (t) => t.payee?.trim().toLowerCase() === val.trim().toLowerCase() && t.categoryId
    )?.categoryId;
    if (matchedCatId && (!categoryId || categoryId === '')) {
      const exists = categories.some((c) => c.id === matchedCatId);
      if (exists) {
        setCategoryId(matchedCatId);
      }
    }
  };

  // Selected accounts
  const selectedToAccount = useMemo(
    () => accounts.find((a) => a.id === toAccountId),
    [accounts, toAccountId]
  );

  // Destination credit card quick payment amount helper
  const destinationIsCard = selectedToAccount?.kind === 'credit_card';
  const cardOutstanding = destinationIsCard ? selectedToAccount?.outstanding || 0 : 0;

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};

    if (!amountInput.trim()) {
      newErrors.amount = 'Amount is required';
    } else if (!parsedExpression.isValid || !parsedExpression.paise || parsedExpression.paise <= 0) {
      newErrors.amount = parsedExpression.error || 'Please enter a valid positive amount';
    }

    if (!accountId) {
      newErrors.accountId = 'Please select an account';
    }

    if (type === 'transfer') {
      if (!toAccountId) {
        newErrors.toAccountId = 'Destination account is required for transfers';
      } else if (toAccountId === accountId) {
        newErrors.toAccountId = 'Destination must be different from source account';
      }
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleSubmit = async (keepOpenAfterSave = false) => {
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    const clientRequestId = `req-${nanoid(16)}`;

    try {
      const paise = parsedExpression.paise!;
      const result = await addTransaction(
        {
          accountId,
          toAccountId: type === 'transfer' ? toAccountId : null,
          categoryId: type !== 'transfer' ? (categoryId || null) : null,
          date: activeDate,
          type,
          amount: paise,
          payee: payee.trim() || null,
          note: note.trim() || null,
        },
        clientRequestId
      );

      const typeLabel = type === 'expense' ? 'Expense' : type === 'income' ? 'Income' : 'Transfer';
      toast.success(`${typeLabel} of ${formatINR(paise)} added`, {
        action: {
          label: 'Undo',
          onClick: () => {
            result.undo();
            toast.info('Transaction undone');
          },
        },
      });

      if (keepOpenAfterSave) {
        setAmountInput('');
        setPayee('');
        setNote('');
        setCategoryId('');
        setErrors({});
      } else {
        onClose?.();
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add transaction');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
      e.preventDefault();
      handleSubmit(false);
    }
  };

  return (
    <div className="space-y-4" onKeyDown={handleKeyDown}>
      {/* Type Segmented Control */}
      <div
        role="radiogroup"
        aria-label="Transaction Type"
        className="grid grid-cols-3 p-1 bg-muted rounded-lg text-xs font-medium"
      >
        <button
          type="button"
          role="radio"
          aria-checked={type === 'expense'}
          className={cn(
            'py-1.5 px-3 rounded-md transition-all text-center flex items-center justify-center gap-1.5',
            type === 'expense'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => {
            setType('expense');
            setCategoryId('');
          }}
        >
          <span className="size-2 rounded-full bg-red-500 inline-block" />
          <span>Expense</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={type === 'income'}
          className={cn(
            'py-1.5 px-3 rounded-md transition-all text-center flex items-center justify-center gap-1.5',
            type === 'income'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => {
            setType('income');
            setCategoryId('');
          }}
        >
          <span className="size-2 rounded-full bg-emerald-500 inline-block" />
          <span>Income</span>
        </button>

        <button
          type="button"
          role="radio"
          aria-checked={type === 'transfer'}
          className={cn(
            'py-1.5 px-3 rounded-md transition-all text-center flex items-center justify-center gap-1.5',
            type === 'transfer'
              ? 'bg-background text-foreground shadow-xs font-semibold'
              : 'text-muted-foreground hover:text-foreground'
          )}
          onClick={() => {
            setType('transfer');
            setCategoryId('');
            const currentAcc = accounts.find((a) => a.id === accountId);
            if (!currentAcc || currentAcc.class === 'liability') {
              setAccountId(defaultAssetAccountId);
            }
          }}
        >
          <ArrowRightLeftIcon className="size-3 text-blue-500 inline-block" />
          <span>Transfer</span>
        </button>
      </div>

      {/* Amount Input with live expression support */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="amount-input" className="text-xs font-medium text-muted-foreground">
            Amount
          </Label>
          {parsedExpression.isValid && parsedExpression.paise && parsedExpression.paise > 0 && amountInput.includes('+') && (
            <span className="text-xs font-semibold text-emerald-600 dark:text-emerald-400 bg-emerald-50 dark:bg-emerald-950/60 px-2 py-0.5 rounded-full flex items-center gap-1">
              <SparklesIcon className="size-3" />
              = {formatINR(parsedExpression.paise)}
            </span>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground select-none">
            ₹
          </span>
          <Input
            id="amount-input"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            className="pl-9 text-2xl sm:text-3xl font-bold tracking-tight h-13 bg-card"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </div>
        {errors.amount && (
          <p className="text-xs font-medium text-destructive mt-1">{errors.amount}</p>
        )}
      </div>

      {/* Account Selectors */}
      {type === 'transfer' ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="from-account" className="text-xs font-medium text-muted-foreground">
                From Account
              </Label>
              <button
                type="button"
                onClick={() => setShowCardsAndLoans((prev) => !prev)}
                className="text-[10px] text-muted-foreground hover:text-foreground underline underline-offset-2"
              >
                {showCardsAndLoans ? 'Hide cards & loans' : 'Show cards and loans'}
              </button>
            </div>
            <Select
              value={accountId || undefined}
              onValueChange={(val) => setAccountId(val || '')}
            >
              <SelectTrigger id="from-account" className="w-full h-9 bg-card px-3 text-xs">
                <SelectValue placeholder="Select source account..." />
              </SelectTrigger>
              <SelectContent>
                {(showCardsAndLoans ? accounts : accounts.filter((a) => a.class === 'asset')).map((acc) => (
                  <SelectItem key={acc.id} value={acc.id} className="text-xs">
                    {acc.name} ({formatAccountDisplayBalance(acc)})
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
            {accounts.find((a) => a.id === accountId)?.class === 'liability' && (
              <div className="flex items-center gap-1.5 p-2 rounded-md bg-amber-500/10 border border-amber-500/20 text-amber-700 dark:text-amber-400 text-[11px]">
                <AlertTriangleIcon className="size-3.5 shrink-0" />
                <span>This records a cash advance from your card or loan.</span>
              </div>
            )}
            {errors.accountId && (
              <p className="text-xs font-medium text-destructive">{errors.accountId}</p>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="to-account" className="text-xs font-medium text-muted-foreground">
              To Account
            </Label>
            <Select
              value={toAccountId || undefined}
              onValueChange={(val) => setToAccountId(val || '')}
            >
              <SelectTrigger id="to-account" className="w-full h-9 bg-card px-3 text-xs">
                <SelectValue placeholder="Select destination..." />
              </SelectTrigger>
              <SelectContent>
                {accounts
                  .filter((a) => a.id !== accountId)
                  .map((acc) => (
                    <SelectItem key={acc.id} value={acc.id} className="text-xs">
                      {acc.name} ({formatAccountDisplayBalance(acc)})
                    </SelectItem>
                  ))}
              </SelectContent>
            </Select>
            {errors.toAccountId && (
              <p className="text-xs font-medium text-destructive">{errors.toAccountId}</p>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-1.5">
          <Label htmlFor="account-select" className="text-xs font-medium text-muted-foreground">
            Account
          </Label>
          <Select
            value={accountId || undefined}
            onValueChange={(val) => setAccountId(val || '')}
          >
            <SelectTrigger id="account-select" className="w-full h-9 bg-card px-3 text-xs">
              <SelectValue placeholder="Select account..." />
            </SelectTrigger>
            <SelectContent>
              {accounts.map((acc) => (
                <SelectItem key={acc.id} value={acc.id} className="text-xs">
                  {acc.name} ({formatAccountDisplayBalance(acc)})
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {errors.accountId && (
            <p className="text-xs font-medium text-destructive">{errors.accountId}</p>
          )}
        </div>
      )}

      {/* Credit Card Bill Shortcut Pill (for transfers to card) */}
      {type === 'transfer' && destinationIsCard && cardOutstanding > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-md p-2.5 flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <CreditCardIcon className="size-4 text-primary shrink-0" />
            <div className="text-xs">
              <span className="font-semibold text-foreground">Card bill due: </span>
              <span className="text-destructive font-bold">{formatINR(cardOutstanding)}</span>
            </div>
          </div>
          <div className="flex items-center gap-1.5">
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-medium px-2.5"
              onClick={() => setAmountInput((cardOutstanding / 100).toString())}
            >
              Pay full
            </Button>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-7 text-xs font-medium px-2.5"
              onClick={() => {
                const el = document.getElementById('amount-input') as HTMLInputElement | null;
                el?.focus();
              }}
            >
              Custom
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              className="h-7 text-xs font-semibold px-2.5"
              onClick={() => {
                onClose?.();
                openPayBill(toAccountId);
              }}
            >
              Pay bill dialog
            </Button>
          </div>
        </div>
      )}

      {/* Category Selection (Expense / Income) */}
      {type !== 'transfer' && (
        <div className="space-y-1.5">
          <Label htmlFor="quick-add-category" className="text-xs font-medium text-muted-foreground">
            Category
          </Label>
          <CategoryCombobox
            id="quick-add-category"
            value={categoryId}
            onValueChange={(val) => setCategoryId(val)}
            categories={categories}
            filterType={type as 'expense' | 'income'}
            placeholder="Search category or select below..."
          />
        </div>
      )}

      {/* Date Selector */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="transaction-date-picker" className="text-xs font-medium text-muted-foreground">
            Transaction Date
          </Label>
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className={cn(
                'px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors border',
                activeDate === todayStr
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              )}
              onClick={() => {
                setCustomDate(todayStr);
                setDateSelection('today');
              }}
            >
              Today
            </button>
            <button
              type="button"
              className={cn(
                'px-2.5 py-0.5 text-[11px] rounded font-medium transition-colors border',
                activeDate === yesterdayStr
                  ? 'bg-primary text-primary-foreground border-primary'
                  : 'bg-muted/40 text-muted-foreground border-border hover:bg-muted'
              )}
              onClick={() => {
                setCustomDate(yesterdayStr);
                setDateSelection('yesterday');
              }}
            >
              Yesterday
            </button>
          </div>
        </div>
        <DatePicker
          id="transaction-date-picker"
          className="h-9 text-xs w-full bg-card"
          value={activeDate}
          onChange={(newDate) => {
            setCustomDate(newDate);
            if (newDate === todayStr) setDateSelection('today');
            else if (newDate === yesterdayStr) setDateSelection('yesterday');
            else setDateSelection('custom');
          }}
          placeholder="Select transaction date"
        />
      </div>

      {/* Payee and Note */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="payee-input" className="text-xs font-medium text-muted-foreground">
            {type === 'transfer' ? 'Recipient / Note' : 'Payee'}
          </Label>
          <Input
            id="payee-input"
            type="text"
            placeholder={type === 'income' ? 'e.g. Employer, Dividend' : 'e.g. Starbucks, Amazon'}
            className="h-9 text-xs bg-card"
            value={payee}
            onChange={(e) => handlePayeeChange(e.target.value)}
          />
        </div>

        <div className="space-y-1.5">
          <Label htmlFor="note-input" className="text-xs font-medium text-muted-foreground">
            Note (optional)
          </Label>
          <Input
            id="note-input"
            type="text"
            placeholder="e.g. Lunch with friends"
            className="h-9 text-xs bg-card"
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </div>
      </div>

      {/* Action Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-3 border-t">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto text-xs"
          onClick={onClose}
        >
          Cancel (Esc)
        </Button>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          className="w-full sm:w-auto text-xs"
          disabled={isSubmitting}
          onClick={() => handleSubmit(true)}
        >
          Add Another
        </Button>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto text-xs font-semibold"
          disabled={isSubmitting}
          onClick={() => handleSubmit(false)}
        >
          {isSubmitting ? 'Saving...' : type === 'expense' ? 'Save Expense' : type === 'income' ? 'Save Income' : 'Save Transfer'}
        </Button>
      </div>
    </div>
  );
}

export function QuickAddDialog() {
  const isMobile = useIsMobile();
  const {
    quickAddOpen,
    quickAddInitialData,
    closeQuickAdd,
  } = useFinanceStore();

  const handleOpenChange = (open: boolean) => {
    if (!open) {
      closeQuickAdd();
      setTimeout(() => {
        if (typeof document !== 'undefined') {
          document.body.removeAttribute('inert');
          document.body.style.pointerEvents = '';
          if (!document.querySelector('[data-slot="dialog-content"], [data-slot="sheet-content"]')) {
            document.querySelectorAll('[data-base-ui-inert]').forEach((el) => {
              el.removeAttribute('data-base-ui-inert');
              el.removeAttribute('inert');
              el.removeAttribute('aria-hidden');
            });
          }
        }
      }, 50);
    }
  };

  const formContent = quickAddOpen ? (
    <QuickAddForm
      key={quickAddInitialData ? JSON.stringify(quickAddInitialData) : 'qa-new'}
      onClose={() => handleOpenChange(false)}
      initialData={quickAddInitialData}
    />
  ) : null;

  if (isMobile) {
    return (
      <Sheet open={quickAddOpen} onOpenChange={handleOpenChange}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto px-4 pb-6">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-base font-bold">Quick Add Transaction</SheetTitle>
          </SheetHeader>
          {formContent}
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={quickAddOpen} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Quick Add Transaction</DialogTitle>
        </DialogHeader>
        {formContent}
      </DialogContent>
    </Dialog>
  );
}
