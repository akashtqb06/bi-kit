import React from 'react';
import { requireUser } from '@src/lib/auth/dal';
import { SettingsNav } from '@src/components/settings/settings-nav';

export default async function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    const user = await requireUser('/settings');
    const isAdmin = user.role === 'admin';

    return (
        <div className="flex flex-1 flex-col min-h-0 h-full overflow-hidden">
            {/* Fixed header */}
            <div className="shrink-0 border-b bg-background px-6 py-4">
                <h1 className="text-xl font-semibold tracking-tight">Settings</h1>
                <p className="text-sm text-muted-foreground">
                    Manage your account settings, security preferences, and appearance.
                </p>
            </div>

            {/* Single scroll area */}
            <div className="flex-1 min-h-0 overflow-y-auto p-6">
                <div className="flex flex-col md:flex-row gap-8 max-w-5xl">
                    <SettingsNav isAdmin={isAdmin} />
                    <main className="flex-1 min-w-0 max-w-3xl pb-12">
                        {children}
                    </main>
                </div>
            </div>
        </div>
    );
}
