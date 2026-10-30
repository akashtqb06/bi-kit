'use client';

import React from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  isFeatureEnabled,
  type FinanceFeature,
} from '@src/lib/finance/flags';
import { SlidersIcon, CheckCircle2Icon, XCircleIcon } from 'lucide-react';

interface FeatureMeta {
  key: FinanceFeature;
  label: string;
  description: string;
  implemented: boolean;
}

const FEATURES_META: FeatureMeta[] = [
  {
    key: 'overview',
    label: 'Overview',
    description: 'Holistic dashboard of assets, liabilities, cash flow, and trends',
    implemented: true,
  },
  {
    key: 'transactions',
    label: 'Transactions',
    description: 'Transaction ledger, categorization, editing, and pagination',
    implemented: true,
  },
  {
    key: 'accounts',
    label: 'Accounts',
    description: 'Bank, cash, credit cards, investment valuations, and deposit schedules',
    implemented: true,
  },
  {
    key: 'setup',
    label: 'Setup Wizard',
    description: 'First-run onboarding, bulk account templates, and category initialization',
    implemented: true,
  },
  {
    key: 'budgets',
    label: 'Budgets',
    description: 'Category spending targets and budget progress tracking',
    implemented: true,
  },
  {
    key: 'recurring',
    label: 'Recurring',
    description: 'Scheduled recurring transaction rules, day-of-month clamping, and cron generation',
    implemented: true,
  },
  {
    key: 'import',
    label: 'Import',
    description: 'Multi-bank CSV statement upload, column detection, and duplicate hash protection',
    implemented: true,
  },
];

export function FinanceFeaturesPanel() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
            <SlidersIcon className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Features & Module Status</CardTitle>
            <CardDescription className="text-xs">
              List of all finance features configured via FINANCE_FEATURES and their implementation status.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border/60 border rounded-lg overflow-hidden bg-card text-xs">
          {FEATURES_META.map((meta) => {
            const enabled = isFeatureEnabled(meta.key);
            const reason = enabled
              ? 'Active'
              : !meta.implemented
              ? 'Not implemented'
              : 'Disabled by FINANCE_FEATURES';

            return (
              <div
                key={meta.key}
                className="p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 hover:bg-muted/30 transition-colors"
              >
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-foreground">{meta.label}</span>
                    <code className="text-[10px] text-muted-foreground bg-muted px-1.5 py-0.5 rounded font-mono">
                      {meta.key}
                    </code>
                  </div>
                  <p className="text-[11px] text-muted-foreground mt-0.5">{meta.description}</p>
                </div>

                <div className="flex items-center gap-3 shrink-0 self-start sm:self-center">
                  <span className="text-[11px] text-muted-foreground hidden md:inline">
                    {reason}
                  </span>
                  {enabled ? (
                    <Badge
                      variant="outline"
                      className="gap-1 text-emerald-600 dark:text-emerald-400 border-emerald-500/30 text-[10px]"
                    >
                      <CheckCircle2Icon className="size-3" />
                      <span>Enabled</span>
                    </Badge>
                  ) : (
                    <Badge
                      variant="secondary"
                      className="gap-1 text-muted-foreground text-[10px]"
                    >
                      <XCircleIcon className="size-3" />
                      <span>Disabled</span>
                    </Badge>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </CardContent>
    </Card>
  );
}
