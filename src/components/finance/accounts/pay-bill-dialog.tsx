'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { nanoid } from 'nanoid';
import {
  CreditCardIcon,
  HelpCircleIcon,
  AlertTriangleIcon,
  InfoIcon,
  CalendarIcon,
  CheckCircle2Icon,
} from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from '@/components/ui/sheet';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@/components/ui/popover';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useIsMobile } from '@/hooks/use-mobile';
import { useFinanceStore } from '../shared/finance-store';
import {
  formatINR,
  formatAccountDisplayBalance,
  formatLiabilityBalance,
  rupeesToPaise,
} from '../shared/format';
import { parseAmountExpression } from '../shared/expression-parser';
import { cn } from '@/lib/utils';

export function PayBillForm() {
  const {
    payBillCardId,
    closePayBill,
    accounts,
    transactions,
    categories,
    addTransaction,
  } = useFinanceStore();

  const creditCards = useMemo(
    () => accounts.filter((a) => a.kind === 'credit_card'),
    [accounts]
  );

  const bankAndCashAccounts = useMemo(
    () =>
      accounts.filter(
        (a) => (a.kind === 'bank' || a.kind === 'cash') && a.isActive
      ),
    [accounts]
  );

  // Selected destination card
  const [toCardId, setToCardId] = useState('');
  const [fromAccountId, setFromAccountId] = useState('');
  const [amountInput, setAmountInput] = useState('');
  const [date, setDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Locate the Credit Card Payment category
  const ccCategory = useMemo(() => {
    return categories.find(
      (c) => c.name.toLowerCase() === 'credit card payment' || c.id === 'cat_system_cc_payment'
    );
  }, [categories]);

  // When payBillCardId or available accounts change, initialize defaults
  useEffect(() => {
    // 1. Pick destination card
    const targetCard =
      (payBillCardId && creditCards.find((c) => c.id === payBillCardId)) ||
      creditCards.find((c) => c.outstanding > 0) ||
      creditCards[0];

    const cardId = targetCard?.id || '';
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setToCardId(cardId);

    // 2. Prefill amount with card's full outstanding
    if (targetCard && targetCard.outstanding > 0) {
      setAmountInput((targetCard.outstanding / 100).toString());
    } else {
      setAmountInput('');
    }

    // 3. Pick From account: last used to pay this card, else bank/cash with highest balance
    const lastPaymentTx = transactions.find(
      (t) => t.type === 'transfer' && t.toAccountId === cardId
    );
    const lastAccount = lastPaymentTx
      ? accounts.find((a) => a.id === lastPaymentTx.accountId && a.isActive)
      : null;

    if (lastAccount) {
      setFromAccountId(lastAccount.id);
    } else {
      const sortedBank = [...bankAndCashAccounts].sort((a, b) => b.balance - a.balance);
      setFromAccountId(sortedBank[0]?.id || accounts[0]?.id || '');
    }

    setDate(new Date().toISOString().split('T')[0]);
    setErrors({});
  }, [payBillCardId, creditCards, bankAndCashAccounts, accounts, transactions]);

  // On card change, update amount to full outstanding and update default from
  const handleCardChange = (cardId: string) => {
    setToCardId(cardId);
    const card = creditCards.find((c) => c.id === cardId);
    if (card && card.outstanding > 0) {
      setAmountInput((card.outstanding / 100).toString());
    }

    const lastPaymentTx = transactions.find(
      (t) => t.type === 'transfer' && t.toAccountId === cardId
    );
    const lastAccount = lastPaymentTx
      ? accounts.find((a) => a.id === lastPaymentTx.accountId && a.isActive)
      : null;

    if (lastAccount) {
      setFromAccountId(lastAccount.id);
    }
  };

  const selectedCard = useMemo(
    () => creditCards.find((c) => c.id === toCardId),
    [creditCards, toCardId]
  );

  const selectedFromAccount = useMemo(
    () => accounts.find((a) => a.id === fromAccountId),
    [accounts, fromAccountId]
  );

  const parsedExpression = useMemo(
    () => parseAmountExpression(amountInput),
    [amountInput]
  );

  const paymentPaise = parsedExpression.isValid && parsedExpression.paise ? parsedExpression.paise : 0;
  const cardOutstanding = selectedCard?.outstanding || 0;
  const fromBalance = selectedFromAccount?.balance || 0;

  // Impact calculations
  const outstandingAfter = Math.max(0, cardOutstanding - paymentPaise);
  const fromBalanceAfter = fromBalance - paymentPaise;
  const isInsufficientFunds = paymentPaise > fromBalance;
  const isOverpayment = paymentPaise > cardOutstanding && cardOutstanding > 0;
  const overpaymentAmount = Math.max(0, paymentPaise - cardOutstanding);

  const validate = (): boolean => {
    const newErrors: Record<string, string> = {};
    if (!toCardId) {
      newErrors.toCardId = 'Please select a credit card';
    }
    if (!fromAccountId) {
      newErrors.fromAccountId = 'Please select a payment source account';
    }
    if (fromAccountId && toCardId && fromAccountId === toCardId) {
      newErrors.fromAccountId = 'Source and destination account must be different';
    }
    if (!amountInput.trim()) {
      newErrors.amount = 'Payment amount is required';
    } else if (!parsedExpression.isValid || paymentPaise <= 0) {
      newErrors.amount = parsedExpression.error || 'Please enter a valid positive amount';
    }
    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  const handleConfirm = async () => {
    if (isSubmitting) return;
    if (!validate()) return;

    setIsSubmitting(true);
    const clientRequestId = `req-paybill-${nanoid(16)}`;

    try {
      const cardName = selectedCard?.name || 'Credit Card';
      const result = await addTransaction(
        {
          accountId: fromAccountId,
          toAccountId: toCardId,
          categoryId: ccCategory?.id || null,
          date,
          type: 'transfer',
          amount: paymentPaise,
          payee: `Payment to ${cardName}`,
          note: 'Credit card bill payment',
        },
        clientRequestId
      );

      toast.success(`Payment of ${formatINR(paymentPaise)} to ${cardName} confirmed`, {
        action: {
          label: 'Undo',
          onClick: async () => {
            await result.undo();
            toast.info('Card bill payment undone');
          },
        },
      });

      closePayBill();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to record card bill payment');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="space-y-4 pt-1">
      {/* Help Banner with Popover */}
      <div className="flex items-center justify-between p-2.5 rounded-lg bg-muted/40 border border-muted-foreground/10 text-xs">
        <div className="flex items-center gap-2 text-muted-foreground">
          <InfoIcon className="size-4 text-primary shrink-0" />
          <span>Card payments are transfers, not double-counted expenses.</span>
        </div>
        <Popover>
          <PopoverTrigger
            render={
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="size-6 p-0 text-muted-foreground hover:text-foreground"
                title="Learn how card bill payments work"
              >
                <HelpCircleIcon className="size-4" />
              </Button>
            }
          />
          <PopoverContent className="w-72 text-xs p-3 space-y-1.5" side="top">
            <h4 className="font-semibold text-foreground">How Card Payments Work</h4>
            <p className="text-muted-foreground">
              Spends on this card are recorded as expenses on the card. Paying the bill moves
              money from your bank to the card and is not counted as spending again.
            </p>
          </PopoverContent>
        </Popover>
      </div>

      {/* Credit Card Selector (Destination) */}
      <div className="space-y-1.5">
        <Label htmlFor="paybill-card" className="text-xs font-medium text-muted-foreground">
          Credit Card (To)
        </Label>
        <select
          id="paybill-card"
          className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
          value={toCardId}
          onChange={(e) => handleCardChange(e.target.value)}
        >
          {creditCards.map((card) => (
            <option key={card.id} value={card.id}>
              {card.name} ({formatLiabilityBalance(card.balance)})
            </option>
          ))}
        </select>
        {errors.toCardId && (
          <p className="text-xs font-medium text-destructive">{errors.toCardId}</p>
        )}
      </div>

      {/* Payment Source Account (From) */}
      <div className="space-y-1.5">
        <Label htmlFor="paybill-from" className="text-xs font-medium text-muted-foreground">
          Pay From Account
        </Label>
        <select
          id="paybill-from"
          className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
          value={fromAccountId}
          onChange={(e) => setFromAccountId(e.target.value)}
        >
          <option value="">Select bank or cash account...</option>
          {bankAndCashAccounts.map((acc) => (
            <option key={acc.id} value={acc.id}>
              {acc.name} ({formatINR(acc.balance)})
            </option>
          ))}
        </select>
        {errors.fromAccountId && (
          <p className="text-xs font-medium text-destructive">{errors.fromAccountId}</p>
        )}
      </div>

      {/* Amount Input with Quick Actions */}
      <div className="space-y-1.5">
        <div className="flex items-center justify-between">
          <Label htmlFor="paybill-amount" className="text-xs font-medium text-muted-foreground">
            Payment Amount
          </Label>
          {cardOutstanding > 0 && (
            <Button
              type="button"
              variant="link"
              size="sm"
              className="h-auto p-0 text-xs font-semibold text-primary"
              onClick={() => setAmountInput((cardOutstanding / 100).toString())}
            >
              Pay Full Bill ({formatINR(cardOutstanding)})
            </Button>
          )}
        </div>
        <div className="relative">
          <span className="absolute left-3.5 top-1/2 -translate-y-1/2 text-xl font-bold text-muted-foreground select-none">
            ₹
          </span>
          <Input
            id="paybill-amount"
            type="text"
            inputMode="decimal"
            autoFocus
            placeholder="0"
            className="pl-9 text-2xl font-bold tracking-tight h-12 bg-card"
            value={amountInput}
            onChange={(e) => setAmountInput(e.target.value)}
          />
        </div>
        {errors.amount && (
          <p className="text-xs font-medium text-destructive">{errors.amount}</p>
        )}
      </div>

      {/* Date */}
      <div className="space-y-1.5">
        <Label htmlFor="paybill-date" className="text-xs font-medium text-muted-foreground">
          Payment Date
        </Label>
        <div className="relative">
          <Input
            id="paybill-date"
            type="date"
            className="h-9 text-xs bg-card"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>
      </div>

      {/* Balance Impact & Status Card */}
      <div className="p-3 rounded-lg border bg-muted/20 space-y-2 text-xs">
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Outstanding Now:</span>
          <span className="font-semibold text-destructive">{formatINR(cardOutstanding)}</span>
        </div>
        <div className="flex justify-between items-center">
          <span className="text-muted-foreground">Outstanding After Payment:</span>
          <span className="font-semibold text-foreground">{formatINR(outstandingAfter)}</span>
        </div>
        <div className="flex justify-between items-center border-t pt-2">
          <span className="text-muted-foreground">From Account Balance After:</span>
          <span
            className={cn(
              'font-semibold',
              fromBalanceAfter < 0 ? 'text-destructive font-bold' : 'text-foreground'
            )}
          >
            {formatINR(fromBalanceAfter)}
          </span>
        </div>
      </div>

      {/* Warnings & Notices */}
      {isInsufficientFunds && (
        <div className="p-2.5 rounded-md bg-destructive/10 border border-destructive/20 text-xs text-destructive flex items-start gap-2">
          <AlertTriangleIcon className="size-4 shrink-0 mt-0.5" />
          <span>
            <strong>Insufficient funds warning:</strong> This payment exceeds the available balance
            in {selectedFromAccount?.name || 'the selected source account'}.
          </span>
        </div>
      )}

      {isOverpayment && (
        <div className="p-2.5 rounded-md bg-primary/10 border border-primary/20 text-xs text-foreground flex items-start gap-2">
          <InfoIcon className="size-4 text-primary shrink-0 mt-0.5" />
          <span>
            Overpayment of <strong>{formatINR(overpaymentAmount)}</strong> becomes a credit on the
            card.
          </span>
        </div>
      )}

      {/* Buttons */}
      <div className="flex flex-col-reverse sm:flex-row items-center justify-end gap-2 pt-3 border-t">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="w-full sm:w-auto text-xs"
          onClick={closePayBill}
        >
          Cancel
        </Button>
        <Button
          type="button"
          size="sm"
          className="w-full sm:w-auto text-xs font-semibold gap-1.5"
          disabled={isSubmitting || paymentPaise <= 0}
          onClick={handleConfirm}
        >
          {isSubmitting ? (
            'Processing...'
          ) : (
            <>
              <CheckCircle2Icon className="size-3.5" />
              <span>Confirm Payment</span>
            </>
          )}
        </Button>
      </div>
    </div>
  );
}

export function PayBillDialog() {
  const isMobile = useIsMobile();
  const { payBillOpen, closePayBill } = useFinanceStore();

  if (isMobile) {
    return (
      <Sheet open={payBillOpen} onOpenChange={(open) => !open && closePayBill()}>
        <SheetContent side="bottom" className="rounded-t-2xl max-h-[92vh] overflow-y-auto px-4 pb-6">
          <SheetHeader className="text-left pb-2">
            <SheetTitle className="text-base font-bold flex items-center gap-2">
              <CreditCardIcon className="size-4 text-primary" />
              <span>Pay Credit Card Bill</span>
            </SheetTitle>
          </SheetHeader>
          <PayBillForm />
        </SheetContent>
      </Sheet>
    );
  }

  return (
    <Dialog open={payBillOpen} onOpenChange={(open) => !open && closePayBill()}>
      <DialogContent className="sm:max-w-[440px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold flex items-center gap-2">
            <CreditCardIcon className="size-4 text-primary" />
            <span>Pay Credit Card Bill</span>
          </DialogTitle>
        </DialogHeader>
        <PayBillForm />
      </DialogContent>
    </Dialog>
  );
}
