import React, { Suspense } from 'react';
import { requireRole } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { UsersIcon } from 'lucide-react';
import { UsersAdminTable } from '@src/components/settings/users-admin-table';

function AdminPageSkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-5 rounded" />
                        <Skeleton className="h-6 w-32" />
                    </div>
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="flex justify-between items-center">
                        <Skeleton className="h-9 w-64" />
                        <Skeleton className="h-9 w-28" />
                    </div>
                    <Skeleton className="h-64 w-full rounded-md" />
                </CardContent>
            </Card>
        </div>
    );
}

async function AdminUsersContent() {
    await requireRole('admin', { next: '/settings/users' });

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <div className="flex items-center gap-2">
                        <UsersIcon className="size-5 text-muted-foreground" />
                        <CardTitle>Users Administration</CardTitle>
                    </div>
                    <CardDescription>
                        Manage workspace accounts, invite team members, adjust roles, reset passwords, and revoke sessions.
                    </CardDescription>
                </CardHeader>
                <CardContent>
                    <UsersAdminTable />
                </CardContent>
            </Card>
        </div>
    );
}

export default function AdminUsersPage() {
    return (
        <Suspense fallback={<AdminPageSkeleton />}>
            <AdminUsersContent />
        </Suspense>
    );
}
