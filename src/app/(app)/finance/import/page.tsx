import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { FinancePageSkeleton } from '@src/components/finance/shared/finance-skeleton';
import { ImportWizard } from '@src/components/finance/import/import-wizard';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';

export const metadata = {
  title: 'Import Statements | Personal Finance',
  description: 'Upload bank and credit card statement CSVs, preview column mappings, auto-categorize, and import transactions.',
};

export const dynamic = 'force-dynamic';

export default function ImportPage() {
  if (!isFinanceFeatureEnabled('import')) {
    notFound();
  }

  return (
    <div className="space-y-6 p-4 md:p-6 max-w-7xl mx-auto">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">Import Statements</h1>
        <p className="text-xs text-muted-foreground mt-1">
          Upload bank or credit card statements, map columns, review duplicates, and auto-categorize in one atomic transaction.
        </p>
      </div>

      <Suspense fallback={<FinancePageSkeleton title="Loading Statement Importer..." />}>
        <ImportWizard />
      </Suspense>
    </div>
  );
}
