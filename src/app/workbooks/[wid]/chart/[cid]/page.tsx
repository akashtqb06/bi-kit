import React, { Suspense } from "react";
import { ChartEditor } from "@src/components/charts/chart-editor";
import { Skeleton } from "@/components/ui/skeleton";

interface ChartPageProps {
  params: Promise<{ wid: string; cid: string }>;
}

function ChartEditorSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden bg-background">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col p-6 space-y-6">
        {/* Top: Chart title & actions header */}
        <div className="flex items-center justify-between pb-3 border-b">
          <div className="space-y-1.5">
            <Skeleton className="h-6 w-48" />
            <Skeleton className="h-3.5 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-20" />
            <Skeleton className="h-8 w-24" />
          </div>
        </div>

        {/* Chart canvas preview */}
        <div className="flex-1 min-h-64 rounded-xl border bg-card/40 p-6 flex flex-col justify-end">
          <div className="flex items-end justify-between gap-4 h-48 px-8">
            <Skeleton className="h-32 w-12 rounded-t-md" />
            <Skeleton className="h-44 w-12 rounded-t-md" />
            <Skeleton className="h-28 w-12 rounded-t-md" />
            <Skeleton className="h-36 w-12 rounded-t-md" />
            <Skeleton className="h-48 w-12 rounded-t-md" />
            <Skeleton className="h-20 w-12 rounded-t-md" />
            <Skeleton className="h-40 w-12 rounded-t-md" />
          </div>
        </div>

        {/* Underlying data table skeleton */}
        <div className="h-44 rounded-xl border bg-card/30 p-4 space-y-2.5">
          <div className="flex items-center justify-between pb-2 border-b">
            <Skeleton className="h-4 w-28" />
            <Skeleton className="h-4 w-16" />
          </div>
          <div className="grid grid-cols-4 gap-4 py-1.5 border-b bg-muted/20 px-2 rounded">
            <Skeleton className="h-3.5 w-20" />
            <Skeleton className="h-3.5 w-24" />
            <Skeleton className="h-3.5 w-16" />
            <Skeleton className="h-3.5 w-20" />
          </div>
          <div className="space-y-2 px-2">
            <Skeleton className="h-3.5 w-full" />
            <Skeleton className="h-3.5 w-full" />
          </div>
        </div>
      </div>

      {/* Chart Right Panel skeleton */}
      <aside className="w-80 border-l bg-background shrink-0 flex flex-col h-full overflow-hidden">
        <div className="h-10 border-b px-3 flex items-center justify-between shrink-0 bg-muted/20">
          <Skeleton className="h-3 w-28" />
        </div>
        <div className="p-3.5 space-y-4">
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-36 w-full rounded-lg" />
          <Skeleton className="h-20 w-full rounded-lg" />
        </div>
      </aside>
    </div>
  );
}

import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@src/lib/db";
import { charts } from "@src/lib/db/schema";

async function ChartPageContent({ params }: ChartPageProps) {
  const { wid, cid } = await params;
  const chart = db.select().from(charts).where(eq(charts.id, cid)).get();
  if (!chart || chart.workbookId !== wid) {
    notFound();
  }

  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      <ChartEditor key={cid} chartId={cid} workbookId={wid} />
    </div>
  );
}

export default function WorkbookChartPage({ params }: ChartPageProps) {
  return (
    <Suspense fallback={<ChartEditorSkeleton />}>
      <ChartPageContent params={params} />
    </Suspense>
  );
}
