import React, { Suspense } from 'react';
import { notFound } from 'next/navigation';
import { requireUser } from '@src/lib/auth/dal';
import { getUserSettings } from '@src/lib/finance/setup/service';
import { SetupWizard } from '@src/components/finance/setup/setup-wizard';
import { isFinanceFeatureEnabled } from '@src/lib/finance/flags';
import type { SetupDraftState } from '@src/lib/finance/setup/types';

async function SetupWizardLoader() {
  if (!isFinanceFeatureEnabled('setup')) {
    notFound();
  }
  const user = await requireUser('/finance/setup');
  const settings = await getUserSettings(user.id);

  const initialDraft = (settings?.draft as SetupDraftState) || null;
  const initialStep = settings?.setupStep || 1;

  return (
    <SetupWizard
      initialDraft={initialDraft}
      initialStep={initialStep}
    />
  );
}

export default function FinanceSetupPage() {
  if (!isFinanceFeatureEnabled('setup')) {
    notFound();
  }

  return (
    <Suspense
      fallback={
        <div className="flex h-full w-full items-center justify-center p-8">
          <div className="text-xs text-muted-foreground animate-pulse">
            Loading setup wizard...
          </div>
        </div>
      }
    >
      <SetupWizardLoader />
    </Suspense>
  );
}
