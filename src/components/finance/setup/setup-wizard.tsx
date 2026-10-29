'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Card,
  CardContent,
} from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import {
  CheckIcon,
  SparklesIcon,
  CompassIcon,
  LandmarkIcon,
  TagsIcon,
  ClipboardCheckIcon,
  PartyPopperIcon,
  RotateCcwIcon,
} from 'lucide-react';
import type {
  DraftAccount,
  SetupCategories,
  SetupDraftState,
  SetupPreferences,
} from '@src/lib/finance/setup/types';
import { WelcomeStep } from './steps/welcome-step';
import { PreferencesStep } from './steps/preferences-step';
import { AccountsStep } from './steps/accounts-step';
import { CategoriesStep } from './steps/categories-step';
import { ReviewStep } from './steps/review-step';
import { FinishStep } from './steps/finish-step';

interface SetupWizardProps {
  initialDraft?: SetupDraftState | null;
  initialStep?: number;
}

const STEP_CONFIG = [
  { step: 1, title: 'Welcome', icon: CompassIcon },
  { step: 2, title: 'Preferences', icon: SparklesIcon },
  { step: 3, title: 'Accounts', icon: LandmarkIcon },
  { step: 4, title: 'Categories', icon: TagsIcon },
  { step: 5, title: 'Review', icon: ClipboardCheckIcon },
  { step: 6, title: 'Finish', icon: PartyPopperIcon },
] as const;

export function SetupWizard({
  initialDraft,
  initialStep = 1,
}: SetupWizardProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const isRerun = searchParams.get('rerun') === 'true';

  const todayStr = new Date().toISOString().slice(0, 10);

  // Wizard state
  const [step, setStep] = useState<number>(isRerun ? 3 : initialStep || 1);
  const [preferences, setPreferences] = useState<SetupPreferences>(
    initialDraft?.preferences || {
      timezone: 'Asia/Kolkata',
      baseCurrency: 'INR',
      trackingStartDate: todayStr,
      weekStartsOn: 1,
    }
  );
  const [accounts, setAccounts] = useState<DraftAccount[]>(
    initialDraft?.accounts || []
  );
  const [categories, setCategories] = useState<SetupCategories>(
    initialDraft?.categories || {
      disabledDefaults: [],
      customCategories: [],
    }
  );

  const [isSkipping, setIsSkipping] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [accountsCreatedCount, setAccountsCreatedCount] = useState(0);

  // Debounced autosave ref
  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);

  const persistDraft = useCallback(
    async (stepToSave: number, currentPrefs: SetupPreferences, currentAccs: DraftAccount[], currentCats: SetupCategories) => {
      try {
        const payload: SetupDraftState = {
          step: stepToSave,
          preferences: currentPrefs,
          accounts: currentAccs,
          categories: currentCats,
        };

        await fetch('/api/finance/setup', {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            step: stepToSave,
            draft: payload,
          }),
        });
      } catch {
        // Silently tolerate autosave background failure
      }
    },
    []
  );

  // Trigger debounced autosave on state changes (steps 1 through 5)
  useEffect(() => {
    if (step >= 6) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      persistDraft(step, preferences, accounts, categories);
    }, 600);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [step, preferences, accounts, categories, persistDraft]);

  const goToStep = (nextStep: number) => {
    setStep(nextStep);
    // Flush draft immediately on explicit step transition
    persistDraft(nextStep, preferences, accounts, categories);
  };

  const handleSkip = async () => {
    setIsSkipping(true);
    try {
      const res = await fetch('/api/finance/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'skip' }),
      });
      if (!res.ok) throw new Error('Failed to skip setup');
      toast.info('Setup skipped. You can finish it anytime from the top banner.');
      router.push('/finance/overview');
    } catch {
      toast.error('Could not skip setup. Please try again.');
    } finally {
      setIsSkipping(false);
    }
  };

  const handleFinish = async () => {
    setIsSubmitting(true);
    try {
      const res = await fetch('/api/finance/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'complete',
          payload: {
            preferences,
            accounts,
            categories,
          },
        }),
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to complete setup');
      }

      setAccountsCreatedCount(data.accountsCreated || accounts.length);
      setStep(6);
      toast.success('🎉 Setup complete! All accounts and balances saved.');
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Error completing setup');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="min-h-full w-full py-8 px-4 sm:px-6 flex flex-col items-center justify-center">
      <div className="w-full max-w-2xl space-y-6">
        {/* Stepper Navigation */}
        <div className="w-full">
          {/* Mobile Stepper Header */}
          <div className="flex sm:hidden items-center justify-between px-2 mb-2">
            <span className="text-xs font-semibold text-muted-foreground">
              Step {step} of 6: <strong className="text-foreground">{STEP_CONFIG[step - 1]?.title}</strong>
            </span>
            {isRerun && (
              <Badge variant="outline" className="text-[10px] gap-1">
                <RotateCcwIcon className="size-2.5" />
                <span>Re-run mode</span>
              </Badge>
            )}
          </div>

          {/* Stepper Bar */}
          <div className="grid grid-cols-6 gap-1.5 sm:gap-2">
            {STEP_CONFIG.map((s) => {
              const isPast = s.step < step;
              const isCurrent = s.step === step;
              const Icon = s.icon;

              return (
                <div
                  key={s.step}
                  className={`flex flex-col items-center text-center group ${
                    isCurrent
                      ? 'text-primary font-bold'
                      : isPast
                      ? 'text-foreground font-medium'
                      : 'text-muted-foreground'
                  }`}
                >
                  <div
                    className={`size-7 sm:size-8 rounded-full flex items-center justify-center text-xs transition-colors mb-1 ${
                      isPast
                        ? 'bg-primary text-primary-foreground'
                        : isCurrent
                        ? 'bg-primary/20 text-primary border-2 border-primary'
                        : 'bg-muted text-muted-foreground'
                    }`}
                  >
                    {isPast ? <CheckIcon className="size-3.5 stroke-[3]" /> : <Icon className="size-3.5" />}
                  </div>
                  <span className="hidden sm:inline text-[11px] truncate max-w-[80px]">
                    {s.title}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Wizard Card Body */}
        <Card className="shadow-lg border bg-card">
          <CardContent className="p-6 sm:p-8">
            {step === 1 && (
              <WelcomeStep
                onNext={() => goToStep(2)}
                onSkip={handleSkip}
                isSkipping={isSkipping}
              />
            )}

            {step === 2 && (
              <PreferencesStep
                preferences={preferences}
                onChange={setPreferences}
                onNext={() => goToStep(3)}
                onBack={() => goToStep(1)}
              />
            )}

            {step === 3 && (
              <AccountsStep
                accounts={accounts}
                trackingStartDate={preferences.trackingStartDate}
                onChange={setAccounts}
                onNext={() => goToStep(4)}
                onBack={() => goToStep(2)}
              />
            )}

            {step === 4 && (
              <CategoriesStep
                categories={categories}
                onChange={setCategories}
                onNext={() => goToStep(5)}
                onBack={() => goToStep(3)}
              />
            )}

            {step === 5 && (
              <ReviewStep
                preferences={preferences}
                accounts={accounts}
                onBack={() => goToStep(4)}
                onFinish={handleFinish}
                isSubmitting={isSubmitting}
              />
            )}

            {step === 6 && (
              <FinishStep accountsCreatedCount={accountsCreatedCount} />
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
