'use client';

import React from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { cn } from '@/lib/utils';
import {
  LayoutDashboardIcon,
  ArrowLeftRightIcon,
  LandmarkIcon,
  PiggyBankIcon,
  CalendarSyncIcon,
  UploadCloudIcon,
  TagsIcon,
} from 'lucide-react';
import { SetupBanner } from '@src/components/finance/setup/setup-banner';
import { FinanceInitializer } from '@src/components/finance/shared/finance-initializer';
import { isFeatureEnabled, type FinanceFeature } from '@src/lib/finance/flags';

interface FinanceTabItem {
  label: string;
  href: string;
  icon: React.ComponentType<{ className?: string }>;
  feature?: FinanceFeature;
}

const financeTabs: readonly FinanceTabItem[] = [
  { label: 'Overview', href: '/finance/overview', icon: LayoutDashboardIcon, feature: 'overview' },
  { label: 'Transactions', href: '/finance/transactions', icon: ArrowLeftRightIcon, feature: 'transactions' },
  { label: 'Accounts', href: '/finance/accounts', icon: LandmarkIcon, feature: 'accounts' },
  { label: 'Budgets', href: '/finance/budgets', icon: PiggyBankIcon, feature: 'budgets' },
  { label: 'Recurring', href: '/finance/recurring', icon: CalendarSyncIcon, feature: 'recurring' },
  { label: 'Import', href: '/finance/import', icon: UploadCloudIcon, feature: 'import' },
  { label: 'Categories', href: '/finance/categories', icon: TagsIcon, feature: 'accounts' },
] as const;

export default function FinanceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const pathname = usePathname();

  if (pathname.startsWith('/finance/setup')) {
    return (
      <>
        <FinanceInitializer />
        <div className="flex flex-1 flex-col min-h-0 h-full overflow-y-auto bg-background">{children}</div>
      </>
    );
  }

  return (
    <div className="flex flex-1 min-w-0 flex-col min-h-0 overflow-hidden bg-background">
      <FinanceInitializer />
      <SetupBanner />
      <header className="border-b bg-card/50 px-6 py-3 shrink-0">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-xl font-bold tracking-tight">Personal Finance</h1>
            <p className="text-xs text-muted-foreground mt-0.5">
              Track accounts, net worth, cash flow, budgets, and investments
            </p>
          </div>
        </div>

        <nav className="flex space-x-1 sm:space-x-2 mt-4 overflow-x-auto no-scrollbar">
          {financeTabs
            .filter((tab) => !tab.feature || isFeatureEnabled(tab.feature))
            .map((tab) => {
            const isActive =
              pathname === tab.href ||
              (tab.href === '/finance/overview' && pathname === '/finance') ||
              (tab.href !== '/finance/overview' && pathname.startsWith(tab.href));

            return (
              <Link
                key={tab.href}
                href={tab.href}
                prefetch={false}
                className={cn(
                  'flex items-center gap-1.5 px-3 py-1.5 rounded-md text-xs font-medium transition-colors shrink-0',
                  isActive
                    ? 'bg-primary text-primary-foreground shadow-xs'
                    : 'text-muted-foreground hover:bg-muted hover:text-foreground'
                )}
              >
                <tab.icon className="size-3.5" />
                <span>{tab.label}</span>
              </Link>
            );
          })}
        </nav>
      </header>

      <main className="flex-1 min-h-0 min-w-0 overflow-y-auto p-6">{children}</main>
    </div>
  );
}

