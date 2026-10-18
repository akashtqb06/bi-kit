import React, { Suspense } from 'react';
import { WorkbookProvider } from '@src/components/workbook/workbook-context';
import { WorkbookHeader } from '@src/components/workbook/workbook-header';
import { WorkbookSidebar, WorkbookSidebarSkeleton } from '@src/components/workbook/workbook-sidebar';
import { Skeleton } from '@/components/ui/skeleton';

interface WorkbookLayoutProps {
    children: React.ReactNode;
    params: Promise<{ wid: string }>;
}

export function WorkbookShellSkeleton() {
    return (
        <div className="flex h-dvh flex-col overflow-hidden bg-background">
            {/* Header skeleton */}
            <header className="h-12 border-b bg-background flex items-center justify-between px-3 shrink-0 select-none">
                <div className="flex items-center gap-1.5">
                    <Skeleton className="size-8 rounded-lg" />
                    <div className="flex items-center gap-1.5 pl-1">
                        <Skeleton className="size-4 rounded" />
                        <Skeleton className="h-4 w-12 hidden sm:inline-block" />
                    </div>
                </div>
                <Skeleton className="h-5 w-40" />
                <div className="flex items-center gap-1">
                    <Skeleton className="size-8 rounded-lg" />
                    <Skeleton className="size-8 rounded-lg" />
                </div>
            </header>

            {/* Main container: Left Sidebar + Center Panel + Right Panel */}
            <div className="flex flex-1 min-h-0 overflow-hidden">
                {/* Left Sidebar (three sections) */}
                <WorkbookSidebarSkeleton />

                {/* Center Panel */}
                <main className="flex flex-1 min-h-0 overflow-hidden bg-background" />

                {/* Right Panel */}
                <aside className="w-72 border-l bg-background shrink-0 flex flex-col h-full overflow-hidden">
                    <div className="h-10 border-b px-3 flex items-center justify-between shrink-0 bg-muted/20">
                        <Skeleton className="h-3 w-20" />
                    </div>
                    <div className="p-3.5 space-y-4">
                        <Skeleton className="h-16 w-full rounded-lg" />
                        <Skeleton className="h-24 w-full rounded-lg" />
                        <Skeleton className="h-32 w-full rounded-lg" />
                    </div>
                </aside>
            </div>
        </div>
    );
}
import { notFound } from 'next/navigation';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { workbooks } from '@src/lib/db/schema';
import { UserProvider } from '@src/components/auth/user-provider';
import { requireUser, can } from '@src/lib/auth/dal';

async function WorkbookLayoutContent({ children, params }: WorkbookLayoutProps) {
    const { wid } = await params;
    const user = await requireUser(`/workbooks/${wid}`);
    const wb = db.select().from(workbooks).where(eq(workbooks.id, wid)).get();
    if (!wb || !can(user, 'view', { type: 'workbook', id: wid, ownerId: wb.ownerId })) {
        notFound();
    }

    return (
        <UserProvider user={user}>
            <WorkbookProvider workbookId={wid}>
                <div className="flex h-dvh flex-col overflow-hidden bg-background">
                    <Suspense fallback={<header className="h-12 border-b bg-background shrink-0" />}>
                        <WorkbookHeader />
                    </Suspense>
                    <div className="flex flex-1 min-h-0 overflow-hidden">
                        <Suspense fallback={<WorkbookSidebarSkeleton />}>
                            <WorkbookSidebar />
                        </Suspense>
                        <main className="flex flex-1 min-h-0 overflow-hidden">{children}</main>
                    </div>
                </div>
            </WorkbookProvider>
        </UserProvider>
    );
}

export default function WorkbookLayout({ children, params }: WorkbookLayoutProps) {
    return (
        <Suspense fallback={<WorkbookShellSkeleton />}>
            <WorkbookLayoutContent params={params}>{children}</WorkbookLayoutContent>
        </Suspense>
    );
}
