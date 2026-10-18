'use client';

import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
import {
    LaptopIcon,
    SmartphoneIcon,
    GlobeIcon,
    Loader2Icon,
    LogOutIcon,
    ShieldCheckIcon,
} from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
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
    AlertDialogTrigger,
} from '@/components/ui/alert-dialog';
import { revokeOtherSessionsAction, revokeSessionAction } from '@src/lib/auth/settings-actions';
import type { ListedSession } from '@src/lib/auth/types';
import { formatDistanceToNow, format } from 'date-fns';

export function parseUserAgent(ua: string | null | undefined): string {
    if (!ua) return 'Unknown device';

    let browser = 'Browser';
    if (/edg/i.test(ua)) browser = 'Edge';
    else if (/chrome|crios/i.test(ua)) browser = 'Chrome';
    else if (/firefox|fxios/i.test(ua)) browser = 'Firefox';
    else if (/safari/i.test(ua)) browser = 'Safari';
    else if (/opera|opr/i.test(ua)) browser = 'Opera';

    let os = 'Unknown OS';
    if (/iphone|ipad|ipod/i.test(ua)) os = 'iOS';
    else if (/macintosh|mac os x/i.test(ua)) os = 'macOS';
    else if (/windows|win32/i.test(ua)) os = 'Windows';
    else if (/android/i.test(ua)) os = 'Android';
    else if (/linux/i.test(ua)) os = 'Linux';

    return `${browser} on ${os}`;
}

function getDeviceIcon(ua: string | null | undefined) {
    if (!ua) return GlobeIcon;
    if (/iphone|ipad|ipod|android/i.test(ua)) return SmartphoneIcon;
    return LaptopIcon;
}

function formatDate(date: Date | string | null): string {
    if (!date) return '—';
    try {
        return format(new Date(date), 'MMM d, yyyy');
    } catch {
        return '—';
    }
}

function formatRelative(date: Date | string | null): string {
    if (!date) return 'Just now';
    try {
        return formatDistanceToNow(new Date(date), { addSuffix: true });
    } catch {
        return 'Recently';
    }
}

interface SessionsViewProps {
    sessions: ListedSession[];
    currentSessionId: string | null;
}

export function SessionsView({ sessions, currentSessionId }: SessionsViewProps) {
    const router = useRouter();
    const [revokingId, setRevokingId] = useState<string | null>(null);
    const [isPending, startTransition] = useTransition();

    const otherSessionsCount = sessions.filter((s) => s.id !== currentSessionId).length;

    const handleRevokeSingle = (sessionId: string) => {
        setRevokingId(sessionId);
        startTransition(async () => {
            const res = await revokeSessionAction(sessionId);
            setRevokingId(null);
            if (res.ok) {
                toast.success('Session revoked');
                router.refresh();
            } else {
                toast.error(res.formError || 'Failed to revoke session');
            }
        });
    };

    const handleRevokeOthers = () => {
        startTransition(async () => {
            const res = await revokeOtherSessionsAction();
            if (res.ok) {
                toast.success('Signed out of all other devices');
                router.refresh();
            } else {
                toast.error(res.formError || 'Failed to revoke other sessions');
            }
        });
    };

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div>
                        <div className="flex items-center gap-2">
                            <ShieldCheckIcon className="size-5 text-muted-foreground" />
                            <CardTitle>Active Sessions</CardTitle>
                        </div>
                        <CardDescription>
                            Devices currently authenticated to your account.
                        </CardDescription>
                    </div>

                    <AlertDialog>
                        <AlertDialogTrigger render={
                            <Button
                                variant="outline"
                                size="sm"
                                disabled={otherSessionsCount === 0 || isPending}
                                className="shrink-0"
                            >
                                <LogOutIcon className="mr-2 size-4" />
                                Sign out of all other devices
                            </Button>
                        } />
                        <AlertDialogContent>
                            <AlertDialogHeader>
                                <AlertDialogTitle>Sign out of all other devices?</AlertDialogTitle>
                                <AlertDialogDescription>
                                    This will revoke all active sessions ({otherSessionsCount}) except the one you are currently using. You will need to sign back in on any other devices.
                                </AlertDialogDescription>
                            </AlertDialogHeader>
                            <AlertDialogFooter>
                                <AlertDialogCancel>Cancel</AlertDialogCancel>
                                <AlertDialogAction onClick={handleRevokeOthers}>
                                    Sign out other devices
                                </AlertDialogAction>
                            </AlertDialogFooter>
                        </AlertDialogContent>
                    </AlertDialog>
                </CardHeader>
                <CardContent className="p-0">
                    <Table>
                        <TableHeader>
                            <TableRow>
                                <TableHead className="w-[30%]">Device</TableHead>
                                <TableHead>IP Address</TableHead>
                                <TableHead>Created</TableHead>
                                <TableHead>Last Active</TableHead>
                                <TableHead className="text-right">Status</TableHead>
                            </TableRow>
                        </TableHeader>
                        <TableBody>
                            {sessions.map((session) => {
                                const isCurrent = session.id === currentSessionId;
                                const DeviceIcon = getDeviceIcon(session.userAgent);
                                const deviceName = parseUserAgent(session.userAgent);
                                const isRevokingThis = revokingId === session.id;

                                return (
                                    <TableRow key={session.id}>
                                        <TableCell className="font-medium">
                                            <div className="flex items-center gap-2.5">
                                                <DeviceIcon className="size-4 text-muted-foreground shrink-0" />
                                                <span className="truncate max-w-[180px] sm:max-w-[240px]">
                                                    {deviceName}
                                                </span>
                                            </div>
                                        </TableCell>
                                        <TableCell className="font-mono text-xs text-muted-foreground">
                                            {session.ipAddress || '—'}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatDate(session.createdAt)}
                                        </TableCell>
                                        <TableCell className="text-muted-foreground text-xs">
                                            {formatRelative(session.lastUsedAt)}
                                        </TableCell>
                                        <TableCell className="text-right">
                                            {isCurrent ? (
                                                <Badge variant="secondary" className="font-normal text-xs">
                                                    This device
                                                </Badge>
                                            ) : (
                                                <Button
                                                    variant="outline"
                                                    size="sm"
                                                    disabled={isRevokingThis || isPending}
                                                    onClick={() => handleRevokeSingle(session.id)}
                                                    className="h-7 text-xs"
                                                >
                                                    {isRevokingThis && <Loader2Icon className="mr-1.5 size-3 animate-spin" />}
                                                    Revoke
                                                </Button>
                                            )}
                                        </TableCell>
                                    </TableRow>
                                );
                            })}
                        </TableBody>
                    </Table>
                </CardContent>
            </Card>
        </div>
    );
}
