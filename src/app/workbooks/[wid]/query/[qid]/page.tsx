import React, { Suspense } from "react";
import { QueryEditor } from "@src/components/query-builder";
import { Skeleton } from "@/components/ui/skeleton";

interface QueryPageProps {
  params: Promise<{ wid: string; qid: string }>;
}

function QueryEditorSkeleton() {
  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden bg-background">
      <div className="flex-1 min-h-0 min-w-0 overflow-hidden flex flex-col">
        {/* Status / query header bar skeleton */}
        <div className="flex items-center justify-between border-b px-4 py-2.5 shrink-0 bg-card">
          <div className="flex items-center gap-3">
            <Skeleton className="h-6 w-36" />
            <Skeleton className="h-6 w-32" />
          </div>
          <div className="flex items-center gap-2">
            <Skeleton className="h-7 w-20" />
            <Skeleton className="h-7 w-16" />
          </div>
        </div>

        {/* Results table skeleton */}
        <div className="flex-1 min-h-0 flex flex-col p-4 overflow-hidden space-y-3">
          <div className="flex items-center justify-between pb-2 border-b">
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-7 w-24" />
          </div>
          {/* Table header row */}
          <div className="grid grid-cols-4 gap-4 py-2.5 border-b bg-muted/30 px-3 rounded-t-md">
            <Skeleton className="h-4 w-20" />
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-4 w-16" />
            <Skeleton className="h-4 w-20" />
          </div>
          {/* Table data rows */}
          <div className="space-y-2 px-3">
            {Array.from({ length: 7 }).map((_, i) => (
              <div
                key={i}
                className="grid grid-cols-4 gap-4 py-2 border-b border-muted/50"
              >
                <Skeleton className="h-3.5 w-full" />
                <Skeleton className="h-3.5 w-3/4" />
                <Skeleton className="h-3.5 w-1/2" />
                <Skeleton className="h-3.5 w-2/3" />
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Query Right Panel skeleton */}
      <aside className="w-80 border-l bg-background shrink-0 flex flex-col h-full overflow-y-auto">
        <div className="h-10 border-b px-3 flex items-center justify-between shrink-0 bg-muted/20">
          <Skeleton className="h-3 w-24" />
        </div>
        <div className="p-3.5 space-y-4">
          <Skeleton className="h-16 w-full rounded-lg" />
          <Skeleton className="h-24 w-full rounded-lg" />
          <Skeleton className="h-32 w-full rounded-lg" />
        </div>
      </aside>
    </div>
  );
}

async function QueryPageContent({ params }: QueryPageProps) {
  const { wid, qid } = await params;

  return (
    <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
      <QueryEditor queryId={qid} workbookId={wid} />
    </div>
  );
}

export default function WorkbookQueryPage({ params }: QueryPageProps) {
  return (
    <Suspense fallback={<QueryEditorSkeleton />}>
      <QueryPageContent params={params} />
    </Suspense>
  );
}
