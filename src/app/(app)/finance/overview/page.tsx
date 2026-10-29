import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { OverviewView } from '@src/components/finance/overview/overview-view';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export default function OverviewPage() {
  if (!isFinanceFeatureEnabled('overview')) {
    notFound();
  }

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Financial Overview..." />}>
      <OverviewView />
    </Suspense>
  );
}
