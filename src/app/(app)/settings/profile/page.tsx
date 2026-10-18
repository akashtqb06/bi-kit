import React, { Suspense } from 'react';
import { requireUser } from '@src/lib/auth/dal';
import { getUserActivityCounts } from '@src/lib/auth/user-service';
import { ProfileForm } from '@src/components/settings/profile-form';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

export function ProfileSkeleton() {
    return (
        <div className="space-y-6">
            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-40" />
                    <Skeleton className="h-4 w-72" />
                </CardHeader>
                <CardContent className="space-y-6">
                    <div className="flex items-center gap-4">
                        <Skeleton className="size-20 rounded-full" />
                        <div className="space-y-2">
                            <Skeleton className="h-8 w-28" />
                            <Skeleton className="h-3.5 w-48" />
                        </div>
                    </div>
                    <div className="grid gap-4 sm:grid-cols-2">
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                        <div className="space-y-2">
                            <Skeleton className="h-4 w-16" />
                            <Skeleton className="h-9 w-full" />
                        </div>
                    </div>
                    <Skeleton className="h-9 w-24" />
                </CardContent>
            </Card>

            <Card>
                <CardHeader className="space-y-2">
                    <Skeleton className="h-6 w-32" />
                    <Skeleton className="h-4 w-56" />
                </CardHeader>
                <CardContent>
                    <div className="grid gap-4 sm:grid-cols-3">
                        <Skeleton className="h-24 w-full rounded-lg" />
                        <Skeleton className="h-24 w-full rounded-lg" />
                        <Skeleton className="h-24 w-full rounded-lg" />
                    </div>
                </CardContent>
            </Card>
        </div>
    );
}

async function SettingsProfileContent() {
    const user = await requireUser('/settings/profile');
    const activity = await getUserActivityCounts(user.id);

    return <ProfileForm user={user} activity={activity} />;
}

export default function SettingsProfilePage() {
    return (
        <Suspense fallback={<ProfileSkeleton />}>
            <SettingsProfileContent />
        </Suspense>
    );
}

