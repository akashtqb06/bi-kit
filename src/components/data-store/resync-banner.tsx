'use client';

import React, { useState } from 'react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Button } from '@/components/ui/button';
import { AlertTriangleIcon, Loader2Icon, RefreshCwIcon } from 'lucide-react';
import { toast } from 'sonner';

interface ResyncBannerProps {
    needsResync: boolean;
    onResynced?: () => void;
}

export function ResyncBanner({ needsResync, onResynced }: ResyncBannerProps) {
    const [isSyncing, setIsSyncing] = useState(false);

    if (!needsResync) return null;

    const handleSyncAll = async () => {
        setIsSyncing(true);
        try {
            const res = await fetch('/api/data-store/sync-all', { method: 'POST' });
            if (!res.ok) throw new Error('Failed to initiate re-sync');
            toast.success('Re-sync started for all Data Store tables');
            onResynced?.();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Re-sync failed');
        } finally {
            setIsSyncing(false);
        }
    };

    return (
        <Alert variant="destructive" className="border-amber-500/50 bg-amber-500/10 text-amber-900 dark:text-amber-200">
            <AlertTriangleIcon className="size-4 text-amber-600 dark:text-amber-400" />
            <div className="flex flex-1 items-center justify-between gap-4">
                <div>
                    <AlertTitle className="text-sm font-semibold">Data Store tables need re-syncing</AlertTitle>
                    <AlertDescription className="text-xs text-amber-800 dark:text-amber-300">
                        Local physical tables are missing (e.g. following a database backup restore).
                    </AlertDescription>
                </div>
                <Button
                    size="sm"
                    variant="outline"
                    className="border-amber-600 text-amber-900 hover:bg-amber-500/20 dark:text-amber-200"
                    onClick={handleSyncAll}
                    disabled={isSyncing}
                >
                    {isSyncing ? (
                        <Loader2Icon className="mr-1.5 size-3.5 animate-spin" />
                    ) : (
                        <RefreshCwIcon className="mr-1.5 size-3.5" />
                    )}
                    <span>Sync all</span>
                </Button>
            </div>
        </Alert>
    );
}

