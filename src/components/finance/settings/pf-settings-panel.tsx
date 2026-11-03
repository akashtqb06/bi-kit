'use client';

import React, { useEffect, useState } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';
import { ShieldCheckIcon, InfoIcon, PercentIcon } from 'lucide-react';
import { toast } from 'sonner';

export function PfSettingsPanel() {
  const [includeEps, setIncludeEps] = useState(false);
  const [includeAccruedInterest, setIncludeAccruedInterest] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let ignore = false;
    async function loadSettings() {
      try {
        const res = await fetch('/api/finance/settings');
        if (res.ok) {
          const data = (await res.json()) as {
            includeEpsInNetWorth?: boolean;
            includeAccruedInterestInNetWorth?: boolean;
          };
          if (!ignore) {
            if (data.includeEpsInNetWorth !== undefined) {
              setIncludeEps(Boolean(data.includeEpsInNetWorth));
            }
            if (data.includeAccruedInterestInNetWorth !== undefined) {
              setIncludeAccruedInterest(Boolean(data.includeAccruedInterestInNetWorth));
            }
          }
        }
      } catch {
        // ignore load errors
      } finally {
        if (!ignore) setLoading(false);
      }
    }
    void loadSettings();
    return () => {
      ignore = true;
    };
  }, []);

  const handleUpdate = async (field: 'includeEpsInNetWorth' | 'includeAccruedInterestInNetWorth', value: boolean) => {
    if (field === 'includeEpsInNetWorth') setIncludeEps(value);
    if (field === 'includeAccruedInterestInNetWorth') setIncludeAccruedInterest(value);

    try {
      const res = await fetch('/api/finance/settings', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: value }),
      });
      if (!res.ok) throw new Error('Failed to update setting');
      toast.success('Retirement net worth preference updated');
    } catch {
      // rollback
      if (field === 'includeEpsInNetWorth') setIncludeEps(!value);
      if (field === 'includeAccruedInterestInNetWorth') setIncludeAccruedInterest(!value);
      toast.error('Failed to update setting');
    }
  };

  return (
    <Card>
      <CardHeader className="pb-3">
        <div className="flex items-center gap-2">
          <div className="size-8 rounded-lg bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 flex items-center justify-center">
            <ShieldCheckIcon className="size-4" />
          </div>
          <div>
            <CardTitle className="text-sm font-semibold">Provident Fund & Net Worth</CardTitle>
            <CardDescription className="text-xs">
              Configure how EPFO pension balances and estimated interest impact your overall net worth.
            </CardDescription>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="divide-y divide-border/60 border rounded-lg overflow-hidden bg-card text-xs">
          {/* Include EPS (pension) in Net Worth */}
          <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
            <div className="min-w-0 pr-4">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">Include EPS (pension) in net worth</span>
                <TooltipProvider delay={100}>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center cursor-help"
                      aria-label="EPS explanation"
                    >
                      <InfoIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs p-2.5">
                      Your employer&apos;s 12% statutory PF contribution is split: 3.67% goes into your EPF savings, and 8.33% goes into the Employee Pension Scheme (EPS). EPS is an annuity pension scheme without a lump-sum market valuation and is excluded from net worth by default.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                By default off. When enabled, your EPS pension balance memo is added directly to total assets.
              </p>
            </div>

            <div className="shrink-0 self-start sm:self-center">
              <Switch
                disabled={loading}
                checked={includeEps}
                onCheckedChange={(val) => void handleUpdate('includeEpsInNetWorth', val)}
                aria-label="Include EPS in net worth toggle"
              />
            </div>
          </div>

          {/* Include accrued interest estimate in Net Worth */}
          <div className="p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 hover:bg-muted/30 transition-colors">
            <div className="min-w-0 pr-4">
              <div className="flex items-center gap-1.5">
                <span className="font-semibold text-foreground">Include accrued interest estimate in net worth</span>
                <TooltipProvider delay={100}>
                  <Tooltip>
                    <TooltipTrigger
                      type="button"
                      className="text-muted-foreground hover:text-foreground inline-flex items-center cursor-help"
                      aria-label="Accrued interest explanation"
                    >
                      <PercentIcon className="size-3.5" />
                    </TooltipTrigger>
                    <TooltipContent className="max-w-xs text-xs p-2.5">
                      EPFO credits annual interest at the close of the financial year. With a declared interest rate, pro-rated month-by-month accrued interest can be estimated and counted toward net worth before the official annual credit.
                    </TooltipContent>
                  </Tooltip>
                </TooltipProvider>
              </div>
              <p className="text-[11px] text-muted-foreground mt-0.5 leading-relaxed">
                By default off. When enabled, current financial year interest accrued to date is added to total assets.
              </p>
            </div>

            <div className="shrink-0 self-start sm:self-center">
              <Switch
                disabled={loading}
                checked={includeAccruedInterest}
                onCheckedChange={(val) => void handleUpdate('includeAccruedInterestInNetWorth', val)}
                aria-label="Include accrued interest estimate in net worth toggle"
              />
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

