import React, { Suspense } from 'react';
import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { BackupStatusCard } from '@src/components/settings/backup-status-card';
import { GeneralSettingsForm } from '@src/components/settings/general-settings-form';

function GeneralPageSkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-20 w-full rounded-md" />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-96" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <Skeleton className="h-10 w-full max-w-md" />
                    <Skeleton className="h-10 w-full max-w-xs" />
                </CardContent>
            </Card>
        </div>
    );
}

async function AdminGeneralContent() {
    await requireRole('admin', { next: '/settings/general' });

    return (
        <div className="space-y-6">
            <BackupStatusCard />
            <GeneralSettingsForm />
        </div>
    );
}

export default function AdminGeneralPage() {
    return (
        <Suspense fallback={<GeneralPageSkeleton />}>
            <AdminGeneralContent />
        </Suspense>
    );
}
