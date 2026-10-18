"use client";

import React, { useEffect } from "react";
import { useRouter } from "next/navigation";
import { useWorkbookWorkspace } from "@src/components/workbook/workbook-context";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { PlusIcon, BookOpenIcon } from "lucide-react";

interface WorkbookIndexClientProps {
  workbookId: string;
}

export function WorkbookIndexClient({ workbookId: propWid }: WorkbookIndexClientProps) {
  const router = useRouter();
  const { workbookId: ctxWid, queries, charts, dashboards, loading, addQuery } =
    useWorkbookWorkspace();
  const workbookId = propWid || ctxWid;

  useEffect(() => {
    if (loading) return;

    if (queries.length > 0) {
      router.replace(`/workbooks/${workbookId}/query/${queries[0].id}`);
    } else if (charts.length > 0) {
      router.replace(`/workbooks/${workbookId}/chart/${charts[0].id}`);
    } else if (dashboards.length > 0) {
      router.replace(`/workbooks/${workbookId}/dashboard/${dashboards[0].id}`);
    }
  }, [loading, queries, charts, dashboards, router, workbookId]);

  if (loading) {
    return (
      <div className="flex flex-1 items-center justify-center p-8">
        <div className="space-y-3 w-72">
          <Skeleton className="h-6 w-40" />
          <Skeleton className="h-24 w-full rounded-lg" />
        </div>
      </div>
    );
  }

  // If there are existing items, the effect above will redirect.
  // If completely empty, render empty state:
  if (queries.length === 0 && charts.length === 0 && dashboards.length === 0) {
    return (
      <div className="flex flex-1 items-center justify-center p-6 bg-muted/5">
        <Card className="max-w-md w-full text-center border-dashed">
          <CardContent className="flex flex-col items-center gap-3 py-10">
            <div className="flex size-12 items-center justify-center rounded-full bg-muted">
              <BookOpenIcon className="size-6 text-muted-foreground" />
            </div>
            <div>
              <h3 className="text-base font-semibold">Empty Workbook</h3>
              <p className="mt-1 text-xs text-muted-foreground max-w-xs">
                This workbook has no queries, charts, or dashboards yet. Create your first query to begin exploring your data.
              </p>
            </div>
            <Button size="sm" onClick={() => void addQuery()} className="mt-2">
              <PlusIcon className="mr-1.5 size-3.5" />
              New Query
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="flex flex-1 items-center justify-center p-8">
      <Skeleton className="h-8 w-48" />
    </div>
  );
}

