import React, { Suspense } from 'react';
import { requireUser } from '@src/lib/auth/dal';
import { countActiveAdmins } from '@src/lib/auth/user-service';
import { SecurityForm } from '@src/components/settings/security-form';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

function SecuritySkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-36" />
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="space-y-4">
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-28" />
                        <Skeleton className="h-9 w-full max-w-md" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-24" />
                        <Skeleton className="h-9 w-full max-w-md" />
                    </div>
                    <div className="space-y-2">
                        <Skeleton className="h-4 w-32" />
                        <Skeleton className="h-9 w-full max-w-md" />
                    </div>
                    <Skeleton className="h-9 w-32" />
                </CardContent>
            </Card>

            <Card className="border-destructive/30">
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-28" />
                    <Skeleton className="h-4 w-80" />
                </CardHeader>
                <CardContent>
                    <Skeleton className="h-9 w-32" />
                </CardContent>
            </Card>
        </div>
    );
}

async function SettingsSecurityContent() {
    const user = await requireUser('/settings/security');
    const adminCount = await countActiveAdmins();
    const isLastAdmin = user.role === 'admin' && adminCount <= 1;

    return <SecurityForm user={user} isLastAdmin={isLastAdmin} />;
}

export default function SettingsSecurityPage() {
    return (
        <Suspense fallback={<SecuritySkeleton />}>
            <SettingsSecurityContent />
        </Suspense>
    );
}

