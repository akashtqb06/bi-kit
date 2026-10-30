import { Suspense } from 'react';
import { notFound, redirect } from 'next/navigation';
import { requireUser } from '@src/lib/auth/dal';
import { checkSetupRedirect } from '@src/lib/finance/setup/service';
import { isAnyFinanceFeatureEnabled, isFinanceFeatureEnabled } from '@src/lib/finance/flags';

async function FinanceEntryRedirect(): Promise<null> {
  if (!isAnyFinanceFeatureEnabled()) {
    notFound();
  }

  const user = await requireUser('/finance');

  if (isFinanceFeatureEnabled('setup')) {
    const { shouldRedirect } = await checkSetupRedirect(user.id);
    if (shouldRedirect) {
      redirect('/finance/setup');
    }
  }

  if (isFinanceFeatureEnabled('overview')) {
    redirect('/finance/overview');
  }
  if (isFinanceFeatureEnabled('transactions')) {
    redirect('/finance/transactions');
  }
  if (isFinanceFeatureEnabled('accounts')) {
    redirect('/finance/accounts');
  }
  if (isFinanceFeatureEnabled('import')) {
    redirect('/finance/import');
  }

  notFound();
}

export default function FinanceRootPage() {
  return (
    <Suspense fallback={null}>
      <FinanceEntryRedirect />
    </Suspense>
  );
}
