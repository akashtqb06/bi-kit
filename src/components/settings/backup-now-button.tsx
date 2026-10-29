'use client';

import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import {
    Dialog,
    DialogContent,
    DialogDescription,
    DialogFooter,
    DialogHeader,
    DialogTitle,
} from '@/components/ui/dialog';
import { PlayIcon, CopyIcon, CheckIcon, TerminalIcon } from 'lucide-react';
import { toast } from 'sonner';

export function BackupNowButton() {
    const [loading, setLoading] = useState(false);
    const [dialogOpen, setDialogOpen] = useState(false);
    const [backupData, setBackupData] = useState<{
        triggered: boolean;
        message: string;
        cliCommand: string;
        dockerCommand: string;
    } | null>(null);
    const [copied, setCopied] = useState(false);

    const handleBackupNow = async () => {
        try {
            setLoading(true);
            const res = await fetch('/api/admin/backup', { method: 'POST' });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to trigger backup');
            }
            setBackupData(json.data);
            setDialogOpen(true);
            if (json.data?.triggered) {
                toast.success('Backup initiated successfully');
            } else {
                toast.info('Backup instructions available');
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error triggering backup');
        } finally {
            setLoading(false);
        }
    };

    const copyCommand = async (cmd: string) => {
        try {
            await navigator.clipboard.writeText(cmd);
            setCopied(true);
            toast.success('Command copied to clipboard');
            setTimeout(() => setCopied(false), 2000);
        } catch {
            toast.error('Failed to copy');
        }
    };

    return (
        <>
            <Button
                variant="outline"
                size="sm"
                onClick={handleBackupNow}
                disabled={loading}
                className="gap-1.5 cursor-pointer text-xs"
            >
                <PlayIcon className="size-3.5 fill-current" />
                <span>{loading ? 'Initiating...' : 'Backup Now'}</span>
            </Button>

            <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
                <DialogContent className="sm:max-w-md">
                    <DialogHeader>
                        <DialogTitle className="flex items-center gap-2">
                            <TerminalIcon className="size-5 text-primary" />
                            On-Demand Backup
                        </DialogTitle>
                        <DialogDescription>
                            {backupData?.message || 'Run a manual snapshot of database and files.'}
                        </DialogDescription>
                    </DialogHeader>

                    <div className="space-y-3 py-2 text-xs">
                        <p className="text-muted-foreground">
                            You can also trigger an on-demand backup directly using the CLI or Docker command:
                        </p>

                        <div className="space-y-2">
                            <div className="rounded-md border bg-muted/60 p-2.5 font-mono flex items-center justify-between gap-2">
                                <span className="truncate select-all">{backupData?.dockerCommand || 'docker compose exec backup /usr/local/bin/backup.sh'}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => copyCommand(backupData?.dockerCommand || 'docker compose exec backup /usr/local/bin/backup.sh')}
                                    className="size-7 shrink-0 cursor-pointer"
                                >
                                    {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
                                </Button>
                            </div>

                            <div className="rounded-md border bg-muted/60 p-2.5 font-mono flex items-center justify-between gap-2">
                                <span className="truncate select-all">{backupData?.cliCommand || 'bash scripts/backup-now.sh'}</span>
                                <Button
                                    variant="ghost"
                                    size="icon"
                                    onClick={() => copyCommand(backupData?.cliCommand || 'bash scripts/backup-now.sh')}
                                    className="size-7 shrink-0 cursor-pointer"
                                >
                                    {copied ? <CheckIcon className="size-3.5 text-emerald-600" /> : <CopyIcon className="size-3.5" />}
                                </Button>
                            </div>
                        </div>
                    </div>

                    <DialogFooter>
                        <Button onClick={() => setDialogOpen(false)} className="cursor-pointer">
                            Close
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>
        </>
    );
}
