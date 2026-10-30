import React, { Suspense } from 'react';
import { CategoriesView } from '@src/components/finance/shared/categories-view';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';

export const dynamic = 'force-dynamic';

export default function CategoriesPage() {
  return (
    <Suspense fallback={<FinancePageSkeleton title="Loading Categories..." />}>
      <CategoriesView />
    </Suspense>
  );
}
