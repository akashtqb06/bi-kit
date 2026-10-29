import React, { Suspense } from "react";
import { DashboardEditor } from "@src/components/dashboards/dashboard-editor";
import { Skeleton } from "@/components/ui/skeleton";

interface DashboardPageProps {
  params: Promise<{ wid: string; did: string }>;
}

function DashboardEditorSkeleton() {
  return (
    <div className="flex flex-1 flex-col min-h-0 min-w-0 w-full overflow-hidden bg-background">
      {/* Top: Filter bar & dashboard header skeleton */}
      <div className="flex items-center justify-between px-6 py-3 border-b bg-card shrink-0">
        <div className="flex items-center gap-3">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-6 w-24" />
        </div>
        <div className="flex items-center gap-2">
          <Skeleton className="h-8 w-28" />
          <Skeleton className="h-8 w-20" />
        </div>
      </div>

      {/* Dashboard grid skeleton (2x2 tiles) */}
      <div className="flex-1 p-6 overflow-y-auto">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="h-64 rounded-xl border bg-card p-4 space-y-3"
            >
              <div className="flex items-center justify-between">
                <Skeleton className="h-4 w-32" />
                <Skeleton className="size-6 rounded" />
              </div>
              <Skeleton className="h-44 w-full rounded-lg" />
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@src/lib/db";
import { dashboards } from "@src/lib/db/schema";

async function DashboardPageContent({ params }: DashboardPageProps) {
  const { wid, did } = await params;
  const [dashboard] = await db.select().from(dashboards).where(eq(dashboards.id, did)).limit(1);
  if (!dashboard || dashboard.workbookId !== wid) {
    notFound();
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      <DashboardEditor dashboardId={did} workbookId={wid} />
    </div>
  );
}

export default function WorkbookDashboardPage({
  params,
}: DashboardPageProps) {
  return (
    <Suspense fallback={<DashboardEditorSkeleton />}>
      <DashboardPageContent params={params} />
    </Suspense>
  );
}
