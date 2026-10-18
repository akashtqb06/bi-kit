import React, { Suspense } from 'react';
import { requireUser } from '@src/lib/auth/dal';
import { getSession, listSessions } from '@src/lib/auth/session';
import { SessionsView } from '@src/components/settings/sessions-view';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function SessionsSkeleton() {
    return (
        <Card>
            <CardHeader className="space-y-2">
                <div className="flex items-center justify-between">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-8 w-44" />
                </div>
                <Skeleton className="h-4 w-80" />
            </CardHeader>
            <CardContent className="space-y-4">
                {Array.from({ length: 3 }).map((_, i) => (
                    <div key={i} className="flex items-center justify-between p-3 border rounded-lg">
                        <div className="flex items-center gap-3">
                            <Skeleton className="size-8 rounded" />
                            <div className="space-y-1.5">
                                <Skeleton className="h-4 w-32" />
                                <Skeleton className="h-3 w-48" />
                            </div>
                        </div>
                        <Skeleton className="h-8 w-20" />
                    </div>
                ))}
            </CardContent>
        </Card>
    );
}

async function SettingsSessionsContent() {
    const user = await requireUser('/settings/sessions');
    const sessionCtx = await getSession();
    const userSessions = await listSessions(user.id);

    const currentId = sessionCtx?.session.id ?? null;

    // Sort: current session first, then descending by lastUsedAt
    userSessions.sort((a, b) => {
        if (a.id === currentId) return -1;
        if (b.id === currentId) return 1;
        return new Date(b.lastUsedAt).getTime() - new Date(a.lastUsedAt).getTime();
    });

    return <SessionsView sessions={userSessions} currentSessionId={currentId} />;
}

export default function SettingsSessionsPage() {
    return (
        <Suspense fallback={<SessionsSkeleton />}>
            <SettingsSessionsContent />
        </Suspense>
    );
}

