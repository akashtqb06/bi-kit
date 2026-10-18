import { Suspense } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import { RegisterForm } from './register-form';
import { getCurrentUser } from '@src/lib/auth/dal';
import { isRegistrationAllowed } from '@src/lib/auth/registration';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

import { Skeleton } from '@/components/ui/skeleton';

type RegisterPageProps = {
    searchParams: Promise<{ next?: string | string[] }>;
};

async function RegisterPageContent({ searchParams }: RegisterPageProps) {
    const [user, params, allowRegistration] = await Promise.all([
        getCurrentUser(),
        searchParams,
        isRegistrationAllowed(),
    ]);
    if (user) redirect('/');
    const next = typeof params.next === 'string' ? params.next : '/';

    if (!allowRegistration) {
        return (
            <Card className="w-full max-w-sm">
                <CardHeader>
                    <CardTitle>Registration is closed</CardTitle>
                    <CardDescription>New accounts are not being accepted right now.</CardDescription>
                </CardHeader>
                <CardContent>
                    <Button className="w-full" nativeButton={false} render={<Link href="/login" />}>
                        Go to sign in
                    </Button>
                </CardContent>
            </Card>
        );
    }

    return <RegisterForm next={next} />;
}

function RegisterFormSkeleton() {
    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Create your account</CardTitle>
                <CardDescription>Start organizing your data and dashboards.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-28" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <Skeleton className="h-9 w-full" />
            </CardContent>
        </Card>
    );
}

export default function RegisterPage(props: RegisterPageProps) {
    return (
        <Suspense fallback={<RegisterFormSkeleton />}>
            <RegisterPageContent {...props} />
        </Suspense>
    );
}
