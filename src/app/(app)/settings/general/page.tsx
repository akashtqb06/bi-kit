import React, { Suspense } from 'react';
import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Settings2Icon } from 'lucide-react';

function GeneralPageSkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-5 rounded" />
                        <Skeleton className="h-6 w-36" />
                    </div>
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center space-y-3">
                    <Skeleton className="size-16 rounded-full" />
                    <Skeleton className="h-5 w-28" />
                    <Skeleton className="h-4 w-64" />
                </CardContent>
            </Card>
        </div>
    );
}

async function AdminGeneralContent() {
    await requireRole('admin', { next: '/settings/general' });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <Settings2Icon className="size-5 text-muted-foreground" />
                        <CardTitle>General Settings</CardTitle>
                    </div>
                    <CardDescription>
                        Global system configuration, workspace settings, and platform preferences.
                    </CardDescription>
                </CardHeader>
                <CardContent className="flex flex-col items-center justify-center py-12 text-center">
                    <div className="rounded-full bg-muted p-4 mb-3">
                        <Settings2Icon className="size-8 text-muted-foreground" />
                    </div>
                    <h3 className="text-base font-medium">Coming soon</h3>
                    <p className="text-sm text-muted-foreground max-w-sm mt-1">
                        Instance configuration, database connection pools, registration controls, and audit logs are coming soon.
                    </p>
                </CardContent>
            </Card>
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
