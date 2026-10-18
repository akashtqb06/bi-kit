"use client";

import React, { useEffect, useState, useMemo } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  PlayIcon,
  MoreHorizontalIcon,
  Code2Icon,
  CopyIcon,
  DownloadIcon,
  Trash2Icon,
  Loader2Icon,
  CheckIcon,
  BarChart2Icon,
  SlidersHorizontalIcon,
} from "lucide-react";
import { toast } from "sonner";
import { defaultChartConfig } from "@src/lib/schemas";
import { useQueryEditorStore } from "../store";

export function StatusBar() {
  const router = useRouter();
  const {
    queryId,
    workbookId,
    results,
    isRunning,
    runError,
    lastRunAt,
    compiledSql,
    sql,
    mode,
    queryName,
    runQuery,
    clearResults,
    dataSourceId,
    switchToSqlMode,
    switchToBuilderMode,
  } = useQueryEditorStore();

  const [tick, setTick] = useState(0);
  const [sqlDialogOpen, setSqlDialogOpen] = useState(false);
  const [sqlCopied, setSqlCopied] = useState(false);
  const [confirmBuilderOpen, setConfirmBuilderOpen] = useState(false);
  const [isCreatingChart, setIsCreatingChart] = useState(false);

  // Timer to update relative time
  useEffect(() => {
    if (!lastRunAt) return;
    const interval = setInterval(() => {
      setTick((t) => t + 1);
    }, 2000);
    return () => clearInterval(interval);
  }, [lastRunAt]);

  const relativeTime = useMemo(() => {
    if (!lastRunAt) return "";
    // eslint-disable-next-line @typescript-eslint/no-unused-expressions
    tick; // depend on tick
    // eslint-disable-next-line react-hooks/purity
    const diffSec = Math.max(0, Math.floor((Date.now() - lastRunAt.getTime()) / 1000));
    if (diffSec < 10) return "just now";
    if (diffSec < 60) return `${diffSec}s ago`;
    const diffMin = Math.floor(diffSec / 60);
    if (diffMin < 60) return `${diffMin}m ago`;
    const diffHour = Math.floor(diffMin / 60);
    return `${diffHour}h ago`;
  }, [lastRunAt, tick]);

  const displaySql = useMemo(() => {
    return (mode === "builder" ? compiledSql : sql) || "-- No SQL generated";
  }, [mode, compiledSql, sql]);

  const handleCopySql = () => {
    if (!displaySql) return;
    navigator.clipboard.writeText(displaySql);
    setSqlCopied(true);
    toast.success("SQL copied to clipboard");
    setTimeout(() => setSqlCopied(false), 2000);
  };

  const handleExportCsv = () => {
    if (!results || results.rows.length === 0) {
      toast.error("No results to export");
      return;
    }

    const headers = results.columns.map((c) => `"${c.name.replace(/"/g, '""')}"`).join(",");
    const rows = results.rows.map((row) =>
      row
        .map((val) => {
          if (val === null || val === undefined) return "";
          const str = String(val);
          return `"${str.replace(/"/g, '""')}"`;
        })
        .join(",")
    );

    const csvContent = [headers, ...rows].join("\n");
    const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `${queryName || "query-results"}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success("CSV exported successfully");
  };

  const handleCreateChart = async () => {
    if (!queryId) return;
    setIsCreatingChart(true);
    try {
      const res = await fetch("/api/charts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          queryId,
          name: `${queryName || "New"} Chart`,
          type: "bar",
          config: defaultChartConfig,
        }),
      });
      const json = (await res.json()) as { data?: { id: string }; error?: string };
      if (!res.ok || !json.data) throw new Error(json.error || "Failed to create chart");

      toast.success("Chart created from query");
      router.push(`/workbooks/${workbookId}/chart/${json.data.id}`);
    } catch (err) {
      toast.error("Failed to create chart", {
        description: err instanceof Error ? err.message : undefined,
      });
    } finally {
      setIsCreatingChart(false);
    }
  };

  const handleModeToggle = (vals: string[]) => {
    if (!vals || vals.length === 0) return;
    const selected = vals[vals.length - 1];
    if (selected === mode) return;

    if (selected === "builder") {
      setConfirmBuilderOpen(true);
    } else if (selected === "sql") {
      void switchToSqlMode();
    }
  };

  return (
    <>
      <div className="flex items-center justify-between px-4 py-2 bg-background border-b shrink-0 text-xs select-none gap-3">
        {/* Left: Status Indicator */}
        <div className="flex items-center gap-2 min-w-0">
          {isRunning ? (
            <div className="flex items-center gap-2">
              <Loader2Icon className="size-3.5 animate-spin text-primary" />
              <span className="text-muted-foreground text-xs">Executing query...</span>
            </div>
          ) : runError ? (
            <div className="flex items-center gap-2 min-w-0">
              <span className="size-2 rounded-full bg-rose-500 shrink-0" />
              <span
                className="text-rose-500 text-xs truncate max-w-sm md:max-w-md font-medium"
                title={runError}
              >
                {runError}
              </span>
            </div>
          ) : results && lastRunAt ? (
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
              <span className="text-muted-foreground text-xs font-normal">
                Fetched in {(results.durationMs / 1000).toFixed(3)}s {relativeTime}
              </span>
            </div>
          ) : (
            <div className="flex items-center gap-2">
              <span className="size-2 rounded-full bg-amber-500 shrink-0" />
              <span className="text-muted-foreground text-xs">Not executed</span>
            </div>
          )}
        </div>

        {/* Center: Mode ToggleGroup "Builder | SQL" */}
        <div className="flex items-center justify-center shrink-0">
          <ToggleGroup
            value={[mode]}
            onValueChange={handleModeToggle}
            className="border rounded-md p-0.5 bg-muted/40"
            size="sm"
          >
            <ToggleGroupItem
              value="builder"
              className="h-6 px-2.5 text-xs font-medium gap-1.5 data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
            >
              <SlidersHorizontalIcon className="size-3" />
              Builder
            </ToggleGroupItem>
            <ToggleGroupItem
              value="sql"
              className="h-6 px-2.5 text-xs font-medium gap-1.5 data-pressed:bg-background data-pressed:text-foreground data-pressed:shadow-xs"
            >
              <Code2Icon className="size-3" />
              SQL
            </ToggleGroupItem>
          </ToggleGroup>
        </div>

        {/* Right: Execute Button & "..." Dropdown Menu */}
        <div className="flex items-center gap-2 shrink-0">
          <Button
            variant="outline"
            size="sm"
            onClick={() => void runQuery()}
            disabled={isRunning || !dataSourceId}
            className="h-8 gap-1.5 text-xs font-medium px-3 shadow-xs"
          >
            {isRunning ? (
              <Loader2Icon className="size-3.5 animate-spin" />
            ) : (
              <PlayIcon className="size-3.5 fill-current" />
            )}
            <span>Execute</span>
            <kbd className="hidden md:inline-flex ml-1 items-center rounded bg-muted px-1 py-0.5 text-[9px] font-mono text-muted-foreground">
              ⌘↵
            </kbd>
          </Button>

          <DropdownMenu>
            <DropdownMenuTrigger
              render={
                <Button
                  variant="outline"
                  size="icon"
                  className="size-8 text-muted-foreground hover:text-foreground"
                />
              }
            >
              <MoreHorizontalIcon className="size-4" />
              <span className="sr-only">More query options</span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-52">
              <DropdownMenuItem
                onClick={() => void runQuery()}
                disabled={isRunning || !dataSourceId}
              >
                <PlayIcon className="mr-2 size-3.5 text-muted-foreground" />
                Run Query
                <kbd className="ml-auto text-[9px] font-mono text-muted-foreground">⌘↵</kbd>
              </DropdownMenuItem>

              <DropdownMenuItem
                onClick={() => void handleCreateChart()}
                disabled={isCreatingChart || !queryId}
              >
                <BarChart2Icon className="mr-2 size-3.5 text-muted-foreground" />
                Create Chart from Query
              </DropdownMenuItem>

              {mode === "builder" ? (
                <DropdownMenuItem onClick={() => void switchToSqlMode()}>
                  <Code2Icon className="mr-2 size-3.5 text-muted-foreground" />
                  Switch to SQL Mode
                </DropdownMenuItem>
              ) : (
                <DropdownMenuItem onClick={() => setConfirmBuilderOpen(true)}>
                  <SlidersHorizontalIcon className="mr-2 size-3.5 text-muted-foreground" />
                  Switch to Builder Mode
                </DropdownMenuItem>
              )}

              <DropdownMenuSeparator />

              <DropdownMenuItem onClick={() => setSqlDialogOpen(true)}>
                <Code2Icon className="mr-2 size-3.5 text-muted-foreground" />
                View SQL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleCopySql}>
                <CopyIcon className="mr-2 size-3.5 text-muted-foreground" />
                Copy SQL
              </DropdownMenuItem>
              <DropdownMenuItem onClick={handleExportCsv} disabled={!results}>
                <DownloadIcon className="mr-2 size-3.5 text-muted-foreground" />
                Export CSV
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                onClick={clearResults}
                disabled={!results && !runError}
                variant="destructive"
              >
                <Trash2Icon className="mr-2 size-3.5" />
                Clear results
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </div>

      {/* SQL Confirmation Dialog when switching from SQL to Builder */}
      <AlertDialog open={confirmBuilderOpen} onOpenChange={setConfirmBuilderOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Return to Builder Mode</AlertDialogTitle>
            <AlertDialogDescription>
              SQL changes will be lost, return to the last builder definition?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel
              onClick={() => {
                setConfirmBuilderOpen(false);
              }}
            >
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                setConfirmBuilderOpen(false);
                await switchToBuilderMode();
              }}
            >
              Return to Builder
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* SQL View Dialog */}
      <Dialog open={sqlDialogOpen} onOpenChange={setSqlDialogOpen}>
        <DialogContent className="sm:max-w-xl">
          <DialogHeader>
            <DialogTitle>Generated SQL</DialogTitle>
            <DialogDescription>
              The parameterized SQL query compiled from your operations.
            </DialogDescription>
          </DialogHeader>

          <div className="relative mt-2">
            <pre className="text-xs p-3.5 font-mono bg-muted/60 rounded-lg overflow-x-auto select-text whitespace-pre-wrap leading-relaxed text-foreground border max-h-96">
              {displaySql}
            </pre>
          </div>

          <div className="flex items-center justify-between pt-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySql}
              className="h-8 text-xs gap-1.5"
            >
              {sqlCopied ? (
                <CheckIcon className="size-3.5 text-emerald-500" />
              ) : (
                <CopyIcon className="size-3.5" />
              )}
              {sqlCopied ? "Copied" : "Copy SQL"}
            </Button>
            <Button
              size="sm"
              onClick={() => setSqlDialogOpen(false)}
              className="h-8 text-xs"
            >
              Close
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
