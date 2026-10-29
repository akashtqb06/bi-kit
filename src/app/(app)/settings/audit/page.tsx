import React, { Suspense } from 'react';
import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollTextIcon } from 'lucide-react';
import { AuditLogTable } from '@src/components/settings/audit-log-table';

function AuditPageSkeleton() {
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
                <CardContent className="space-y-4">
                    <Skeleton className="h-20 w-full rounded-md" />
                    <Skeleton className="h-9 w-full max-w-sm" />
                    <Skeleton className="h-64 w-full rounded-md" />
                </CardContent>
            </Card>
        </div>
    );
}

async function AdminAuditContent() {
    await requireRole('admin', { next: '/settings/audit' });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <ScrollTextIcon className="size-5 text-muted-foreground" />
                        <CardTitle>System Audit Log</CardTitle>
                    </div>
                    <CardDescription>
                        Immutable record of platform authentication events, administrative changes, data source testing, and system exports.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <AuditLogTable />
                </CardContent>
            </Card>
        </div>
    );
}

export default function AdminAuditPage() {
    return (
        <Suspense fallback={<AuditPageSkeleton />}>
            <AdminAuditContent />
        </Suspense>
    );
}

