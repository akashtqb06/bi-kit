'use client';

import React, { useState } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useFinanceStore } from '../shared/finance-store';
import { rupeesToPaise } from '../shared/format';
import type { AccountKind } from '@src/lib/finance/constants';

export function AddAccountForm({
  onSuccess,
  onCancel,
}: {
  onSuccess?: () => void;
  onCancel?: () => void;
}) {
  const { addAccount } = useFinanceStore();

  const [name, setName] = useState('');
  const [kind, setKind] = useState<AccountKind>('bank');
  const currency = 'INR';

  // Generic / Bank fields
  const [openingBalanceRupees, setOpeningBalanceRupees] = useState('');
  const [openingDate, setOpeningDate] = useState(() => new Date().toISOString().split('T')[0]);

  // Card fields
  const [creditLimitRupees, setCreditLimitRupees] = useState('');
  const [currentOutstandingRupees, setCurrentOutstandingRupees] = useState('');
  const [statementDay, setStatementDay] = useState('15');
  const [dueDay, setDueDay] = useState('5');

  // Deposit fields (FD/RD)
  const [principalRupees, setPrincipalRupees] = useState('');
  const [rate, setRate] = useState('');
  const [compounding, setCompounding] = useState<'quarterly' | 'monthly' | 'yearly'>('quarterly');
  const [startDate, setStartDate] = useState(() => new Date().toISOString().split('T')[0]);
  const [maturityDate, setMaturityDate] = useState('');
  const [tenureMonths, setTenureMonths] = useState('12');

  // Investment fields
  const [initialValueRupees, setInitialValueRupees] = useState('');

  // Loan fields
  const [loanAmountRupees, setLoanAmountRupees] = useState('');
  const [loanRate, setLoanRate] = useState('');
  const [emiRupees, setEmiRupees] = useState('');

  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!name.trim()) errs.name = 'Account name is required';

    if (kind === 'credit_card') {
      if (creditLimitRupees && isNaN(parseFloat(creditLimitRupees))) {
        errs.creditLimit = 'Enter a valid credit limit';
      }
    }

    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || isSubmitting) return;

    try {
      setIsSubmitting(true);
      let openingPaise = 0;
      let limitPaise: number | undefined;
      const metadata: Record<string, unknown> = {};

      if (kind === 'bank' || kind === 'cash' || kind === 'other_asset') {
        openingPaise = openingBalanceRupees ? rupeesToPaise(parseFloat(openingBalanceRupees)) : 0;
        metadata.openingDate = openingDate;
      } else if (kind === 'credit_card') {
        limitPaise = creditLimitRupees ? rupeesToPaise(parseFloat(creditLimitRupees)) : 0;
        openingPaise = currentOutstandingRupees ? rupeesToPaise(parseFloat(currentOutstandingRupees)) : 0;
        metadata.statementDay = parseInt(statementDay, 10);
        metadata.dueDay = parseInt(dueDay, 10);
      } else if (kind === 'fixed_deposit') {
        openingPaise = principalRupees ? rupeesToPaise(parseFloat(principalRupees)) : 0;
        metadata.principal = openingPaise;
        metadata.rate = parseFloat(rate) || 0;
        metadata.compounding = compounding;
        metadata.startDate = startDate;
        metadata.maturityDate = maturityDate;
      } else if (kind === 'recurring_deposit') {
        openingPaise = principalRupees ? rupeesToPaise(parseFloat(principalRupees)) : 0;
        metadata.installment = openingPaise;
        metadata.rate = parseFloat(rate) || 0;
        metadata.startDate = startDate;
        metadata.tenureMonths = parseInt(tenureMonths, 10) || 12;
      } else if (kind === 'mutual_fund' || kind === 'stocks') {
        openingPaise = initialValueRupees ? rupeesToPaise(parseFloat(initialValueRupees)) : 0;
        metadata.costBasis = openingPaise;
      } else if (kind === 'loan' || kind === 'other_liability') {
        openingPaise = loanAmountRupees ? rupeesToPaise(parseFloat(loanAmountRupees)) : 0;
        metadata.interestRate = parseFloat(loanRate) || 0;
        metadata.emiAmount = emiRupees ? rupeesToPaise(parseFloat(emiRupees)) : 0;
      }

      await addAccount({
        name: name.trim(),
        kind,
        currency,
        creditLimit: limitPaise,
        openingBalance: openingPaise,
        openingDate,
        statementDay: kind === 'credit_card' ? parseInt(statementDay, 10) : undefined,
        dueDay: kind === 'credit_card' ? parseInt(dueDay, 10) : undefined,
        metadata,
      });

      toast.success(`Account "${name.trim()}" created`);
      onSuccess?.();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to create account');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 py-2">
      {/* Account Kind Selection */}
      <div className="space-y-1.5">
        <Label htmlFor="account-kind" className="text-xs font-medium text-muted-foreground">
          Account Kind
        </Label>
        <select
          id="account-kind"
          data-testid="account-kind-select"
          className="w-full h-9 rounded-md border border-input bg-card px-3 text-xs focus:ring-1 focus:ring-primary focus:outline-hidden"
          value={kind}
          onChange={(e) => setKind(e.target.value as AccountKind)}
        >
          <option value="bank">Bank Account (Checking / Savings)</option>
          <option value="cash">Cash / Physical Wallet</option>
          <option value="credit_card">Credit Card</option>
          <option value="fixed_deposit">Fixed Deposit (FD)</option>
          <option value="recurring_deposit">Recurring Deposit (RD)</option>
          <option value="mutual_fund">Mutual Funds Portfolio</option>
          <option value="stocks">Demat / Stocks</option>
          <option value="loan">Loan (Home, Auto, Personal)</option>
          <option value="other_asset">Other Asset</option>
          <option value="other_liability">Other Liability</option>
        </select>
      </div>

      {/* Account Name */}
      <div className="space-y-1.5">
        <Label htmlFor="account-name" className="text-xs font-medium text-muted-foreground">
          Account Name
        </Label>
        <Input
          id="account-name"
          placeholder="e.g. HDFC Salary, ICICI Amazon Pay, Zerodha"
          className="h-9 text-xs bg-card"
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        {errors.name && <p className="text-xs text-destructive">{errors.name}</p>}
      </div>

      {/* Currency */}
      <div className="space-y-1.5">
        <Label htmlFor="account-currency" className="text-xs font-medium text-muted-foreground">
          Currency
        </Label>
        <Input
          id="account-currency"
          disabled
          value={currency}
          className="h-9 text-xs bg-muted/50 cursor-not-allowed"
        />
      </div>

      {/* Dynamic Kind-Specific Fields */}
      {/* Bank & Cash Fields */}
      {(kind === 'bank' || kind === 'cash' || kind === 'other_asset') && (
        <div data-testid="kind-fields-bank" className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label htmlFor="opening-balance" className="text-xs font-medium text-muted-foreground">
              Opening Balance (₹)
            </Label>
            <Input
              id="opening-balance"
              type="number"
              placeholder="0.00"
              className="h-9 text-xs bg-card"
              value={openingBalanceRupees}
              onChange={(e) => setOpeningBalanceRupees(e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="opening-date" className="text-xs font-medium text-muted-foreground">
              Opening Date
            </Label>
            <Input
              id="opening-date"
              type="date"
              className="h-9 text-xs bg-card"
              value={openingDate}
              onChange={(e) => setOpeningDate(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Credit Card Fields */}
      {kind === 'credit_card' && (
        <div data-testid="kind-fields-card" className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="credit-limit" className="text-xs font-medium text-muted-foreground">
                Credit Limit (₹)
              </Label>
              <Input
                id="credit-limit"
                type="number"
                placeholder="150000"
                className="h-9 text-xs bg-card"
                value={creditLimitRupees}
                onChange={(e) => setCreditLimitRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="current-outstanding" className="text-xs font-medium text-muted-foreground">
                Current Outstanding (₹)
              </Label>
              <Input
                id="current-outstanding"
                type="number"
                placeholder="0"
                className="h-9 text-xs bg-card"
                value={currentOutstandingRupees}
                onChange={(e) => setCurrentOutstandingRupees(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="statement-day" className="text-xs font-medium text-muted-foreground">
                Statement Day of Month
              </Label>
              <Input
                id="statement-day"
                type="number"
                min="1"
                max="31"
                placeholder="15"
                className="h-9 text-xs bg-card"
                value={statementDay}
                onChange={(e) => setStatementDay(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="due-day" className="text-xs font-medium text-muted-foreground">
                Payment Due Day of Month
              </Label>
              <Input
                id="due-day"
                type="number"
                min="1"
                max="31"
                placeholder="5"
                className="h-9 text-xs bg-card"
                value={dueDay}
                onChange={(e) => setDueDay(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Fixed Deposit Fields */}
      {kind === 'fixed_deposit' && (
        <div data-testid="kind-fields-fd" className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fd-principal" className="text-xs font-medium text-muted-foreground">
                Principal Deposit Amount (₹)
              </Label>
              <Input
                id="fd-principal"
                type="number"
                placeholder="100000"
                className="h-9 text-xs bg-card"
                value={principalRupees}
                onChange={(e) => setPrincipalRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-rate" className="text-xs font-medium text-muted-foreground">
                Annual Interest Rate (%)
              </Label>
              <Input
                id="fd-rate"
                type="number"
                step="0.05"
                placeholder="7.25"
                className="h-9 text-xs bg-card"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="fd-compounding" className="text-xs font-medium text-muted-foreground">
                Compounding
              </Label>
              <select
                id="fd-compounding"
                className="w-full h-9 rounded-md border border-input bg-card px-2 text-xs"
                value={compounding}
                onChange={(e) => setCompounding(e.target.value as typeof compounding)}
              >
                <option value="quarterly">Quarterly (Bank Default)</option>
                <option value="monthly">Monthly</option>
                <option value="yearly">Yearly</option>
              </select>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-start" className="text-xs font-medium text-muted-foreground">
                Start Date
              </Label>
              <Input
                id="fd-start"
                type="date"
                className="h-9 text-xs bg-card"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="fd-maturity" className="text-xs font-medium text-muted-foreground">
                Maturity Date
              </Label>
              <Input
                id="fd-maturity"
                type="date"
                className="h-9 text-xs bg-card"
                value={maturityDate}
                onChange={(e) => setMaturityDate(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Recurring Deposit Fields */}
      {kind === 'recurring_deposit' && (
        <div data-testid="kind-fields-rd" className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rd-installment" className="text-xs font-medium text-muted-foreground">
                Monthly Installment (₹)
              </Label>
              <Input
                id="rd-installment"
                type="number"
                placeholder="10000"
                className="h-9 text-xs bg-card"
                value={principalRupees}
                onChange={(e) => setPrincipalRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd-rate" className="text-xs font-medium text-muted-foreground">
                Interest Rate (%)
              </Label>
              <Input
                id="rd-rate"
                type="number"
                step="0.05"
                placeholder="7.00"
                className="h-9 text-xs bg-card"
                value={rate}
                onChange={(e) => setRate(e.target.value)}
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="rd-start" className="text-xs font-medium text-muted-foreground">
                Start Date
              </Label>
              <Input
                id="rd-start"
                type="date"
                className="h-9 text-xs bg-card"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="rd-tenure" className="text-xs font-medium text-muted-foreground">
                Tenure (Months)
              </Label>
              <Input
                id="rd-tenure"
                type="number"
                placeholder="12"
                className="h-9 text-xs bg-card"
                value={tenureMonths}
                onChange={(e) => setTenureMonths(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      {/* Investment Fields (Mutual Funds & Stocks) */}
      {(kind === 'mutual_fund' || kind === 'stocks') && (
        <div data-testid="kind-fields-investment" className="space-y-3 pt-2 border-t">
          <div className="space-y-1.5">
            <Label htmlFor="investment-value" className="text-xs font-medium text-muted-foreground">
              Opening Portfolio Value / Cost Basis (₹)
            </Label>
            <Input
              id="investment-value"
              type="number"
              placeholder="100000"
              className="h-9 text-xs bg-card"
              value={initialValueRupees}
              onChange={(e) => setInitialValueRupees(e.target.value)}
            />
          </div>
        </div>
      )}

      {/* Loan Fields */}
      {(kind === 'loan' || kind === 'other_liability') && (
        <div data-testid="kind-fields-loan" className="space-y-3 pt-2 border-t">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="loan-principal" className="text-xs font-medium text-muted-foreground">
                Outstanding Principal (₹)
              </Label>
              <Input
                id="loan-principal"
                type="number"
                placeholder="500000"
                className="h-9 text-xs bg-card"
                value={loanAmountRupees}
                onChange={(e) => setLoanAmountRupees(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-rate" className="text-xs font-medium text-muted-foreground">
                Interest Rate (%)
              </Label>
              <Input
                id="loan-rate"
                type="number"
                step="0.1"
                placeholder="8.5"
                className="h-9 text-xs bg-card"
                value={loanRate}
                onChange={(e) => setLoanRate(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="loan-emi" className="text-xs font-medium text-muted-foreground">
                Monthly EMI (₹)
              </Label>
              <Input
                id="loan-emi"
                type="number"
                placeholder="12000"
                className="h-9 text-xs bg-card"
                value={emiRupees}
                onChange={(e) => setEmiRupees(e.target.value)}
              />
            </div>
          </div>
        </div>
      )}

      <div className="flex items-center justify-end gap-2 pt-3 border-t">
        <Button type="button" variant="ghost" size="sm" onClick={onCancel} className="text-xs">
          Cancel
        </Button>
        <Button type="submit" size="sm" disabled={isSubmitting} className="text-xs font-semibold">
          {isSubmitting ? 'Creating...' : 'Create Account'}
        </Button>
      </div>
    </form>
  );
}

export function AddAccountDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[480px]">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">Add Account</DialogTitle>
          <DialogDescription className="text-xs">
            Add a bank account, credit card, deposit, or investment portfolio.
          </DialogDescription>
        </DialogHeader>
        <AddAccountForm onSuccess={() => onOpenChange(false)} onCancel={() => onOpenChange(false)} />
      </DialogContent>
    </Dialog>
  );
}
