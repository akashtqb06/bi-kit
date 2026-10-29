'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
    SearchIcon,
    DownloadIcon,
    RefreshCwIcon,
    Trash2Icon,
    ClockIcon,
    SaveIcon,
    AlertTriangleIcon,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from '@/components/ui/table';
import {
    AlertDialog,
    AlertDialogAction,
    AlertDialogCancel,
    AlertDialogContent,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogHeader,
    AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Skeleton } from '@/components/ui/skeleton';
import { formatRelativeTime } from '@src/lib/utils';
import { toast } from 'sonner';

export interface AuditLogItem {
    id: string;
    action: string;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    dataSourceId: string | null;
    host: string | null;
    ipAddress: string | null;
    details: Record<string, unknown> | null;
    at: string | Date;
}

const ACTION_GROUPS = [
    { value: 'all', label: 'All Actions' },
    { value: 'auth.login', label: 'Sign-in (Success)' },
    { value: 'auth.login_failed', label: 'Sign-in (Failed)' },
    { value: 'auth.logout', label: 'Sign-out' },
    { value: 'user.create', label: 'User Created' },
    { value: 'user.update_role', label: 'User Role Changed' },
    { value: 'user.disable', label: 'User Disabled' },
    { value: 'user.enable', label: 'User Enabled' },
    { value: 'user.reset_password', label: 'Password Reset' },
    { value: 'user.revoke_sessions', label: 'Sessions Revoked' },
    { value: 'user.delete', label: 'User Deleted' },
    { value: 'settings.update', label: 'Settings Updated' },
    { value: 'data_source.create', label: 'Data Source Created' },
    { value: 'data_source.test', label: 'Data Source Tested' },
    { value: 'data_source.delete', label: 'Data Source Deleted' },
    { value: 'data_store.sync', label: 'Data Store Synced' },
    { value: 'data_store.delete', label: 'Data Store Deleted' },
    { value: 'export.audit_log', label: 'Audit Log Exported' },
];

function getActionBadgeVariant(action: string): {
    variant: 'default' | 'secondary' | 'outline' | 'destructive';
    className?: string;
} {
    if (action.includes('fail') || action.includes('delete') || action.includes('disable')) {
        return { variant: 'destructive' };
    }
    if (action.includes('create') || action.includes('enable')) {
        return {
            variant: 'outline',
            className: 'text-emerald-600 border-emerald-500/30 bg-emerald-50/50 dark:bg-emerald-950/20',
        };
    }
    if (action.includes('reset') || action.includes('revoke')) {
        return {
            variant: 'secondary',
            className: 'text-amber-600 border-amber-500/30 bg-amber-50/50 dark:bg-amber-950/20',
        };
    }
    if (action.startsWith('auth.')) {
        return { variant: 'default' };
    }
    return { variant: 'secondary' };
}

