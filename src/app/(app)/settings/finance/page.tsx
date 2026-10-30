import React, { Suspense } from 'react';
import Link from 'next/link';
import { requireUser } from '@src/lib/auth/dal';
import { getUserSettings } from '@src/lib/finance/setup/service';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  RotateCcwIcon,
  SparklesIcon,
  ShieldCheckIcon,
  ArrowRightIcon,
  CalendarIcon,
  GlobeIcon,
} from 'lucide-react';
import { DataHealthPanel } from '@src/components/finance/settings/data-health-panel';
import { FinanceFeaturesPanel } from '@src/components/finance/settings/finance-features-panel';

async function FinanceSettingsContent() {
  const user = await requireUser('/settings/finance');
  const settings = await getUserSettings(user.id);

  const isSetupCompleted = Boolean(settings?.setupCompletedAt);
  const timezone = settings?.timezone || 'Asia/Kolkata';
  const trackingStart = settings?.trackingStartDate || 'Not set';
  const currency = settings?.baseCurrency || 'INR';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-lg font-semibold tracking-tight text-foreground">
          Finance Settings
        </h2>
        <p className="text-xs text-muted-foreground mt-0.5">
          Manage currency, regional timezone, and account setup preferences.
        </p>
      </div>

      {/* Preferences Overview */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold flex items-center justify-between">
            <span>Regional Configuration</span>
            {isSetupCompleted ? (
              <Badge variant="outline" className="text-emerald-600 border-emerald-500/30 text-[10px]">
                Setup Completed
              </Badge>
            ) : (
              <Badge variant="outline" className="text-amber-600 border-amber-500/30 text-[10px]">
                Setup Incomplete
              </Badge>
            )}
          </CardTitle>
          <CardDescription className="text-xs">
            Core currency and ledger calculation parameters.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3 pt-0">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
            <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <GlobeIcon className="size-3" />
                <span>Base Currency</span>
              </span>
              <div className="text-xs font-bold text-foreground">
                {currency} (Fixed in v1)
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <GlobeIcon className="size-3" />
                <span>Timezone</span>
              </span>
              <div className="text-xs font-bold text-foreground truncate">
                {timezone}
              </div>
            </div>

            <div className="p-3 rounded-lg bg-muted/40 border space-y-1">
              <span className="text-[11px] text-muted-foreground flex items-center gap-1">
                <CalendarIcon className="size-3" />
                <span>Tracking Starts On</span>
              </span>
              <div className="text-xs font-bold text-foreground">
                {trackingStart}
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Re-run Setup Card */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-2">
            <div className="size-8 rounded-lg bg-primary/10 text-primary flex items-center justify-center">
              <RotateCcwIcon className="size-4" />
            </div>
            <div>
              <CardTitle className="text-sm font-semibold">Re-run Setup Wizard</CardTitle>
              <CardDescription className="text-xs">
                Add more accounts, deposit presets, or categories in bulk.
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="space-y-4 pt-0">
          <div className="rounded-lg bg-emerald-500/10 border border-emerald-500/20 p-3 flex items-start gap-2.5">
            <ShieldCheckIcon className="size-4 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
            <p className="text-xs text-emerald-900/90 dark:text-emerald-200/90 leading-relaxed">
              <strong>Non-Destructive:</strong> Re-running setup only adds newly configured accounts. Existing accounts, opening balances, and past transactions will never be deleted.
            </p>
          </div>

          <div className="flex items-center justify-end">
            <Button
              size="sm"
              className="text-xs font-semibold gap-1.5"
              render={<Link href="/finance/setup?rerun=true" />}
              nativeButton={false}
            >
              <SparklesIcon className="size-3.5" />
              <span>Launch Setup in Re-run Mode</span>
              <ArrowRightIcon className="size-3" />
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Finance Features Overview */}
      <FinanceFeaturesPanel />

      {/* Data Health Diagnostics */}
      <DataHealthPanel />
    </div>
  );
}

export default function FinanceSettingsPage() {
  return (
    <Suspense
      fallback={
        <div className="p-6 text-xs text-muted-foreground animate-pulse">
          Loading finance settings...
        </div>
      }
    >
      <FinanceSettingsContent />
    </Suspense>
  );
}
