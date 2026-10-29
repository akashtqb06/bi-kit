import React, { Suspense } from 'react';
import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { RolesMatrix } from '@src/components/settings/roles-matrix';

function RolesPageSkeleton() {
    return (
        <div className="space-y-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Card>
                    <CardHeader className="space-y-2">
                        <Skeleton className="h-6 w-36" />
                        <Skeleton className="h-4 w-72" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                </Card>
                <Card>
                    <CardHeader className="space-y-2">
                        <Skeleton className="h-6 w-36" />
                        <Skeleton className="h-4 w-72" />
                    </CardHeader>
                    <CardContent className="space-y-2">
                        <Skeleton className="h-4 w-full" />
                        <Skeleton className="h-4 w-3/4" />
                    </CardContent>
                </Card>
            </div>

            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-48" />
                    <Skeleton className="h-4 w-96" />
                </CardHeader>
                <CardContent className="space-y-3">
                    <Skeleton className="h-48 w-full" />
                </CardContent>
            </Card>
        </div>
    );
}

async function AdminRolesContent() {
    await requireRole('admin', { next: '/settings/roles' });

    return (
        <div className="space-y-6">
            <RolesMatrix />
        </div>
    );
}

export default function AdminRolesPage() {
    return (
        <Suspense fallback={<RolesPageSkeleton />}>
            <AdminRolesContent />
        </Suspense>
    );
}
