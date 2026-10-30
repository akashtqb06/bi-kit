import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { TransactionTable } from '@src/components/finance/transactions/transaction-table';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export default function TransactionsPage() {
  if (!isFinanceFeatureEnabled('transactions')) {
    notFound();
  }

  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Transactions..." />}>
      <div className="flex flex-col h-full min-h-0">
        <TransactionTable />
      </div>
    </Suspense>
  );
}