export function AuditLogTable() {
    const [logs, setLogs] = useState<AuditLogItem[]>([]);
    const [total, setTotal] = useState(0);
    const [retentionDays, setRetentionDays] = useState(180);
    const [newRetentionDays, setNewRetentionDays] = useState('180');
    const [loading, setLoading] = useState(true);
    const [savingRetention, setSavingRetention] = useState(false);
    const [purgeDialogOpen, setPurgeDialogOpen] = useState(false);
    const [purging, setPurging] = useState(false);

    // Filters
    const [selectedAction, setSelectedAction] = useState('all');
    const [searchQuery, setSearchQuery] = useState('');
    const [pageIndex, setPageIndex] = useState(0);
    const pageSize = 50;

    const fetchLogs = useCallback(async () => {
        try {
            setLoading(true);
            const params = new URLSearchParams();
            if (selectedAction && selectedAction !== 'all') {
                params.set('action', selectedAction);
            }
            if (searchQuery.trim()) {
                params.set('q', searchQuery.trim());
            }
            params.set('limit', String(pageSize));
            params.set('offset', String(pageIndex * pageSize));

            const res = await fetch(`/api/admin/audit-log?${params.toString()}`);
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to fetch audit logs');
            }

            setLogs(json.data || []);
            setTotal(json.total || 0);
            if (typeof json.retentionDays === 'number') {
                setRetentionDays(json.retentionDays);
                setNewRetentionDays(String(json.retentionDays));
            }
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error loading audit logs');
        } finally {
            setLoading(false);
        }
    }, [selectedAction, searchQuery, pageIndex]);

    useEffect(() => {
        let cancelled = false;
        const timer = setTimeout(() => {
            if (!cancelled) {
                void fetchLogs();
            }
        }, 0);
        return () => {
            cancelled = true;
            clearTimeout(timer);
        };
    }, [fetchLogs]);

    const handleSaveRetention = async (e: React.FormEvent) => {
        e.preventDefault();
        const days = parseInt(newRetentionDays, 10);
        if (!days || days < 7 || days > 3650) {
            toast.error('Retention period must be between 7 and 3650 days');
            return;
        }

        try {
            setSavingRetention(true);
            const res = await fetch('/api/admin/audit-log', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ retentionDays: days }),
            });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to update retention');
            }
            toast.success(`Audit log retention set to ${days} days`);
            setRetentionDays(days);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error updating retention');
        } finally {
            setSavingRetention(false);
        }
    };

    const handlePurgeNow = async () => {
        try {
            setPurging(true);
            const res = await fetch('/api/admin/audit-log/purge', { method: 'POST' });
            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error || 'Failed to purge audit logs');
            }
            toast.success(`Purged ${json.data?.purgedCount ?? 0} expired audit log records`);
            setPurgeDialogOpen(false);
            await fetchLogs();
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Error purging audit logs');
        } finally {
            setPurging(false);
        }
    };

    const handleExportCsv = () => {
        const params = new URLSearchParams();
        if (selectedAction && selectedAction !== 'all') {
            params.set('action', selectedAction);
        }
        if (searchQuery.trim()) {
            params.set('q', searchQuery.trim());
        }
        const a = document.createElement('a');
        a.href = `/api/admin/audit-log/export?${params.toString()}`;
        a.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
    };

    const totalPages = Math.ceil(total / pageSize);

    return (
        <div className="space-y-6">
            {/* Retention Setting Card */}
            <Card className="border">
                <CardHeader className="pb-3">
                    <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2">
                            <ClockIcon className="size-5 text-muted-foreground" />
                            <CardTitle className="text-base">Retention & Purge Policy</CardTitle>
                        </div>
                        <Badge variant="outline" className="text-xs font-mono">
                            {retentionDays} Days Retention
                        </Badge>
                    </div>
                    <CardDescription className="text-xs">
                        Audit records older than the retention threshold are automatically purged nightly by the scheduler.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <form onSubmit={handleSaveRetention} className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                        <div className="flex items-center gap-2 max-w-sm">
                            <span className="text-xs text-muted-foreground whitespace-nowrap">Retain logs for:</span>
                            <Input
                                type="number"
                                min={7}
                                max={3650}
                                value={newRetentionDays}
                                onChange={(e) => setNewRetentionDays(e.target.value)}
                                className="w-24 h-8 text-xs font-mono"
                            />
                            <span className="text-xs text-muted-foreground">days</span>
                            <Button
                                type="submit"
                                size="sm"
                                disabled={savingRetention || parseInt(newRetentionDays, 10) === retentionDays}
                                className="h-8 text-xs gap-1.5 cursor-pointer ml-1"
                            >
                                <SaveIcon className="size-3" />
                                <span>Save</span>
                            </Button>
                        </div>

                        <Button
                            type="button"
                            variant="outline"
                            size="sm"
                            onClick={() => setPurgeDialogOpen(true)}
                            className="h-8 text-xs gap-1.5 text-muted-foreground hover:text-destructive cursor-pointer shrink-0"
                        >
                            <Trash2Icon className="size-3.5" />
                            <span>Purge Expired Logs Now</span>
                        </Button>
                    </form>
                </CardContent>
            </Card>

            {/* Filter Toolbar */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3">
                <div className="flex flex-1 items-center gap-2 max-w-md">
                    <div className="relative w-full">
                        <SearchIcon className="absolute left-2.5 top-2.5 size-4 text-muted-foreground" />
                        <Input
                            placeholder="Search by action, user email, name, IP..."
                            value={searchQuery}
                            onChange={(e) => {
                                setSearchQuery(e.target.value);
                                setPageIndex(0);
                            }}
                            className="pl-8 text-xs h-9"
                        />
                    </div>
                </div>

                <div className="flex items-center gap-2">
                    <select
                        value={selectedAction}
                        onChange={(e) => {
                            setSelectedAction(e.target.value);
                            setPageIndex(0);
                        }}
                        className="h-9 rounded-md border border-input bg-background px-2.5 text-xs font-medium text-foreground outline-none"
                    >
                        {ACTION_GROUPS.map((g) => (
                            <option key={g.value} value={g.value}>
                                {g.label}
                            </option>
                        ))}
                    </select>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => void fetchLogs()}
                        className="h-9 px-2.5 cursor-pointer"
                        title="Refresh audit events"
                    >
                        <RefreshCwIcon className="size-3.5" />
                    </Button>

                    <Button
                        variant="outline"
                        size="sm"
                        onClick={handleExportCsv}
                        className="h-9 gap-1.5 cursor-pointer text-xs"
                    >
                        <DownloadIcon className="size-3.5" />
                        <span>Export CSV</span>
                    </Button>
                </div>
            </div>

            {/* Events Table */}
            <div className="rounded-md border bg-card overflow-hidden">
                <Table>
                    <TableHeader>
                        <TableRow>
                            <TableHead className="w-[170px]">Timestamp</TableHead>
                            <TableHead className="w-[180px]">Action</TableHead>
                            <TableHead className="w-[220px]">User</TableHead>
                            <TableHead className="w-[120px]">IP Address</TableHead>
                            <TableHead>Event Details</TableHead>
                        </TableRow>
                    </TableHeader>
                    <TableBody>
                        {loading ? (
                            Array.from({ length: 6 }).map((_, i) => (
                                <TableRow key={i}>
                                    <TableCell><Skeleton className="h-4 w-28" /></TableCell>
                                    <TableCell><Skeleton className="h-5 w-24" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-36" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-20" /></TableCell>
                                    <TableCell><Skeleton className="h-4 w-60" /></TableCell>
                                </TableRow>
                            ))
                        ) : logs.length === 0 ? (
                            <TableRow>
                                <TableCell colSpan={5} className="h-32 text-center text-muted-foreground text-sm">
                                    No audit events found matching your criteria.
                                </TableCell>
                            </TableRow>
                        ) : (
                            logs.map((log) => {
                                const badgeStyle = getActionBadgeVariant(log.action);
                                const dateObj = new Date(log.at);
                                const fullDate = dateObj.toLocaleString();

                                return (
                                    <TableRow key={log.id} className="text-xs">
                                        <TableCell className="font-mono text-muted-foreground whitespace-nowrap" title={fullDate}>
                                            {formatRelativeTime(log.at)}
                                        </TableCell>

                                        <TableCell>
                                            <Badge
                                                variant={badgeStyle.variant}
                                                className={`text-[11px] font-mono font-normal ${badgeStyle.className || ''}`}
                                            >
                                                {log.action}
                                            </Badge>
                                        </TableCell>

                                        <TableCell>
                                            {log.userEmail ? (
                                                <div className="flex flex-col min-w-0">
                                                    <span className="font-medium text-foreground truncate max-w-[190px]">
                                                        {log.userName || log.userEmail}
                                                    </span>
                                                    {log.userName && (
                                                        <span className="text-[10px] text-muted-foreground truncate max-w-[190px]">
                                                            {log.userEmail}
                                                        </span>
                                                    )}
                                                </div>
                                            ) : (
                                                <span className="text-muted-foreground italic">System / Anonymous</span>
                                            )}
                                        </TableCell>

                                        <TableCell className="font-mono text-[11px] text-muted-foreground">
                                            {log.ipAddress || '—'}
                                        </TableCell>

                                        <TableCell className="font-mono text-[11px] text-muted-foreground max-w-xs truncate">
                                            {log.details ? (
                                                <span title={JSON.stringify(log.details, null, 2)}>
                                                    {JSON.stringify(log.details)}
                                                </span>
                                            ) : log.host ? (
                                                <span>Host: {log.host}</span>
                                            ) : (
                                                '—'
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })
                        )}
                    </TableBody>
                </Table>
            </div>

            {/* Pagination */}
            <div className="flex items-center justify-between text-xs text-muted-foreground">
                <span>
                    Showing {logs.length > 0 ? pageIndex * pageSize + 1 : 0} to{' '}
                    {Math.min((pageIndex + 1) * pageSize, total)} of {total} events
                </span>

                <div className="flex items-center gap-1.5">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageIndex((p) => Math.max(0, p - 1))}
                        disabled={pageIndex === 0 || loading}
                        className="h-8 text-xs cursor-pointer"
                    >
                        Previous
                    </Button>
                    <span className="px-2">
                        Page {totalPages > 0 ? pageIndex + 1 : 1} of {Math.max(1, totalPages)}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setPageIndex((p) => p + 1)}
                        disabled={pageIndex + 1 >= totalPages || loading}
                        className="h-8 text-xs cursor-pointer"
                    >
                        Next
                    </Button>
                </div>
            </div>

            {/* Manual Purge Confirmation Dialog */}
            <AlertDialog open={purgeDialogOpen} onOpenChange={setPurgeDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle className="flex items-center gap-2 text-destructive">
                            <AlertTriangleIcon className="size-5" />
                            Purge Expired Audit Records?
                        </AlertDialogTitle>
                        <AlertDialogDescription>
                            This will permanently delete all audit log records older than <strong>{retentionDays} days</strong>. This operation cannot be reversed.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={purging}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={() => void handlePurgeNow()}
                            disabled={purging}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90 cursor-pointer"
                        >
                            {purging ? 'Purging...' : 'Confirm Purge'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
