import { Suspense } from 'react';
import { redirect } from 'next/navigation';
import { LoginForm } from './login-form';
import { isRegistrationAllowed } from '@src/lib/auth/registration';
import { getCurrentUser } from '@src/lib/auth/dal';
import { Card, CardContent } from '@/components/ui/card';

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

function LoginFallback() {
    return (
        <Card className="w-full max-w-sm">
            <CardContent className="h-48" />
        </Card>
    );
}

export default function LoginPage(props: LoginPageProps) {
    return (
        <Suspense fallback={<LoginFallback />}>
            <LoginPageContent {...props} />
        </Suspense>
    );
}
