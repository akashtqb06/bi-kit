"use client";

import {
  Card,
  CardContent,
} from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  SearchCodeIcon,
  BarChart2Icon,
  LayoutDashboardIcon,
  MousePointerClickIcon,
} from "lucide-react";
import { QueryEditor } from "@src/components/query-builder";
import { ChartEditor } from "@src/components/charts";
import { DashboardEditor } from "@src/components/dashboards";

// ---------------------------------------------------------------------------
// Empty-panel — shown when nothing is selected
// ---------------------------------------------------------------------------

export function EditorEmptyState({ onSelectTab }: { onSelectTab?: (tab: string) => void }) {
  return (
    <div className="flex h-full items-center justify-center p-8">
      <Card className="max-w-sm w-full text-center">
        <CardContent className="flex flex-col items-center gap-4 py-10">
          <MousePointerClickIcon className="size-10 text-muted-foreground/40" />
          <div>
            <p className="font-medium">Select an item to open it</p>
            <p className="mt-1 text-sm text-muted-foreground">
              Choose a query, chart, or dashboard from the left panel, or create a new one.
            </p>
          </div>
          <div className="flex gap-2 flex-wrap justify-center">
            {onSelectTab && (
              <>
                <Button variant="outline" size="sm" onClick={() => onSelectTab("queries")}>
                  <SearchCodeIcon className="mr-1.5 size-3.5" />
                  Queries
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSelectTab("charts")}>
                  <BarChart2Icon className="mr-1.5 size-3.5" />
                  Charts
                </Button>
                <Button variant="outline" size="sm" onClick={() => onSelectTab("dashboards")}>
                  <LayoutDashboardIcon className="mr-1.5 size-3.5" />
                  Dashboards
                </Button>
              </>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Editor — the main panel content router
// ---------------------------------------------------------------------------

interface EditorPanelProps {
  type: "query" | "chart" | "dashboard" | null;
  id: string | null;
  workbookId: string;
  onSelectTab: (tab: string) => void;
}

export function EditorPanel({ type, id, workbookId, onSelectTab }: EditorPanelProps) {
  if (!type || !id) {
    return <EditorEmptyState onSelectTab={onSelectTab} />;
  }

  if (type === "query") {
    return <QueryEditor queryId={id} workbookId={workbookId} />;
  }

  if (type === "chart") {
    return <ChartEditor chartId={id} workbookId={workbookId} />;
  }

  if (type === "dashboard") {
    return <DashboardEditor dashboardId={id} workbookId={workbookId} />;
  }

  return <EditorEmptyState onSelectTab={onSelectTab} />;
}



