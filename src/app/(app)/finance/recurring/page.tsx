import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { RecurringView } from '@src/components/finance/recurring/recurring-view';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';
import { getRecurringPageDataAction } from './actions';
import type { RecurringPageData } from './actions';

export const dynamic = 'force-dynamic';

async function RecurringContent() {
  if (!isFinanceFeatureEnabled('recurring')) {
    notFound();
  }

  let initialData: RecurringPageData | null = null;
  let errorMessage: string | null = null;

  try {
    initialData = await getRecurringPageDataAction();
  } catch (err: unknown) {
    errorMessage = err instanceof Error ? err.message : 'Failed to load recurring rules.';
  }

  if (errorMessage || !initialData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] gap-4 p-8 text-center">
        <div className="text-4xl">🚧</div>
        <h2 className="text-xl font-semibold text-foreground">Recurring Rules Unavailable</h2>
        {errorMessage && (
          <p className="text-sm text-muted-foreground font-mono bg-muted px-4 py-2 rounded-md max-w-lg">
            {errorMessage}
          </p>
        )}
      </div>
    );
  }

  return <RecurringView initialData={initialData} />;
}

export default function RecurringPage() {
  if (!isFinanceFeatureEnabled('recurring')) {
    notFound();
  }

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Recurring Rules..." />}>
      <RecurringContent />
    </Suspense>
  );
}
