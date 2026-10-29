'use client';

import React, { useEffect } from 'react';
import { CalendarIcon, GlobeIcon, IndianRupeeIcon, InfoIcon } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Button } from '@/components/ui/button';
import type { SetupPreferences } from '@src/lib/finance/setup/types';

interface PreferencesStepProps {
  preferences: SetupPreferences;
  onChange: (updated: SetupPreferences) => void;
  onNext: () => void;
  onBack: () => void;
}

export function PreferencesStep({
  preferences,
  onChange,
  onNext,
  onBack,
}: PreferencesStepProps) {
  // Auto-detect browser timezone on first mount if default
  useEffect(() => {
    try {
      const browserTz = Intl.DateTimeFormat().resolvedOptions().timeZone;
      if (browserTz && preferences.timezone === 'Asia/Kolkata') {
        onChange({ ...preferences, timezone: browserTz });
      }
    } catch {
      // Keep fallback
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="space-y-6">
      <div className="space-y-1 text-center sm:text-left">
        <h2 className="text-xl font-bold tracking-tight text-foreground">
          Regional Preferences
        </h2>
        <p className="text-xs text-muted-foreground">
          Set your local timezone and starting date. All account balances and initial valuations will be recorded as of this tracking start date.
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        {/* Timezone */}
        <div className="space-y-2">
          <Label htmlFor="pref-timezone" className="text-xs font-semibold flex items-center gap-1.5">
            <GlobeIcon className="size-3.5 text-muted-foreground" />
            <span>Timezone</span>
          </Label>
          <Input
            id="pref-timezone"
            value={preferences.timezone}
            onChange={(e) => onChange({ ...preferences, timezone: e.target.value })}
            placeholder="Asia/Kolkata"
            className="text-xs"
          />
          <p className="text-[11px] text-muted-foreground">
            Auto-detected from your browser. Used for statement and recurring schedules.
          </p>
        </div>

        {/* Currency (Read-only INR in v1) */}
        <div className="space-y-2">
          <Label htmlFor="pref-currency" className="text-xs font-semibold flex items-center gap-1.5">
            <IndianRupeeIcon className="size-3.5 text-muted-foreground" />
            <span>Base Currency</span>
          </Label>
          <div className="relative">
            <Input
              id="pref-currency"
              value="INR (₹ Indian Rupee)"
              disabled
              className="text-xs bg-muted/50 cursor-not-allowed font-medium text-foreground"
            />
          </div>
          <p className="text-[11px] text-muted-foreground">
            INR is the fixed base currency for v1. Multi-currency will arrive in v2.
          </p>
        </div>

        {/* Tracking Start Date */}
        <div className="space-y-2 sm:col-span-2">
          <Label htmlFor="pref-start-date" className="text-xs font-semibold flex items-center gap-1.5">
            <CalendarIcon className="size-3.5 text-muted-foreground" />
            <span>Tracking starts on</span>
          </Label>
          <Input
            id="pref-start-date"
            type="date"
            value={preferences.trackingStartDate}
            onChange={(e) => onChange({ ...preferences, trackingStartDate: e.target.value })}
            className="text-xs max-w-sm"
          />
          <div className="rounded-lg bg-primary/5 border border-primary/15 p-3 flex items-start gap-2.5 mt-2">
            <InfoIcon className="size-4 text-primary shrink-0 mt-0.5" />
            <p className="text-xs text-muted-foreground leading-relaxed">
              <strong className="text-foreground">Important:</strong> Opening balances entered in the next step will represent what you have in each account as of midnight on this date.
            </p>
          </div>
        </div>
      </div>

      <div className="flex items-center justify-between gap-3 pt-4 border-t">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="text-xs"
          onClick={onBack}
        >
          Back
        </Button>

        <Button
          type="button"
          size="sm"
          className="text-xs font-semibold min-w-[120px]"
          onClick={onNext}
          disabled={!preferences.trackingStartDate}
        >
          Continue to Accounts
        </Button>
      </div>
    </div>
  );
}
