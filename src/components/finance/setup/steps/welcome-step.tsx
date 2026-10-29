'use client';

import React from 'react';
import {
  SparklesIcon,
  ShieldCheckIcon,
  ClockIcon,
  PencilIcon,
  CheckCircle2Icon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

interface WelcomeStepProps {
  onNext: () => void;
  onSkip: () => void;
  isSkipping?: boolean;
}

export function WelcomeStep({ onNext, onSkip, isSkipping }: WelcomeStepProps) {
  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center sm:text-left">
        <div className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full bg-primary/10 text-primary text-xs font-medium">
          <SparklesIcon className="size-3.5" />
          <span>Personal Finance Quick Start</span>
        </div>
        <h2 className="text-2xl font-bold tracking-tight text-foreground">
          Welcome to your personal balance sheet
        </h2>
        <p className="text-sm text-muted-foreground leading-relaxed">
          Set up your accounts, opening balances, and tracking start date. This gives you an accurate starting point for net worth tracking and cash flow analytics.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3.5 pt-2">
        <div className="p-4 rounded-xl border bg-card/60 space-y-2">
          <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ClockIcon className="size-4" />
          </div>
          <h3 className="text-xs font-semibold text-foreground">Takes ~5 minutes</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            Quickly add your everyday accounts or import from a CSV spreadsheet.
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 space-y-2">
          <div className="size-8 rounded-lg bg-blue-500/10 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <ShieldCheckIcon className="size-4" />
          </div>
          <h3 className="text-xs font-semibold text-foreground">Nothing is final</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            Your draft autosaves continuously. You review everything before anything commits.
          </p>
        </div>

        <div className="p-4 rounded-xl border bg-card/60 space-y-2">
          <div className="size-8 rounded-lg bg-purple-500/10 text-purple-600 dark:text-purple-400 flex items-center justify-center">
            <PencilIcon className="size-4" />
          </div>
          <h3 className="text-xs font-semibold text-foreground">Editable anytime</h3>
          <p className="text-xs text-muted-foreground leading-normal">
            You can adjust opening balances, add more accounts, or re-run setup whenever needed.
          </p>
        </div>
      </div>

      <div className="rounded-xl border bg-muted/40 p-4 space-y-2.5">
        <h4 className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
          What we will configure:
        </h4>
        <ul className="space-y-1.5 text-xs text-foreground">
          <li className="flex items-center gap-2">
            <CheckCircle2Icon className="size-3.5 text-primary shrink-0" />
            <span>Timezone and tracking start date (opening balances are as of this date)</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2Icon className="size-3.5 text-primary shrink-0" />
            <span>Bank, cash, cards, deposits, and investment holdings</span>
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2Icon className="size-3.5 text-primary shrink-0" />
            <span>Default and custom spending categories</span>
          </li>
        </ul>
      </div>

      <div className="flex flex-col-reverse sm:flex-row items-center justify-between gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="text-xs text-muted-foreground hover:text-foreground w-full sm:w-auto"
          onClick={onSkip}
          disabled={isSkipping}
        >
          {isSkipping ? 'Skipping...' : 'Skip for now'}
        </Button>

        <Button
          type="button"
          size="sm"
          className="text-xs font-semibold w-full sm:w-auto min-w-[120px]"
          onClick={onNext}
        >
          Get Started
        </Button>
      </div>
    </div>
  );
}
