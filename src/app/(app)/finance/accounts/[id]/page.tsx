import React, { Suspense } from 'react';
import { AccountDetailView } from '@src/components/finance/accounts/account-detail-view';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';

export const dynamic = 'force-dynamic';

export default async function AccountDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Account Details..." />}>
      <AccountDetailView accountId={id} />
    </Suspense>
  );
}
