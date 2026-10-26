"use client";

import React, { useState } from "react";
import { usePathname } from "next/navigation";
import {
  DndContext,
  DragOverlay,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
  type DragStartEvent,
  type DragEndEvent,
} from "@dnd-kit/core";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import { Card, CardTitle } from "@/components/ui/card";
import { ChartRenderer } from "@src/components/charts/chart-renderer";
import { exportChartPng } from "@src/lib/chart-actions";
import { toast } from "sonner";
import type { ChartPublic } from "@src/lib/charts/service";
import type { ChartConfigData, ChartType } from "@src/lib/schemas";
import type { QueryResultData } from "@src/components/query-builder/store";
import { WorkbookSidebarSection } from "./workbook-sidebar-section";
import { WorkbookSidebarFolder } from "./workbook-sidebar-folder";
import { WorkbookSidebarItem, renderItemIcon } from "./workbook-sidebar-item";
import { useWorkbookWorkspace } from "./workbook-context";
import { buildSidebarTree } from "./sidebar-tree";

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

interface ActiveDragItem {
  type: "query" | "chart" | "dashboard";
  id: string;
  name: string;
  chartType?: string;
  folderId?: string | null;
}

export function WorkbookSidebar() {
  const pathname = usePathname();
  const {
    workbookId,
    queries,
    charts,
    dashboards,
    folders,
    loading,
    expandedFolderIds,
    toggleFolder,
    addFolder,
    renameFolder,
    deleteFolder,
    moveItem,
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

  const [creatingFolderSection, setCreatingFolderSection] = useState<
    "query" | "chart" | "dashboard" | null
  >(null);
  const [activeDragItem, setActiveDragItem] = useState<ActiveDragItem | null>(null);

  interface HiddenChartExportData {
    chart: ChartPublic;
    queryResults: QueryResultData;
  }
  const [exportingChart, setExportingChart] = useState<HiddenChartExportData | null>(null);
  const hiddenExportRef = React.useRef<HTMLDivElement>(null);

  const handleDownloadChartPng = async (chartId: string, chartName: string) => {
    const toastId = toast.loading('Rendering chart...');
    try {
      const chartRes = await fetch(`/api/charts/${chartId}`);
      if (!chartRes.ok) throw new Error('Chart not found');
      const chartJson = await chartRes.json();
      const chart = chartJson.data as ChartPublic;
      if (!chart) throw new Error('Chart data missing');

      if (!chart.queryId) {
        toast.error('Chart has no data yet', { id: toastId });
        return;
      }

      const queryRes = await fetch(`/api/queries/${chart.queryId}`);
      if (!queryRes.ok) throw new Error('Query not found');
      const queryJson = await queryRes.json();
      const q = queryJson.data;

      const runRes = await fetch('/api/queries/run', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        cache: 'no-store',
        body: JSON.stringify({
          dataSourceId: q.dataSourceId,
          mode: q.mode,
          definition: q.definition,
          sql: q.sql,
        }),
      });
      if (!runRes.ok) throw new Error('Failed to run query');
      const runJson = await runRes.json();
      const queryResults = runJson.data as QueryResultData;

      if (!queryResults?.rows || queryResults.rows.length === 0) {
        toast.error('Chart has no data yet', { id: toastId });
        return;
      }

      setExportingChart({ chart, queryResults });

      // Wait for data and 2 animation frames
      await new Promise((resolve) => setTimeout(resolve, 60));
      if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

      if (hiddenExportRef.current) {
        toast.dismiss(toastId);
        await exportChartPng(hiddenExportRef.current, chart.name || chartName || 'chart');
      }
    } catch (err) {
      console.error('Failed to export chart PNG from sidebar', err);
      toast.error('Failed to export PNG', { id: toastId });
    } finally {
      setExportingChart(null);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor)
  );

  const handleDragStart = (event: DragStartEvent) => {
    const data = event.active.data.current as ActiveDragItem | undefined;
    if (data) {
      setActiveDragItem(data);
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveDragItem(null);
    if (!over) return;

    const activeData = active.data.current as ActiveDragItem | undefined;
    const overData = over.data.current as
      | {
          targetType: "folder" | "root";
          folderId: string | null;
          kind: "query" | "chart" | "dashboard";
        }
      | undefined;

    if (!activeData || !overData) return;

    // Don't allow dropping an item into a folder of a different kind
    if (activeData.type !== overData.kind) {
      return;
    }

    // If destination matches current folderId, no-op
    if ((activeData.folderId ?? null) === overData.folderId) {
      return;
    }

    void moveItem(activeData.type, activeData.id, overData.folderId);
  };

  const handleCreateFolderAndMove = async (
    type: "query" | "chart" | "dashboard",
    itemId: string
  ) => {
    try {
      const created = await addFolder(type);
      if (created) {
        await moveItem(type, itemId, created.id);
      }
    } catch {
      // Handled in addFolder/moveItem toast
    }
  };

  if (loading) {
    return <WorkbookSidebarSkeleton />;
  }

  // Group queries, charts, and dashboards by folders
  const queryFolders = folders.filter((f) => f.kind === "query");
  const chartFolders = folders.filter((f) => f.kind === "chart");
  const dashboardFolders = folders.filter((f) => f.kind === "dashboard");

  const queryTree = buildSidebarTree(queries, queryFolders);
  const chartTree = buildSidebarTree(charts, chartFolders);
  const dashboardTree = buildSidebarTree(dashboards, dashboardFolders);

  return (
    <DndContext
      sensors={sensors}
      onDragStart={handleDragStart}
      onDragEnd={handleDragEnd}
    >
      <aside className="w-64 border-r bg-sidebar shrink-0 flex flex-col h-full overflow-hidden select-none">
        <ScrollArea className="flex-1 px-2 py-3">
          {/* Section 1: Queries */}
          <WorkbookSidebarSection
            title="Queries"
            kind="query"
            onAdd={() => void addQuery()}
            onAddFolder={() => setCreatingFolderSection("query")}
            isCreatingFolder={creatingFolderSection === "query"}
            onSaveNewFolder={async (name) => {
              await addFolder("query", name);
              setCreatingFolderSection(null);
            }}
            onCancelNewFolder={() => setCreatingFolderSection(null)}
            existingFolderNames={queryFolders.map((f) => f.name)}
            count={queries.length + queryFolders.length}
            emptyText="No queries yet"
          >
            {/* Query Folders */}
            {queryTree.folders.map(({ folder, items }) => (
              <WorkbookSidebarFolder
                key={folder.id}
                folder={folder}
                kind="query"
                itemsCount={items.length}
                isExpanded={expandedFolderIds.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                onRename={(newName) => renameFolder(folder.id, newName)}
                onDelete={(mode) => deleteFolder(folder.id, mode)}
                onAddItem={() => void addQuery(folder.id)}
              >
                {items.map((q) => {
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
                      folderId={folder.id}
                      folders={queryFolders}
                      isIndented={true}
                      onRename={renameQuery}
                      onDuplicate={duplicateQuery}
                      onDelete={deleteQuery}
                      onMoveToFolder={(targetFolderId) => {
                        void moveItem("query", q.id, targetFolderId);
                      }}
                      onCreateFolderAndMove={() =>
                        handleCreateFolderAndMove("query", q.id)
                      }
                    />
                  );
                })}
              </WorkbookSidebarFolder>
            ))}

            {/* Root Queries */}
            {queryTree.rootItems.map((q) => {
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
                  folderId={null}
                  folders={queryFolders}
                  isIndented={false}
                  onRename={renameQuery}
                  onDuplicate={duplicateQuery}
                  onDelete={deleteQuery}
                  onMoveToFolder={(targetFolderId) => {
                    void moveItem("query", q.id, targetFolderId);
                  }}
                  onCreateFolderAndMove={() =>
                    handleCreateFolderAndMove("query", q.id)
                  }
                />
              );
            })}
          </WorkbookSidebarSection>

          <Separator className="my-3" />

          {/* Section 2: Charts */}
          <WorkbookSidebarSection
            title="Charts"
            kind="chart"
            onAdd={() => void addChart()}
            onAddFolder={() => setCreatingFolderSection("chart")}
            isCreatingFolder={creatingFolderSection === "chart"}
            onSaveNewFolder={async (name) => {
              await addFolder("chart", name);
              setCreatingFolderSection(null);
            }}
            onCancelNewFolder={() => setCreatingFolderSection(null)}
            existingFolderNames={chartFolders.map((f) => f.name)}
            count={charts.length + chartFolders.length}
            emptyText="No charts yet"
          >
            {/* Chart Folders */}
            {chartTree.folders.map(({ folder, items }) => (
              <WorkbookSidebarFolder
                key={folder.id}
                folder={folder}
                kind="chart"
                itemsCount={items.length}
                isExpanded={expandedFolderIds.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                onRename={(newName) => renameFolder(folder.id, newName)}
                onDelete={(mode) => deleteFolder(folder.id, mode)}
                onAddItem={() => void addChart(folder.id)}
              >
                {items.map((c) => {
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
                      folderId={folder.id}
                      folders={chartFolders}
                      isIndented={true}
                      onRename={renameChart}
                      onDuplicate={duplicateChart}
                      onDelete={deleteChart}
                      onMoveToFolder={(targetFolderId) => {
                        void moveItem("chart", c.id, targetFolderId);
                      }}
                      onCreateFolderAndMove={() =>
                        handleCreateFolderAndMove("chart", c.id)
                      }
                      onDownloadPng={handleDownloadChartPng}
                    />
                  );
                })}
              </WorkbookSidebarFolder>
            ))}

            {/* Root Charts */}
            {chartTree.rootItems.map((c) => {
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
                  folderId={null}
                  folders={chartFolders}
                  isIndented={false}
                  onRename={renameChart}
                  onDuplicate={duplicateChart}
                  onDelete={deleteChart}
                  onMoveToFolder={(targetFolderId) => {
                    void moveItem("chart", c.id, targetFolderId);
                  }}
                  onCreateFolderAndMove={() =>
                    handleCreateFolderAndMove("chart", c.id)
                  }
                  onDownloadPng={handleDownloadChartPng}
                />
              );
            })}
          </WorkbookSidebarSection>

          <Separator className="my-3" />

          {/* Section 3: Dashboards */}
          <WorkbookSidebarSection
            title="Dashboards"
            kind="dashboard"
            onAdd={() => void addDashboard()}
            onAddFolder={() => setCreatingFolderSection("dashboard")}
            isCreatingFolder={creatingFolderSection === "dashboard"}
            onSaveNewFolder={async (name) => {
              await addFolder("dashboard", name);
              setCreatingFolderSection(null);
            }}
            onCancelNewFolder={() => setCreatingFolderSection(null)}
            existingFolderNames={dashboardFolders.map((f) => f.name)}
            count={dashboards.length + dashboardFolders.length}
            emptyText="No dashboards yet"
          >
            {/* Dashboard Folders */}
            {dashboardTree.folders.map(({ folder, items }) => (
              <WorkbookSidebarFolder
                key={folder.id}
                folder={folder}
                kind="dashboard"
                itemsCount={items.length}
                isExpanded={expandedFolderIds.has(folder.id)}
                onToggle={() => toggleFolder(folder.id)}
                onRename={(newName) => renameFolder(folder.id, newName)}
                onDelete={(mode) => deleteFolder(folder.id, mode)}
                onAddItem={() => void addDashboard(folder.id)}
              >
                {items.map((d) => {
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
                      folderId={folder.id}
                      folders={dashboardFolders}
                      isIndented={true}
                      onRename={renameDashboard}
                      onDuplicate={duplicateDashboard}
                      onDelete={deleteDashboard}
                      onMoveToFolder={(targetFolderId) => {
                        void moveItem("dashboard", d.id, targetFolderId);
                      }}
                      onCreateFolderAndMove={() =>
                        handleCreateFolderAndMove("dashboard", d.id)
                      }
                    />
                  );
                })}
              </WorkbookSidebarFolder>
            ))}

            {/* Root Dashboards */}
            {dashboardTree.rootItems.map((d) => {
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
                  folderId={null}
                  folders={dashboardFolders}
                  isIndented={false}
                  onRename={renameDashboard}
                  onDuplicate={duplicateDashboard}
                  onDelete={deleteDashboard}
                  onMoveToFolder={(targetFolderId) => {
                    void moveItem("dashboard", d.id, targetFolderId);
                  }}
                  onCreateFolderAndMove={() =>
                    handleCreateFolderAndMove("dashboard", d.id)
                  }
                />
              );
            })}
          </WorkbookSidebarSection>
        </ScrollArea>
      </aside>

      {/* Floating Drag Overlay */}
      <DragOverlay dropAnimation={null}>
        {activeDragItem ? (
          <div className="flex items-center gap-2 rounded-md bg-card/95 px-2.5 py-1 text-xs shadow-lg ring-1 ring-border border select-none pointer-events-none">
            {renderItemIcon(activeDragItem.type, activeDragItem.chartType)}
            <span className="font-medium truncate max-w-[140px]">
              {activeDragItem.name}
            </span>
          </div>
        ) : null}
      </DragOverlay>

      {/* Hidden off-screen container for sidebar PNG export */}
      {exportingChart && (
        <div
          style={{
            position: 'absolute',
            left: '-10000px',
            top: 0,
            width: '900px',
            height: '520px',
            zIndex: -9999,
            pointerEvents: 'none',
          }}
        >
          <Card
            ref={hiddenExportRef}
            className="flex flex-col p-4 bg-card shadow-xs w-[900px] h-[520px]"
          >
            <div data-chart-header className="flex items-center justify-between pb-2 border-b shrink-0 chart-card-header">
              <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
                {(typeof exportingChart.chart.config?.title === 'string' && exportingChart.chart.config.title) || exportingChart.chart.name}
              </CardTitle>
            </div>
            <div className="flex-1 w-full min-h-0 min-w-0 mt-2 relative flex flex-col overflow-hidden">
              <ChartRenderer
                type={exportingChart.chart.type as ChartType}
                config={(exportingChart.chart.config || {}) as ChartConfigData}
                data={exportingChart.queryResults}
                className="h-full w-full min-h-0 min-w-0"
                showTitle={false}
              />
            </div>
          </Card>
        </div>
      )}
    </DndContext>
  );
}
