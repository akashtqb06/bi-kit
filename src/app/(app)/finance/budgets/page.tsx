import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { BudgetsView } from '@src/components/finance/budgets/budgets-view';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export default function BudgetsPage() {
  if (!isFinanceFeatureEnabled('budgets')) {
    notFound();
  }

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Budgets..." />}>
      <BudgetsView />
    </Suspense>
  );
}
