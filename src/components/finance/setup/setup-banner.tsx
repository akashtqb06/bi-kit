'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { SparklesIcon, ArrowRightIcon, XIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';

export function SetupBanner() {
  const [show, setShow] = useState<boolean>(false);
  const [dismissed, setDismissed] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;
    async function checkStatus() {
      try {
        const res = await fetch('/api/finance/setup');
        if (!res.ok) return;
        const data = await res.json();
        const isCompleted = Boolean(data.settings?.setupCompletedAt);
        if (mounted && !isCompleted) {
          setShow(true);
        }
      } catch {
        // Ignore fetch errors
      }
    }
    checkStatus();
    return () => {
      mounted = false;
    };
  }, []);

  if (!show || dismissed) {
    return null;
  }

  return (
    <div className="bg-primary/10 border-b border-primary/20 px-6 py-2.5 shrink-0 flex items-center justify-between gap-4 transition-all animate-in fade-in slide-in-from-top-1">
      <div className="flex items-center gap-2.5 min-w-0">
        <div className="size-6 rounded-full bg-primary/20 flex items-center justify-center shrink-0">
          <SparklesIcon className="size-3.5 text-primary" />
        </div>
        <p className="text-xs sm:text-sm font-medium text-foreground truncate">
          <span className="font-semibold">Setup incomplete:</span> Add your accounts and initial balances to unlock full net worth tracking.
        </p>
      </div>

      <div className="flex items-center gap-2 shrink-0">
        <Button
          size="sm"
          className="h-7 px-3 text-xs gap-1 font-medium"
          render={<Link href="/finance/setup" />}
          nativeButton={false}
        >
          <span>Finish setting up</span>
          <ArrowRightIcon className="size-3" />
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="size-7 p-0 text-muted-foreground hover:text-foreground"
          onClick={() => setDismissed(true)}
          title="Dismiss for this session"
        >
          <XIcon className="size-3.5" />
        </Button>
      </div>
    </div>
  );
}
