'use client';

import React, { useEffect, useSyncExternalStore } from 'react';
import { PlusIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useFinanceStore } from '../shared/finance-store';
import { QuickAddDialog } from './quick-add-dialog';

const emptySubscribe = () => () => {};

export function QuickAddSlot() {
  const isClient = useSyncExternalStore(
    emptySubscribe,
    () => true,
    () => false
  );

  const { openQuickAdd, quickAddOpen } = useFinanceStore();

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.isContentEditable)
      ) {
        return;
      }

      // 'n' shortcut to trigger quick add (also supports legacy 'c' or 'q')
      if (
        (e.key === 'n' || e.key === 'c' || e.key === 'q') &&
        !e.metaKey &&
        !e.ctrlKey &&
        !e.altKey
      ) {
        e.preventDefault();
        openQuickAdd();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [openQuickAdd]);

  if (!isClient) {
    return null;
  }

  return (
    <>
      {/* Header "+" Button */}
      <Button
        variant="default"
        size="sm"
        className="h-8 gap-1.5 text-xs font-semibold shadow-xs"
        onClick={() => openQuickAdd()}
        title="Quick Add Transaction (Press 'n')"
        aria-label="Quick Add Transaction"
      >
        <PlusIcon className="size-3.5" />
        <span className="hidden sm:inline">Add Transaction</span>
      </Button>

      {/* Floating Action Button on Mobile */}
      {!quickAddOpen && (
        <button
          type="button"
          onClick={() => openQuickAdd()}
          className="sm:hidden fixed bottom-6 right-6 z-40 size-13 rounded-full bg-primary text-primary-foreground shadow-xl flex items-center justify-center hover:bg-primary/90 active:scale-95 transition-transform"
          aria-label="Quick Add Transaction Floating Button"
        >
          <PlusIcon className="size-6" />
        </button>
      )}

      {/* Quick Add Dialog / Drawer */}
      <QuickAddDialog />
    </>
  );
}
