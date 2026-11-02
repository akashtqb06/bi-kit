import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { InboxView } from '@src/components/finance/inbox/inbox-view';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export default function FinanceInboxPage() {
  if (!isFinanceFeatureEnabled('inbox')) {
    notFound();
  }

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Inbox..." />}>
      <div className="flex flex-col h-full min-h-0">
        <InboxView />
      </div>
    </Suspense>
  );
}
