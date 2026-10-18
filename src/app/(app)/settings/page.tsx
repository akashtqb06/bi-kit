import { Suspense } from 'react';
import { redirect } from 'next/navigation';

function RedirectToProfile(): null {
    redirect('/settings/profile');
}

export default function SettingsIndexPage() {
    return (
        <Suspense fallback={null}>
            <RedirectToProfile />
        </Suspense>
    );
}
