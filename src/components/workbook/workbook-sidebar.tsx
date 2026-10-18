"use client";

import React from "react";
import { usePathname } from "next/navigation";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { WorkbookSidebarSection } from "./workbook-sidebar-section";
import { WorkbookSidebarItem } from "./workbook-sidebar-item";
import { useWorkbookWorkspace } from "./workbook-context";

export function WorkbookSidebarSkeleton() {
  return (
    <aside className="w-64 border-r bg-sidebar shrink-0 flex flex-col h-full overflow-hidden select-none p-3 space-y-4">
      {/* Section 1: Queries */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-3.5 w-16" />
          <Skeleton className="size-4 rounded" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      </div>

      <Separator className="my-1" />

      {/* Section 2: Charts */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-3.5 w-14" />
          <Skeleton className="size-4 rounded" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-full rounded-md" />
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      </div>

      <Separator className="my-1" />

      {/* Section 3: Dashboards */}
      <div className="space-y-2">
        <div className="flex items-center justify-between px-1">
          <Skeleton className="h-3.5 w-20" />
          <Skeleton className="size-4 rounded" />
        </div>
        <div className="space-y-1.5">
          <Skeleton className="h-7 w-full rounded-md" />
        </div>
      </div>
    </aside>
  );
}

export function WorkbookSidebar() {
  const pathname = usePathname();
  const {
    workbookId,
    queries,
    charts,
    dashboards,
    loading,
    addQuery,
    renameQuery,
    duplicateQuery,
    deleteQuery,
    addChart,
    renameChart,
    duplicateChart,
    deleteChart,
    addDashboard,
    renameDashboard,
    duplicateDashboard,
    deleteDashboard,
  } = useWorkbookWorkspace();

  if (loading) {
    return <WorkbookSidebarSkeleton />;
  }

  return (
    <aside className="w-64 border-r bg-sidebar shrink-0 flex flex-col h-full overflow-hidden select-none">
      <ScrollArea className="flex-1 px-2 py-3">
        {/* Section 1: Queries */}
        <WorkbookSidebarSection
          title="Queries"
          onAdd={() => void addQuery()}
          count={queries.length}
          emptyText="No queries yet"
        >
          {queries.map((q) => {
            const href = `/workbooks/${workbookId}/query/${q.id}`;
            const isActive = pathname.startsWith(href);
            return (
              <WorkbookSidebarItem
                key={q.id}
                id={q.id}
                name={q.name}
                type="query"
                isActive={isActive}
                href={href}
                onRename={renameQuery}
                onDuplicate={duplicateQuery}
                onDelete={deleteQuery}
              />
            );
          })}
        </WorkbookSidebarSection>

        <Separator className="my-3" />

        {/* Section 2: Charts */}
        <WorkbookSidebarSection
          title="Charts"
          onAdd={() => void addChart()}
          count={charts.length}
          emptyText="No charts yet"
        >
          {charts.map((c) => {
            const href = `/workbooks/${workbookId}/chart/${c.id}`;
            const isActive = pathname.startsWith(href);
            return (
              <WorkbookSidebarItem
                key={c.id}
                id={c.id}
                name={c.name}
                type="chart"
                chartType={c.type}
                isActive={isActive}
                href={href}
                onRename={renameChart}
                onDuplicate={duplicateChart}
                onDelete={deleteChart}
              />
            );
          })}
        </WorkbookSidebarSection>

        <Separator className="my-3" />

        {/* Section 3: Dashboards */}
        <WorkbookSidebarSection
          title="Dashboards"
          onAdd={() => void addDashboard()}
          count={dashboards.length}
          emptyText="No dashboards yet"
        >
          {dashboards.map((d) => {
            const href = `/workbooks/${workbookId}/dashboard/${d.id}`;
            const isActive = pathname.startsWith(href);
            return (
              <WorkbookSidebarItem
                key={d.id}
                id={d.id}
                name={d.name}
                type="dashboard"
                isActive={isActive}
                href={href}
                onRename={renameDashboard}
                onDuplicate={duplicateDashboard}
                onDelete={deleteDashboard}
              />
            );
          })}
        </WorkbookSidebarSection>
      </ScrollArea>
    </aside>
  );
}

