import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import {
  FinancePageSkeleton,
  FinancePlaceholderView,
} from '@src/components/finance/shared/finance-skeleton';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export const dynamic = 'force-dynamic';

async function BudgetsContent() {
  if (!isFinanceFeatureEnabled('budgets')) {
    notFound();
  }
  return (
    <FinancePlaceholderView
      title="Budgets & Spending Limits"
      description="Track monthly and quarterly spending against category budgets and targets"
      session="S6b"
    />
  );
}

export default function BudgetsPage() {
  if (!isFinanceFeatureEnabled('budgets')) {
    notFound();
  }
  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Budgets..." />}>
      <BudgetsContent />
    </Suspense>
  );
}

