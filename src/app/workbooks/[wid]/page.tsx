import React, { Suspense } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkbookIndexClient } from "./workbook-index-client";

interface WorkbookIndexPageProps {
  params: Promise<{ wid: string }>;
}

function WorkbookIndexSkeleton() {
  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <div className="space-y-3 w-72">
        <Skeleton className="h-6 w-40" />
        <Skeleton className="h-24 w-full rounded-lg" />
      </div>
    </div>
  );
}

async function WorkbookIndexPageContent({ params }: WorkbookIndexPageProps) {
  const { wid } = await params;
  return <WorkbookIndexClient workbookId={wid} />;
}

export default function WorkbookIndexPage({ params }: WorkbookIndexPageProps) {
  return (
    <Suspense fallback={<WorkbookIndexSkeleton />}>
      <WorkbookIndexPageContent params={params} />
    </Suspense>
  );
}
