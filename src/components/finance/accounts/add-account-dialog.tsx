'use client';

import React, { useState, useMemo } from 'react';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DatePicker } from '@/components/ui/date-picker';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useFinanceStore } from '../shared/finance-store';
import { RDFormFields } from './rd-form-fields';
import type { RDCompounding, RDFirstInstallmentOn } from '@src/lib/finance/domain/rd';
import { rupeesToPaise } from '../shared/format';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import type { AccountKind } from '@src/lib/finance/constants';
import { ShieldCheckIcon } from 'lucide-react';

export function AddAccountForm({ onSuccess, onCancel }: { onSuccess?: () => void; onCancel?: () => void }) {
    const { accounts, addAccount } = useFinanceStore();

    const [name, setName] = useState('');
    const [kind, setKind] = useState<AccountKind>('bank');
    const currency = 'INR';

    // Generic / Bank fields
    const [openingBalanceRupees, setOpeningBalanceRupees] = useState('');
    const [openingDate, setOpeningDate] = useState(() => todayInTz(DEFAULT_TZ));

    // Card fields
    const [creditLimitRupees, setCreditLimitRupees] = useState('');
    const [currentOutstandingRupees, setCurrentOutstandingRupees] = useState('');
    const [statementDay, setStatementDay] = useState('21');
    const [dueDays, setDueDays] = useState('20');

    // Deposit fields (FD/RD)
    const [principalRupees, setPrincipalRupees] = useState('');
    const [rate, setRate] = useState('');
    const [compounding, setCompounding] = useState<RDCompounding>('quarterly');
    const [startDate, setStartDate] = useState(() => todayInTz(DEFAULT_TZ));
    const [maturityDate, setMaturityDate] = useState('');
    const [tenureMonths, setTenureMonths] = useState('12');

    // RD-specific fields
    const [installmentDay, setInstallmentDay] = useState<number | 'last'>(2);
    const [firstInstallmentOn, setFirstInstallmentOn] = useState<RDFirstInstallmentOn>('start_date');
    const [payFromAccountId, setPayFromAccountId] = useState<string | null>(null);
    const [autoDebit, setAutoDebit] = useState(true);
    const [anchorRupees, setAnchorRupees] = useState('');

    const bankAccounts = useMemo(
        () => accounts.filter((a) => a.kind === 'bank' || a.kind === 'cash'),
        [accounts]
    );

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

            if (kind === 'bank' || kind === 'cash' || kind === 'wallet' || kind === 'other_asset') {
                openingPaise = openingBalanceRupees ? rupeesToPaise(parseFloat(openingBalanceRupees)) : 0;
                metadata.openingDate = openingDate;
            } else if (kind === 'credit_card') {
                limitPaise = creditLimitRupees ? rupeesToPaise(parseFloat(creditLimitRupees)) : 0;
                openingPaise = currentOutstandingRupees
                    ? -Math.abs(rupeesToPaise(parseFloat(currentOutstandingRupees)))
                    : 0;
                const stmt = parseInt(statementDay, 10) || 21;
                const due = parseInt(dueDays, 10) || 20;
                metadata.statementDay = stmt;
                metadata.dueDay = due;
                metadata.dueDays = due;
                metadata.isOffsetDays = true;
            } else if (kind === 'fixed_deposit') {
                openingPaise = principalRupees ? rupeesToPaise(parseFloat(principalRupees)) : 0;
                metadata.principal = openingPaise;
                metadata.rate = parseFloat(rate) || 0;
                metadata.compounding = compounding;
                metadata.startDate = startDate;
                metadata.maturityDate = maturityDate;
            } else if (kind === 'recurring_deposit') {
                openingPaise = principalRupees ? rupeesToPaise(parseFloat(principalRupees)) : 0;
                const normRate = parseFloat(rate) || 6.8;
                metadata.monthlyInstallmentPaise = openingPaise;
                metadata.installment = openingPaise;
                metadata.interestRate = normRate;
                metadata.rate = normRate;
                metadata.startDate = startDate;
                metadata.tenureMonths = parseInt(tenureMonths, 10) || 12;
                metadata.installmentDay = installmentDay;
                metadata.firstInstallmentOn = firstInstallmentOn;
                metadata.compounding = compounding;
                metadata.compoundingFrequency = compounding;
                metadata.payFromAccountId = payFromAccountId;
                metadata.autoDebit = autoDebit && Boolean(payFromAccountId);
                metadata.installmentsMode = 'schedule';
                metadata.installmentDayHistory = [{ effectiveFrom: startDate.slice(0, 7), day: installmentDay }];
                metadata.skippedInstallments = [];
                metadata.paidLateInstallments = [];
                if (anchorRupees) {
                    metadata.openingBalancePaise = rupeesToPaise(parseFloat(anchorRupees));
                }
            } else if (kind === 'mutual_fund' || kind === 'stocks' || kind === 'nps') {
                openingPaise = initialValueRupees ? rupeesToPaise(parseFloat(initialValueRupees)) : 0;
                metadata.costBasis = openingPaise;
            } else if (kind === 'ppf') {
                openingPaise = openingBalanceRupees ? rupeesToPaise(parseFloat(openingBalanceRupees)) : 0;
                metadata.openingDate = openingDate;
            } else if (kind === 'epf' || kind === 'vpf') {
                openingPaise = 0;
            } else if (kind === 'loan' || kind === 'other_liability') {
                openingPaise = loanAmountRupees ? -Math.abs(rupeesToPaise(parseFloat(loanAmountRupees))) : 0;
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
                statementDay: kind === 'credit_card' ? parseInt(statementDay, 10) || 21 : undefined,
                dueDay: kind === 'credit_card' ? parseInt(dueDays, 10) || 20 : undefined,
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
                <Select
                    items={[
                        { value: 'bank', label: 'Bank Account (Checking / Savings)' },
                        { value: 'cash', label: 'Cash' },
                        { value: 'wallet', label: 'Digital Wallet (Paytm, Amazon Pay, etc.)' },
                        { value: 'credit_card', label: 'Credit Card' },
                        { value: 'fixed_deposit', label: 'Fixed Deposit (FD)' },
                        { value: 'recurring_deposit', label: 'Recurring Deposit (RD)' },
                        { value: 'epf', label: 'EPF (Employees’ Provident Fund)' },
                        { value: 'vpf', label: 'VPF (Voluntary Provident Fund)' },
                        { value: 'ppf', label: 'PPF (Public Provident Fund)' },
                        { value: 'nps', label: 'NPS (National Pension Scheme)' },
                        { value: 'mutual_fund', label: 'Mutual Funds Portfolio' },
                        { value: 'stocks', label: 'Demat / Stocks' },
                        { value: 'loan', label: 'Loan (Home, Auto, Personal)' },
                        { value: 'other_asset', label: 'Other Asset' },
                        { value: 'other_liability', label: 'Other Liability' },
                    ]}
                    value={kind}
                    onValueChange={(val) => setKind(val as AccountKind)}
                >
                    <SelectTrigger
                        id="account-kind"
                        data-testid="account-kind-select"
                        className="w-full h-9 bg-card px-3 text-xs"
                    >
                        <SelectValue placeholder="Select account type" />
                    </SelectTrigger>
                    <SelectContent>
                        <SelectItem value="bank">Bank Account (Checking / Savings)</SelectItem>
                        <SelectItem value="cash">Cash</SelectItem>
                        <SelectItem value="wallet">Digital Wallet (Paytm, Amazon Pay, etc.)</SelectItem>
                        <SelectItem value="credit_card">Credit Card</SelectItem>
                        <SelectItem value="fixed_deposit">Fixed Deposit (FD)</SelectItem>
                        <SelectItem value="recurring_deposit">Recurring Deposit (RD)</SelectItem>
                        <SelectItem value="epf">EPF (Employees’ Provident Fund)</SelectItem>
                        <SelectItem value="vpf">VPF (Voluntary Provident Fund)</SelectItem>
                        <SelectItem value="ppf">PPF (Public Provident Fund)</SelectItem>
                        <SelectItem value="nps">NPS (National Pension Scheme)</SelectItem>
                        <SelectItem value="mutual_fund">Mutual Funds Portfolio</SelectItem>
                        <SelectItem value="stocks">Demat / Stocks</SelectItem>
                        <SelectItem value="loan">Loan (Home, Auto, Personal)</SelectItem>
                        <SelectItem value="other_asset">Other Asset</SelectItem>
                        <SelectItem value="other_liability">Other Liability</SelectItem>
                    </SelectContent>
                </Select>
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
            {/* Bank, Cash, Wallet & PPF Fields */}
            {(kind === 'bank' || kind === 'cash' || kind === 'wallet' || kind === 'other_asset' || kind === 'ppf') && (
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
                        <DatePicker
                            id="opening-date"
                            className="h-9 text-xs bg-card"
                            value={openingDate}
                            onChange={setOpeningDate}
                            placeholder="Select opening date"
                        />
                    </div>
                </div>
            )}

            {/* EPF & VPF Notice */}
            {(kind === 'epf' || kind === 'vpf') && (
                <div data-testid="kind-fields-epf" className="pt-2 border-t space-y-3">
                    <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3.5 text-xs space-y-2">
                        <div className="font-semibold text-emerald-900 dark:text-emerald-200 flex items-center gap-1.5">
                            <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0" />
                            <span>EPFO Member Passbook Import</span>
                        </div>
                        <p className="text-muted-foreground leading-relaxed text-[11px]">
                            Balances for {kind.toUpperCase()} are tracked via your official EPFO Member Passbook. Once created, open your account page to copy-paste portal text or upload your CSV passbook to import monthly contributions and calculate interest.
                        </p>
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
                                placeholder="21"
                                className="h-9 text-xs bg-card"
                                value={statementDay}
                                onChange={(e) => setStatementDay(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground">Bill generation date (1-31)</p>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="due-days" className="text-xs font-medium text-muted-foreground">
                                Payment Due (Days after bill)
                            </Label>
                            <Input
                                id="due-days"
                                type="number"
                                min="1"
                                max="60"
                                placeholder="20"
                                className="h-9 text-xs bg-card"
                                value={dueDays}
                                onChange={(e) => setDueDays(e.target.value)}
                            />
                            <p className="text-[10px] text-muted-foreground">Days for payment due (e.g. 20)</p>
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
                            <Select
                                items={[
                                    { value: 'quarterly', label: 'Quarterly (Bank Default)' },
                                    { value: 'monthly', label: 'Monthly' },
                                    { value: 'yearly', label: 'Yearly' },
                                ]}
                                value={compounding}
                                onValueChange={(val) => setCompounding(val as typeof compounding)}
                            >
                                <SelectTrigger id="fd-compounding" className="w-full h-9 bg-card px-2 text-xs">
                                    <SelectValue placeholder="Select compounding" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="quarterly">Quarterly (Bank Default)</SelectItem>
                                    <SelectItem value="monthly">Monthly</SelectItem>
                                    <SelectItem value="yearly">Yearly</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fd-start" className="text-xs font-medium text-muted-foreground">
                                Start Date
                            </Label>
                            <DatePicker
                                id="fd-start"
                                className="h-9 text-xs bg-card"
                                value={startDate}
                                onChange={setStartDate}
                                placeholder="Select start date"
                            />
                        </div>
                        <div className="space-y-1.5">
                            <Label htmlFor="fd-maturity" className="text-xs font-medium text-muted-foreground">
                                Maturity Date
                            </Label>
                            <DatePicker
                                id="fd-maturity"
                                className="h-9 text-xs bg-card"
                                value={maturityDate}
                                onChange={setMaturityDate}
                                placeholder="Select maturity date"
                            />
                        </div>
                    </div>
                </div>
            )}

            {/* Recurring Deposit Fields */}
            {kind === 'recurring_deposit' && (
                <div data-testid="kind-fields-rd">
                    <RDFormFields
                        monthlyInstallmentRupees={principalRupees}
                        setMonthlyInstallmentRupees={setPrincipalRupees}
                        startDate={startDate}
                        setStartDate={setStartDate}
                        installmentDay={installmentDay}
                        setInstallmentDay={setInstallmentDay}
                        firstInstallmentOn={firstInstallmentOn}
                        setFirstInstallmentOn={setFirstInstallmentOn}
                        tenureMonths={tenureMonths}
                        setTenureMonths={setTenureMonths}
                        interestRate={rate}
                        setInterestRate={setRate}
                        compounding={compounding}
                        setCompounding={setCompounding}
                        currentValueRupees={anchorRupees}
                        setCurrentValueRupees={setAnchorRupees}
                        payFromAccountId={payFromAccountId}
                        setPayFromAccountId={setPayFromAccountId}
                        autoDebit={autoDebit}
                        setAutoDebit={setAutoDebit}
                        bankAccounts={bankAccounts}
                    />
                </div>
            )}

            {/* Investment Fields (Mutual Funds, Stocks & NPS) */}
            {(kind === 'mutual_fund' || kind === 'stocks' || kind === 'nps') && (
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

export function AddAccountDialog({ open, onOpenChange }: { open: boolean; onOpenChange: (open: boolean) => void }) {
    const handleOpenChange = (nextOpen: boolean) => {
        onOpenChange(nextOpen);
        if (!nextOpen) {
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

    return (
        <Dialog open={open} onOpenChange={handleOpenChange}>
            <DialogContent className="sm:max-w-xl">
                <DialogHeader>
                    <DialogTitle className="text-base font-bold">Add Account</DialogTitle>
                    <DialogDescription className="text-xs">
                        Add a bank account, credit card, deposit, or investment portfolio.
                    </DialogDescription>
                </DialogHeader>
                {open && (
                    <AddAccountForm
                        onSuccess={() => handleOpenChange(false)}
                        onCancel={() => handleOpenChange(false)}
                    />
                )}
            </DialogContent>
        </Dialog>
    );
}
