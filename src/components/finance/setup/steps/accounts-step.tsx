'use client';

import React, { useState } from 'react';
import {
  PlusIcon,
  UploadIcon,
  SparklesIcon,
  Trash2Icon,
  PencilIcon,
  LandmarkIcon,
  WalletIcon,
  CreditCardIcon,
  TrendingUpIcon,
  PiggyBankIcon,
  InfoIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import type { DraftAccount } from '@src/lib/finance/setup/types';
import { AccountFormDialog } from '../account-form-dialog';
import { CSVImportDialog } from '../csv-import-dialog';
import { formatINR } from '../../shared/format';
import { addMonthsToDate } from '@src/lib/finance/domain/deposits';

interface AccountsStepProps {
  accounts: DraftAccount[];
  trackingStartDate: string;
  onChange: (updatedAccounts: DraftAccount[]) => void;
  onNext: () => void;
  onBack: () => void;
}

export function AccountsStep({
  accounts,
  trackingStartDate,
  onChange,
  onNext,
  onBack,
}: AccountsStepProps) {
  const [formOpen, setFormOpen] = useState(false);
  const [csvOpen, setCsvOpen] = useState(false);
  const [editingAccount, setEditingAccount] = useState<DraftAccount | null>(null);

  const handleOpenAdd = () => {
    setEditingAccount(null);
    setFormOpen(true);
  };

  const handleOpenEdit = (acc: DraftAccount) => {
    setEditingAccount(acc);
    setFormOpen(true);
  };

  const handleRemoveAccount = (idToRemove?: string, index?: number) => {
    if (idToRemove) {
      onChange(accounts.filter((a) => a.id !== idToRemove));
    } else if (index !== undefined) {
      onChange(accounts.filter((_, i) => i !== index));
    }
  };

  const handleSaveAccount = (account: DraftAccount) => {
    if (editingAccount) {
      // Replace existing
      const updated = accounts.map((a) =>
        (a.id && a.id === editingAccount.id) || a === editingAccount ? account : a
      );
      onChange(updated);
    } else {
      // Append new
      onChange([...accounts, account]);
    }
  };

  const handleImportCSV = (imported: DraftAccount[]) => {
    onChange([...accounts, ...imported]);
  };

  // Preset: "Add common accounts"
  const handleAddCommonPreset = () => {
    const oneYearLater = addMonthsToDate(trackingStartDate, 12);

    const presetAccounts: DraftAccount[] = [
      {
        id: crypto.randomUUID(),
        name: 'Cash Wallet',
        kind: 'cash',
        balancePaise: 500000, // ₹5,000
        owedPaise: 0,
      },
      {
        id: crypto.randomUUID(),
        name: 'HDFC Savings Account',
        kind: 'bank',
        institution: 'HDFC Bank',
        balancePaise: 5000000, // ₹50,000
        owedPaise: 0,
      },
      {
        id: crypto.randomUUID(),
        name: 'HDFC Regalia Card',
        kind: 'credit_card',
        institution: 'HDFC Bank',
        owedPaise: 1500000, // ₹15,000 owed
        balancePaise: -1500000,
        creditLimitPaise: 20000000, // ₹2,00,000 limit
        statementDay: 15,
        dueDay: 5,
      },
      {
        id: crypto.randomUUID(),
        name: 'SBI 1-Yr Fixed Deposit',
        kind: 'fixed_deposit',
        institution: 'SBI',
        principalPaise: 10000000, // ₹1,00,000
        balancePaise: 10000000,
        owedPaise: 0,
        interestRate: 7.5,
        compoundingFrequency: 'quarterly',
        startDate: trackingStartDate,
        maturityDate: oneYearLater,
        tenureMonths: 12,
      },
      {
        id: crypto.randomUUID(),
        name: 'Zerodha Coin Mutual Funds',
        kind: 'mutual_fund',
        institution: 'Zerodha',
        currentValuePaise: 25000000, // ₹2,50,000 value
        totalInvestedPaise: 20000000, // ₹2,00,000 invested
        balancePaise: 25000000,
        owedPaise: 0,
      },
      {
        id: crypto.randomUUID(),
        name: 'Zerodha Kite Equity Demat',
        kind: 'stocks',
        institution: 'Zerodha',
        currentValuePaise: 15000000, // ₹1,50,000 value
        totalInvestedPaise: 12000000, // ₹1,20,000 invested
        balancePaise: 15000000,
        owedPaise: 0,
      },
    ];

    onChange([...accounts, ...presetAccounts]);
  };

  const getAccountIcon = (kind: string) => {
    switch (kind) {
      case 'cash':
        return WalletIcon;
      case 'credit_card':
        return CreditCardIcon;
      case 'fixed_deposit':
      case 'recurring_deposit':
        return PiggyBankIcon;
      case 'mutual_fund':
      case 'stocks':
        return TrendingUpIcon;
      default:
        return LandmarkIcon;
    }
  };

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center sm:text-left">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Add Your Accounts
        </h2>
        <p className="text-xs text-muted-foreground">
          Enter your current accounts and their starting balances as of {trackingStartDate}. Credit cards and loans are entered as positive debt and tracked as liabilities.
        </p>
      </div>

      {/* Action Toolbar */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 p-3 rounded-xl border bg-card/60">
        <div className="flex flex-wrap items-center gap-2">
          <Button
            type="button"
            size="sm"
            className="text-xs font-semibold gap-1.5 h-8"
            onClick={handleOpenAdd}
          >
            <PlusIcon className="size-3.5" />
            <span>Add Account</span>
          </Button>

          <Button
            type="button"
            variant="outline"
            size="sm"
            className="text-xs gap-1.5 h-8"
            onClick={handleAddCommonPreset}
          >
            <SparklesIcon className="size-3.5 text-primary" />
            <span>Add Common Accounts Preset</span>
          </Button>
        </div>

        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs gap-1.5 h-8"
          onClick={() => setCsvOpen(true)}
        >
          <UploadIcon className="size-3.5" />
          <span>Import from CSV</span>
        </Button>
      </div>

      {/* Main Content Area: Accounts List */}
      <div className="space-y-3">
        {accounts.length === 0 ? (
          <div className="text-center py-10 px-4 rounded-xl border-2 border-dashed bg-muted/20 space-y-3">
            <div className="size-10 rounded-full bg-primary/10 text-primary mx-auto flex items-center justify-center">
              <LandmarkIcon className="size-5" />
            </div>
            <div className="space-y-1">
              <h3 className="text-sm font-semibold text-foreground">No accounts added yet</h3>
              <p className="text-xs text-muted-foreground max-w-sm mx-auto">
                Add at least one account to get started. You can use the preset to load common Indian accounts or upload a CSV file.
              </p>
            </div>
            <div className="flex items-center justify-center gap-2 pt-1">
              <Button size="sm" className="text-xs h-8" onClick={handleOpenAdd}>
                Add Manually
              </Button>
              <Button
                variant="outline"
                size="sm"
                className="text-xs h-8"
                onClick={handleAddCommonPreset}
              >
                Use Preset
              </Button>
            </div>
          </div>
        ) : (
          <div className="border rounded-xl divide-y bg-card overflow-hidden">
            <div className="px-4 py-2.5 bg-muted/40 flex items-center justify-between text-xs font-semibold text-muted-foreground">
              <span>Configured Accounts ({accounts.length})</span>
              <span>Starting Balance / Debt</span>
            </div>

            {accounts.map((acc, index) => {
              const Icon = getAccountIcon(acc.kind);
              const isLiability = acc.kind === 'credit_card' || acc.kind === 'loan';
              const displayPaise = isLiability
                ? acc.owedPaise || 0
                : acc.kind === 'fixed_deposit'
                ? acc.principalPaise || acc.balancePaise || 0
                : acc.kind === 'recurring_deposit'
                ? acc.monthlyInstallmentPaise || acc.balancePaise || 0
                : acc.kind === 'mutual_fund' || acc.kind === 'stocks'
                ? acc.currentValuePaise || acc.balancePaise || 0
                : acc.balancePaise || 0;

              return (
                <div
                  key={acc.id || index}
                  className="px-4 py-3 flex items-center justify-between gap-3 hover:bg-muted/20 transition-colors"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center shrink-0">
                      <Icon className="size-4" />
                    </div>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-semibold text-foreground truncate">
                          {acc.name}
                        </span>
                        <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                          {acc.kind.replace('_', ' ')}
                        </Badge>
                      </div>
                      <div className="text-[11px] text-muted-foreground truncate">
                        {acc.institution ? `${acc.institution} • ` : ''}
                        {acc.kind === 'credit_card' && acc.creditLimitPaise
                          ? `Limit: ${formatINR(acc.creditLimitPaise)}`
                          : acc.kind === 'fixed_deposit' && acc.interestRate
                          ? `${acc.interestRate}% • Maturity: ${acc.maturityDate || '1 yr'}`
                          : acc.kind === 'recurring_deposit' && acc.interestRate
                          ? `${acc.interestRate}% • ${acc.tenureMonths || 12} mo`
                          : acc.kind === 'mutual_fund' && acc.totalInvestedPaise
                          ? `Invested: ${formatINR(acc.totalInvestedPaise)}`
                          : isLiability
                          ? 'Liability'
                          : 'Asset'}
                      </div>
                    </div>
                  </div>

                  <div className="flex items-center gap-3 shrink-0">
                    <div className="text-right">
                      <div
                        className={`text-xs font-bold font-mono ${
                          isLiability ? 'text-destructive' : 'text-foreground'
                        }`}
                      >
                        {isLiability ? `- ${formatINR(displayPaise)}` : formatINR(displayPaise)}
                      </div>
                      <span className="text-[10px] text-muted-foreground">
                        {isLiability ? 'Amount Owed' : 'Opening Balance'}
                      </span>
                    </div>

                    <div className="flex items-center gap-1">
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-muted-foreground hover:text-foreground"
                        onClick={() => handleOpenEdit(acc)}
                        title="Edit account"
                      >
                        <PencilIcon className="size-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="sm"
                        className="size-7 p-0 text-muted-foreground hover:text-destructive"
                        onClick={() => handleRemoveAccount(acc.id, index)}
                        title="Remove account"
                      >
                        <Trash2Icon className="size-3.5" />
                      </Button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}

        <div className="rounded-lg bg-muted/40 p-3 flex items-start gap-2.5">
          <InfoIcon className="size-4 text-muted-foreground shrink-0 mt-0.5" />
          <p className="text-[11px] text-muted-foreground leading-relaxed">
            <strong className="text-foreground">Sign Convention Rule:</strong> Cards and loans are entered as positive debt amounts and stored as negative ledger balances. Assets are positive balances.
          </p>
        </div>
      </div>

      {/* Navigation Buttons */}
      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={onBack}
        >
          Back
        </Button>

        <Button
          type="button"
          size="sm"
          className="text-xs font-semibold min-w-[120px]"
          onClick={onNext}
          disabled={accounts.length === 0}
        >
          Continue ({accounts.length} {accounts.length === 1 ? 'Account' : 'Accounts'})
        </Button>
      </div>

      {/* Dialogs */}
      <AccountFormDialog
        open={formOpen}
        onOpenChange={setFormOpen}
        initialAccount={editingAccount}
        trackingStartDate={trackingStartDate}
        onSave={handleSaveAccount}
      />

      <CSVImportDialog
        open={csvOpen}
        onOpenChange={setCsvOpen}
        onImport={handleImportCSV}
      />
    </div>
  );
}
