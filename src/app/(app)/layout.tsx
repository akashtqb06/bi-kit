import React, { Suspense } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@src/components/layout/app-sidebar';
import { AppHeader } from '@src/components/layout/app-header';
import { UserProvider } from '@src/components/auth/user-provider';
import { requireUser } from '@src/lib/auth/dal';
import { Skeleton } from '@/components/ui/skeleton';
import { checkDatabaseHealth } from '@src/lib/db/health';
import { DatabaseErrorPage } from '@src/components/db/database-error-page';
import { isRedirectError } from 'next/dist/client/components/redirect-error';
import type { SafeUser } from '@src/lib/auth/types';

function AppShellSkeleton() {
    return (
        <div className="flex h-dvh min-h-dvh w-full overflow-hidden bg-background">
            {/* Sidebar skeleton matching AppSidebar dimensions */}
            <aside className="w-64 shrink-0 border-r bg-sidebar flex flex-col h-full p-3 select-none">
                <div className="flex items-center gap-2.5 px-2 py-2">
                    <Skeleton className="size-8 rounded-lg" />
                    <Skeleton className="h-5 w-24" />
                </div>
                <div className="space-y-1 pt-3 flex-1">
                    {Array.from({ length: 5 }).map((_, i) => (
                        <div key={i} className="flex items-center gap-3 px-2 py-2">
                            <Skeleton className="size-4 rounded" />
                            <Skeleton className="h-4 w-24" />
                        </div>
                    ))}
                </div>
                <div className="border-t pt-3 flex items-center gap-2.5 px-2">
                    <Skeleton className="size-8 rounded-full" />
                    <div className="space-y-1.5 flex-1">
                        <Skeleton className="h-3.5 w-24" />
                        <Skeleton className="h-2.5 w-32" />
                    </div>
                </div>
            </aside>

            {/* Inset matching SidebarInset dimensions */}
            <div className="flex flex-1 flex-col min-h-0 h-full overflow-hidden">
                {/* Header skeleton matching AppHeader (h-14) */}
                <header className="flex h-14 shrink-0 items-center justify-between border-b px-4 bg-background">
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-7 rounded" />
                        <Skeleton className="h-4 w-32" />
                    </div>
                    <div className="flex items-center gap-2">
                        <Skeleton className="size-7 rounded" />
                        <Skeleton className="size-7 rounded" />
                    </div>
                </header>
                <main className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden" />
            </div>
        </div>
    );
}

async function AuthenticatedShell({ children }: { children: React.ReactNode }) {
    // Startup / health check: treat database failure as 503 error page, not as logged out
    const health = await checkDatabaseHealth();
    if (!health.ok) {
        return <DatabaseErrorPage health={health} />;
    }

    let user: SafeUser;
    try {
        user = await requireUser();
    } catch (err) {
        if (isRedirectError(err)) {
            throw err;
        }
        console.error('[AuthenticatedShell DB Error]', err);
        return <DatabaseErrorPage error={err} />;
    }

    return (
        <UserProvider user={user}>
            <SidebarProvider>
                <AppSidebar />
                <SidebarInset className="flex flex-col min-h-0 min-w-0 h-dvh overflow-hidden">
                    <AppHeader />
                    <main className="flex flex-1 flex-col min-h-0 min-w-0 overflow-hidden">{children}</main>
                </SidebarInset>
            </SidebarProvider>
        </UserProvider>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<AppShellSkeleton />}>
            <AuthenticatedShell>{children}</AuthenticatedShell>
        </Suspense>
    );
}

