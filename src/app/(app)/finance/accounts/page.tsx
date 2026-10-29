import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { AccountsView } from '@src/components/finance/accounts/accounts-view';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export default function AccountsPage() {
  if (!isFinanceFeatureEnabled('accounts')) {
    notFound();
  }

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Accounts..." />}>
      <AccountsView />
    </Suspense>
  );
}
