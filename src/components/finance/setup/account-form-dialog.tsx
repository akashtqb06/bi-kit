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
import {
  type AccountKind,
  type CompoundingFrequency,
} from '@src/lib/finance/constants';
import type { DraftAccount } from '@src/lib/finance/setup/types';
import { parseMoneyToPaise } from '@src/lib/finance/import/number-parser';
import { AlertCircleIcon, InfoIcon } from 'lucide-react';

interface AccountFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  initialAccount?: DraftAccount | null;
  trackingStartDate: string;
  onSave: (account: DraftAccount) => void;
}

export function AccountFormDialog({
  open,
  onOpenChange,
  initialAccount,
  trackingStartDate,
  onSave,
}: AccountFormDialogProps) {
  const [kind, setKind] = useState<AccountKind>(initialAccount?.kind || 'bank');
  const [name, setName] = useState(initialAccount?.name || '');
  const [institution, setInstitution] = useState(initialAccount?.institution || '');

  // Form values in Rupees strings for display
  const [balance, setBalance] = useState(
    initialAccount?.balancePaise ? (initialAccount.balancePaise / 100).toString() : ''
  );
  const [owed, setOwed] = useState(
    initialAccount?.owedPaise ? (initialAccount.owedPaise / 100).toString() : ''
  );
  const [creditLimit, setCreditLimit] = useState(
    initialAccount?.creditLimitPaise ? (initialAccount.creditLimitPaise / 100).toString() : ''
  );
  const [statementDay, setStatementDay] = useState(
    initialAccount?.statementDay?.toString() || ''
  );
  const [dueDay, setDueDay] = useState(initialAccount?.dueDay?.toString() || '');

  // FD & RD
  const [principal, setPrincipal] = useState(
    initialAccount?.principalPaise ? (initialAccount.principalPaise / 100).toString() : ''
  );
  const [monthlyInstallment, setMonthlyInstallment] = useState(
    initialAccount?.monthlyInstallmentPaise
      ? (initialAccount.monthlyInstallmentPaise / 100).toString()
      : ''
  );
  const [interestRate, setInterestRate] = useState(
    initialAccount?.interestRate?.toString() || '7.5'
  );
  const [compounding, setCompounding] = useState<CompoundingFrequency>(
    initialAccount?.compoundingFrequency || 'quarterly'
  );
  const [startDate, setStartDate] = useState(
    initialAccount?.startDate || trackingStartDate
  );
  const [maturityDate, setMaturityDate] = useState(
    initialAccount?.maturityDate || ''
  );
  const [tenureMonths, setTenureMonths] = useState(
    initialAccount?.tenureMonths?.toString() || '12'
  );
  const [currentValue, setCurrentValue] = useState(
    initialAccount?.currentValuePaise
      ? (initialAccount.currentValuePaise / 100).toString()
      : ''
  );

  // Investments
  const [totalInvested, setTotalInvested] = useState(
    initialAccount?.totalInvestedPaise
      ? (initialAccount.totalInvestedPaise / 100).toString()
      : ''
  );

  // Loans
  const [emi, setEmi] = useState(
    initialAccount?.emiPaise ? (initialAccount.emiPaise / 100).toString() : ''
  );

  const [formError, setFormError] = useState<string | null>(null);

  // Helper to parse rupee string into integer paise
  const toPaise = (val: string): number => {
    if (!val || !val.trim()) return 0;
    const res = parseMoneyToPaise(val);
    if (!res) return 0;
    return res.isNegative ? -res.paise : res.paise;
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    const cleanName = name.trim();
    if (!cleanName) {
      setFormError('Account name is required');
      return;
    }

    let balancePaise = 0;
    let owedPaise = 0;
    let creditLimitPaise: number | undefined;
    let principalPaise: number | undefined;
    let monthlyInstallmentPaise: number | undefined;
    let currentValuePaise: number | undefined;
    let totalInvestedPaise: number | undefined;
    let emiPaise: number | undefined;

    if (kind === 'cash') {
      balancePaise = toPaise(balance);
    } else if (kind === 'bank') {
      balancePaise = toPaise(balance);
    } else if (kind === 'credit_card') {
      owedPaise = Math.abs(toPaise(owed));
      balancePaise = -owedPaise;
      creditLimitPaise = Math.abs(toPaise(creditLimit));
    } else if (kind === 'loan') {
      owedPaise = Math.abs(toPaise(owed));
      balancePaise = -owedPaise;
      emiPaise = Math.abs(toPaise(emi));
    } else if (kind === 'fixed_deposit') {
      principalPaise = Math.abs(toPaise(principal));
      balancePaise = principalPaise;
      currentValuePaise = currentValue ? Math.abs(toPaise(currentValue)) : undefined;

      if (!startDate) {
        setFormError('Start date is required for Fixed Deposits');
        return;
      }
      if (!maturityDate) {
        setFormError('Maturity date is required for Fixed Deposits');
        return;
      }
      if (maturityDate <= startDate) {
        setFormError('Maturity date must be after the start date');
        return;
      }
    } else if (kind === 'recurring_deposit') {
      monthlyInstallmentPaise = Math.abs(toPaise(monthlyInstallment));
      balancePaise = monthlyInstallmentPaise;
      currentValuePaise = currentValue ? Math.abs(toPaise(currentValue)) : undefined;

      if (!startDate) {
        setFormError('Start date is required for Recurring Deposits');
        return;
      }
    } else if (kind === 'mutual_fund' || kind === 'stocks') {
      currentValuePaise = Math.abs(toPaise(currentValue));
      totalInvestedPaise = totalInvested ? Math.abs(toPaise(totalInvested)) : currentValuePaise;
      balancePaise = currentValuePaise;
    } else {
      balancePaise = toPaise(balance);
    }

    const rateNum = interestRate ? parseFloat(interestRate) : undefined;
    const stmtNum = statementDay ? parseInt(statementDay, 10) : undefined;
    const dueNum = dueDay ? parseInt(dueDay, 10) : undefined;
    const tenureNum = tenureMonths ? parseInt(tenureMonths, 10) : undefined;

    const account: DraftAccount = {
      id: initialAccount?.id || crypto.randomUUID(),
      name: cleanName,
      kind,
      institution: institution.trim() || undefined,
      balancePaise,
      owedPaise,
      creditLimitPaise,
      statementDay: stmtNum && stmtNum >= 1 && stmtNum <= 31 ? stmtNum : undefined,
      dueDay: dueNum && dueNum >= 1 && dueNum <= 60 ? dueNum : undefined,
      dueDays: dueNum && dueNum >= 1 && dueNum <= 60 ? dueNum : undefined,
      isOffsetDays: kind === 'credit_card' ? true : undefined,
      principalPaise,
      monthlyInstallmentPaise,
      interestRate: rateNum !== undefined && !Number.isNaN(rateNum) ? rateNum : undefined,
      compoundingFrequency: compounding,
      startDate: startDate || undefined,
      maturityDate: maturityDate || undefined,
      tenureMonths: tenureNum && tenureNum > 0 ? tenureNum : undefined,
      currentValuePaise,
      totalInvestedPaise,
      emiPaise,
    };

    onSave(account);
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="text-base font-bold">
            {initialAccount ? 'Edit Account' : 'Add New Account'}
          </DialogTitle>
        </DialogHeader>

        <form onSubmit={handleSubmit} className="space-y-4 pt-2">
          {formError && (
            <div className="rounded-lg bg-destructive/10 border border-destructive/20 p-2.5 flex items-center gap-2 text-xs text-destructive">
              <AlertCircleIcon className="size-4 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {/* Kind Selector */}
          <div className="space-y-1.5">
            <Label className="text-xs font-semibold">Account Kind</Label>
            <Select
              value={kind}
              onValueChange={(val) => setKind(val as AccountKind)}
            >
              <SelectTrigger className="text-xs">
                <SelectValue placeholder="Select kind" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="bank">Bank / Savings Account</SelectItem>
                <SelectItem value="cash">Cash / Physical Wallet</SelectItem>
                <SelectItem value="credit_card">Credit Card (Liability)</SelectItem>
                <SelectItem value="fixed_deposit">Fixed Deposit (FD)</SelectItem>
                <SelectItem value="recurring_deposit">Recurring Deposit (RD)</SelectItem>
                <SelectItem value="mutual_fund">Mutual Funds</SelectItem>
                <SelectItem value="stocks">Stocks / Demat</SelectItem>
                <SelectItem value="loan">Loan / Mortgage (Liability)</SelectItem>
                <SelectItem value="other_asset">Other Asset</SelectItem>
                <SelectItem value="other_liability">Other Liability</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* Account Name */}
          <div className="space-y-1.5">
            <Label htmlFor="acc-name" className="text-xs font-semibold">
              Account Name <span className="text-destructive">*</span>
            </Label>
            <Input
              id="acc-name"
              placeholder="e.g. HDFC Salary, ICICI Amazon Pay, Cash"
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="text-xs"
              required
            />
          </div>

          {/* Institution (Bank / Broker) */}
          {['bank', 'credit_card', 'fixed_deposit', 'recurring_deposit', 'mutual_fund', 'stocks', 'loan'].includes(kind) && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-inst" className="text-xs font-semibold">
                Financial Institution / Broker
              </Label>
              <Input
                id="acc-inst"
                placeholder="e.g. HDFC Bank, SBI, Zerodha, Groww"
                value={institution}
                onChange={(e) => setInstitution(e.target.value)}
                className="text-xs"
              />
            </div>
          )}

          {/* Cash / Bank Balance */}
          {['cash', 'bank', 'other_asset', 'other_liability'].includes(kind) && (
            <div className="space-y-1.5">
              <Label htmlFor="acc-balance" className="text-xs font-semibold">
                Current Balance (₹)
              </Label>
              <Input
                id="acc-balance"
                placeholder="0.00"
                value={balance}
                onChange={(e) => setBalance(e.target.value)}
                className="text-xs"
              />
            </div>
          )}

          {/* Credit Card Specific Fields */}
          {kind === 'credit_card' && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-1.5">
                <Label htmlFor="acc-owed" className="text-xs font-semibold">
                  Amount You Currently OWE (₹)
                </Label>
                <Input
                  id="acc-owed"
                  placeholder="0.00 (Enter 0 if no debt)"
                  value={owed}
                  onChange={(e) => setOwed(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground">
                  Entered as positive; stored as negative ledger balance.
                </p>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-limit" className="text-xs font-semibold">
                  Credit Limit (₹)
                </Label>
                <Input
                  id="acc-limit"
                  placeholder="e.g. 2,00,000"
                  value={creditLimit}
                  onChange={(e) => setCreditLimit(e.target.value)}
                  className="text-xs"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-1">
                <div className="space-y-1">
                  <Label htmlFor="acc-stmt-day" className="text-[11px] text-muted-foreground">
                    Statement Day (1-31)
                  </Label>
                  <Input
                    id="acc-stmt-day"
                    type="number"
                    min={1}
                    max={31}
                    placeholder="15"
                    value={statementDay}
                    onChange={(e) => setStatementDay(e.target.value)}
                    className="text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="acc-due-day" className="text-[11px] text-muted-foreground">
                    Payment Due (Days)
                  </Label>
                  <Input
                    id="acc-due-day"
                    type="number"
                    min={1}
                    max={60}
                    placeholder="20"
                    value={dueDay}
                    onChange={(e) => setDueDay(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Fixed Deposit Specific Fields */}
          {kind === 'fixed_deposit' && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-1.5">
                <Label htmlFor="acc-principal" className="text-xs font-semibold">
                  Deposit Principal (₹)
                </Label>
                <Input
                  id="acc-principal"
                  placeholder="e.g. 1,00,000"
                  value={principal}
                  onChange={(e) => setPrincipal(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="acc-rate" className="text-xs font-semibold">
                    Interest Rate (% p.a.)
                  </Label>
                  <Input
                    id="acc-rate"
                    placeholder="7.5"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label className="text-xs font-semibold">Compounding</Label>
                  <Select
                    value={compounding}
                    onValueChange={(val) => setCompounding(val as CompoundingFrequency)}
                  >
                    <SelectTrigger className="text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="quarterly">Quarterly (Indian Default)</SelectItem>
                      <SelectItem value="monthly">Monthly</SelectItem>
                      <SelectItem value="half_yearly">Half-yearly</SelectItem>
                      <SelectItem value="yearly">Yearly</SelectItem>
                      <SelectItem value="simple">Simple Interest</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="acc-start" className="text-xs font-semibold">
                    Start Date
                  </Label>
                  <DatePicker
                    id="acc-start"
                    value={startDate}
                    onChange={setStartDate}
                    className="text-xs"
                    placeholder="Select start date"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="acc-maturity" className="text-xs font-semibold">
                    Maturity Date
                  </Label>
                  <DatePicker
                    id="acc-maturity"
                    value={maturityDate}
                    onChange={setMaturityDate}
                    className="text-xs"
                    placeholder="Select maturity date"
                  />
                </div>
              </div>

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="acc-cur-val" className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <span>Current Value as of tracking start date (Optional)</span>
                </Label>
                <Input
                  id="acc-cur-val"
                  placeholder="Leave empty to auto-calculate with interest formula"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          {/* Recurring Deposit Specific Fields */}
          {kind === 'recurring_deposit' && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-1.5">
                <Label htmlFor="acc-rd-inst" className="text-xs font-semibold">
                  Monthly Installment (₹)
                </Label>
                <Input
                  id="acc-rd-inst"
                  placeholder="e.g. 5,000"
                  value={monthlyInstallment}
                  onChange={(e) => setMonthlyInstallment(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="acc-rd-rate" className="text-xs font-semibold">
                    Interest Rate (% p.a.)
                  </Label>
                  <Input
                    id="acc-rd-rate"
                    placeholder="7.0"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="acc-rd-tenure" className="text-xs font-semibold">
                    Tenure (Months)
                  </Label>
                  <Input
                    id="acc-rd-tenure"
                    type="number"
                    min={1}
                    placeholder="12"
                    value={tenureMonths}
                    onChange={(e) => setTenureMonths(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <Label htmlFor="acc-rd-start" className="text-xs font-semibold">
                  Start Date
                </Label>
                <DatePicker
                  id="acc-rd-start"
                  value={startDate}
                  onChange={setStartDate}
                  className="text-xs"
                  placeholder="Select start date"
                />
              </div>

              <div className="space-y-1.5 pt-1">
                <Label htmlFor="acc-rd-val" className="text-[11px] text-muted-foreground">
                  Current Value (Optional override)
                </Label>
                <Input
                  id="acc-rd-val"
                  placeholder="Leave empty to auto-compute"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  className="text-xs"
                />
              </div>
            </div>
          )}

          {/* Mutual Funds & Stocks */}
          {['mutual_fund', 'stocks'].includes(kind) && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-1.5">
                <Label htmlFor="acc-cur-market" className="text-xs font-semibold">
                  Current Market Value (₹) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="acc-cur-market"
                  placeholder="e.g. 2,50,000"
                  value={currentValue}
                  onChange={(e) => setCurrentValue(e.target.value)}
                  className="text-xs"
                  required
                />
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="acc-invested" className="text-xs font-semibold">
                  Total Invested So Far (₹) (Optional)
                </Label>
                <Input
                  id="acc-invested"
                  placeholder="e.g. 2,00,000"
                  value={totalInvested}
                  onChange={(e) => setTotalInvested(e.target.value)}
                  className="text-xs"
                />
                <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                  <InfoIcon className="size-3 text-muted-foreground" />
                  <span>Stored as opening contribution so gains and returns are accurately tracked.</span>
                </p>
              </div>
            </div>
          )}

          {/* Loan Specific Fields */}
          {kind === 'loan' && (
            <div className="space-y-3 p-3 rounded-lg bg-muted/40 border">
              <div className="space-y-1.5">
                <Label htmlFor="acc-loan-owed" className="text-xs font-semibold">
                  Outstanding Principal Debt (₹) <span className="text-destructive">*</span>
                </Label>
                <Input
                  id="acc-loan-owed"
                  placeholder="e.g. 4,50,000"
                  value={owed}
                  onChange={(e) => setOwed(e.target.value)}
                  className="text-xs"
                  required
                />
                <p className="text-[11px] text-muted-foreground">
                  Entered as positive; stored as negative ledger balance.
                </p>
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="acc-loan-rate" className="text-xs font-semibold">
                    Interest Rate (% p.a.)
                  </Label>
                  <Input
                    id="acc-loan-rate"
                    placeholder="8.5"
                    value={interestRate}
                    onChange={(e) => setInterestRate(e.target.value)}
                    className="text-xs"
                  />
                </div>

                <div className="space-y-1">
                  <Label htmlFor="acc-loan-emi" className="text-xs font-semibold">
                    Monthly EMI (₹)
                  </Label>
                  <Input
                    id="acc-loan-emi"
                    placeholder="12,500"
                    value={emi}
                    onChange={(e) => setEmi(e.target.value)}
                    className="text-xs"
                  />
                </div>
              </div>
            </div>
          )}

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
            <Button type="submit" size="sm" className="text-xs font-semibold">
              {initialAccount ? 'Save Changes' : 'Add Account'}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
