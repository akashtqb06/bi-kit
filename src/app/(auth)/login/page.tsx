import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { isRegistrationAllowed } from '@src/lib/auth/registration';
import { getCurrentUser } from '@src/lib/auth/dal';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

type LoginPageProps = {
    searchParams: Promise<{ next?: string | string[] }>;
};

async function LoginPageContent({ searchParams }: LoginPageProps) {
    const [user, params, allowRegistration] = await Promise.all([
        getCurrentUser(),
        searchParams,
        isRegistrationAllowed(),
    ]);
    if (user) redirect('/');
    const next = typeof params.next === 'string' ? params.next : '/';

    return <LoginForm next={next} allowRegistration={allowRegistration} />;
}

function LoginFormSkeleton() {
    return (
        <Card className="w-full max-w-sm">
            <CardHeader>
                <CardTitle>Welcome back</CardTitle>
                <CardDescription>Sign in to continue to BI Kit.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
                <div className="space-y-2">
                    <Skeleton className="h-4 w-12" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <div className="space-y-2">
                    <Skeleton className="h-4 w-16" />
                    <Skeleton className="h-9 w-full" />
                </div>
                <Skeleton className="h-9 w-full" />
            </CardContent>
        </Card>
    );
}

export default function LoginPage(props: LoginPageProps) {
    return (
        <Suspense fallback={<LoginFormSkeleton />}>
            <LoginPageContent {...props} />
        </Suspense>
    );
}
