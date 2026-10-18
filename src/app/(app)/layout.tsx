import React, { Suspense } from 'react';
import { SidebarProvider, SidebarInset } from '@/components/ui/sidebar';
import { AppSidebar } from '@src/components/layout/app-sidebar';
import { AppHeader } from '@src/components/layout/app-header';
import { UserProvider } from '@src/components/auth/user-provider';
import { requireUser } from '@src/lib/auth/dal';

async function ProtectedApp({ children }: { children: React.ReactNode }) {
    const user = await requireUser();

    return (
        <UserProvider user={user}>
            <SidebarProvider>
                <Suspense fallback={<div className="w-[--sidebar-width] shrink-0 bg-sidebar" />}>
                    <AppSidebar />
                </Suspense>
                <SidebarInset className="flex flex-col min-h-0 h-dvh overflow-hidden">
                    <Suspense fallback={<header className="flex h-14 shrink-0 items-center border-b px-4" />}>
                        <AppHeader />
                    </Suspense>
                    <main className="flex flex-1 flex-col min-h-0 overflow-hidden">{children}</main>
                </SidebarInset>
            </SidebarProvider>
        </UserProvider>
    );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
    return (
        <Suspense fallback={<div className="min-h-dvh bg-background" />}>
            <ProtectedApp>{children}</ProtectedApp>
        </Suspense>
    );
}
