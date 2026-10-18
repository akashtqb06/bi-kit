"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { AlertCircleIcon, RefreshCwIcon } from "lucide-react";
import { toast } from "sonner";
import { useQueryEditorStore } from "./store";
import { CenterArea } from "./center-area";
import { RightPanel } from "./right-panel";
import type { QueryPublic } from "@src/lib/queries/service";
import type { DataSourcePublic } from "@src/lib/data-sources/service";

interface QueryEditorProps {
  queryId: string;
  workbookId: string;
  onQueryUpdated?: (query: QueryPublic) => void;
}

export function QueryEditor({ queryId }: QueryEditorProps) {
  const [loadedQueryId, setLoadedQueryId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const loading = loadedQueryId !== queryId && !error;

  const lastExecutedRef = useRef<{ id: string; hash: string } | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const {
    init,
    mode,
    queryName,
    dataSources,
    dataSourceId,
    definition,
    sql,
    isDirty,
    saveQuery,
    runQuery,
  } = useQueryEditorStore();

  // Load query and data sources on queryId change, and auto-execute on landing
  useEffect(() => {
    let cancelled = false;

    Promise.all([fetch(`/api/queries/${queryId}`), fetch("/api/data-sources")])
      .then(async ([queryResponse, dataSourcesResponse]) => {
        const [qRes, dsRes] = await Promise.all([
          queryResponse.json() as Promise<{ data?: QueryPublic; error?: string }>,
          dataSourcesResponse.json() as Promise<{
            data?: DataSourcePublic[];
            error?: string;
          }>,
        ]);
        if (cancelled) return;
        if (!queryResponse.ok || !dataSourcesResponse.ok || !qRes.data || !dsRes.data) {
          const message = qRes.error || dsRes.error || "Query not found";
          setError(message);
          setLoadedQueryId(queryId);
          toast.error("Unable to load query", { description: message });
          return;
        }

        const queryData = qRes.data;
        await init(queryData, dsRes.data || []);
        if (cancelled) return;

        setError(null);
        setLoadedQueryId(queryId);

        // Auto-run on land if valid source and operations
        const defHash = `${queryData.dataSourceId || ""}:${queryData.mode}:${queryData.definition || ""}:${queryData.sql || ""}`;
        const last = lastExecutedRef.current;
        const isSame = last && last.id === queryId && last.hash === defHash;

        const hasValidSource = Boolean(queryData.dataSourceId);
        let hasValidOperations = false;
        if (queryData.mode === "sql") {
          hasValidOperations = Boolean(queryData.sql?.trim());
        } else {
          try {
            const parsed = JSON.parse(queryData.definition);
            hasValidOperations = Boolean(parsed?.source?.table);
          } catch {
            hasValidOperations = false;
          }
        }

        if (!isSame && hasValidSource && hasValidOperations) {
          if (abortControllerRef.current) {
            abortControllerRef.current.abort();
          }
          const controller = new AbortController();
          abortControllerRef.current = controller;
          lastExecutedRef.current = { id: queryId, hash: defHash };
          void runQuery(undefined, true, controller.signal);
        }
      })
      .catch((err) => {
        if (!cancelled) {
          const message = err instanceof Error ? err.message : "Failed to load query";
          setError(message);
          setLoadedQueryId(queryId);
          toast.error("Unable to load query", { description: message });
        }
      });

    return () => {
      cancelled = true;
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
    };
  }, [queryId, init, runQuery, loadAttempt]);

  const autosaveTimerRef = useRef<NodeJS.Timeout | null>(null);
  const autoRunTimerRef = useRef<NodeJS.Timeout | null>(null);

  // Autosave when dirty (debounced 1s)
  useEffect(() => {
    if (!isDirty) return;

    if (autosaveTimerRef.current) {
      clearTimeout(autosaveTimerRef.current);
    }

    autosaveTimerRef.current = setTimeout(() => {
      void saveQuery();
    }, 1000);

    return () => {
      if (autosaveTimerRef.current) {
        clearTimeout(autosaveTimerRef.current);
      }
    };
  }, [isDirty, queryName, dataSourceId, mode, definition, sql, saveQuery]);

  // Re-run automatically (debounced 400ms) after the user edits operations
  useEffect(() => {
    if (loadedQueryId !== queryId || mode !== "builder") return;

    const currentDefHash = `${dataSourceId || ""}:${mode}:${JSON.stringify(definition) || ""}`;
    const last = lastExecutedRef.current;
    if (last && last.id === queryId && last.hash === currentDefHash) {
      return;
    }

    const hasValidSource = Boolean(dataSourceId);
    const hasValidOperations = Boolean(definition?.source?.table);

    if (!hasValidSource || !hasValidOperations) return;

    if (autoRunTimerRef.current) {
      clearTimeout(autoRunTimerRef.current);
    }

    autoRunTimerRef.current = setTimeout(() => {
      if (abortControllerRef.current) {
        abortControllerRef.current.abort();
      }
      const controller = new AbortController();
      abortControllerRef.current = controller;
      lastExecutedRef.current = { id: queryId, hash: currentDefHash };
      void runQuery(undefined, true, controller.signal);
    }, 400);

    return () => {
      if (autoRunTimerRef.current) {
        clearTimeout(autoRunTimerRef.current);
      }
    };
  }, [loadedQueryId, queryId, dataSourceId, mode, definition, runQuery]);

  // Global Run shortcut (Cmd/Ctrl + Enter)
  useEffect(() => {
    const handleGlobalKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
        e.preventDefault();
        void runQuery();
      }
    };

    window.addEventListener("keydown", handleGlobalKeyDown);
    return () => window.removeEventListener("keydown", handleGlobalKeyDown);
  }, [runQuery]);

  if (loading) {
    return (
      <div className="flex flex-col h-full p-6 space-y-4 bg-background">
        <div className="flex items-center justify-between">
          <Skeleton className="h-8 w-64" />
          <div className="flex items-center gap-2">
            <Skeleton className="h-8 w-24" />
            <Skeleton className="h-8 w-20" />
          </div>
        </div>
        <Skeleton className="flex-1 w-full rounded-xl" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-8 max-w-lg mx-auto">
        <Alert variant="destructive">
          <AlertCircleIcon className="size-4" />
          <AlertTitle>Error Loading Query</AlertTitle>
          <AlertDescription className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs">
            <span>{error}</span>
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                setError(null);
                setLoadedQueryId(null);
                setLoadAttempt((attempt) => attempt + 1);
              }}
            >
              <RefreshCwIcon className="mr-2 size-3.5" /> Retry
            </Button>
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  return (
    <div className="flex flex-col flex-1 min-h-0 min-w-0 w-full h-full overflow-hidden bg-background">
      {dataSources.length === 0 && (
        <div
          role="status"
          className="flex items-center gap-2 border-b px-4 py-2 text-xs text-muted-foreground bg-muted/20 shrink-0"
        >
          <AlertCircleIcon className="size-3.5 shrink-0" />
          <span>No data sources are available.</span>
          <Link
            href="/data-sources"
            className="font-medium text-foreground underline underline-offset-4"
          >
            Add a data source
          </Link>
        </div>
      )}

      {/* Main Frappe Insights Query View Layout: Center Area + Right Panel */}
      <div className="flex flex-1 min-h-0 min-w-0 w-full overflow-hidden">
        {/* Center: Status bar row + Results grid + Footer bar */}
        <CenterArea />

        {/* Right Panel: Details + Operations */}
        <RightPanel />
      </div>
    </div>
  );
}
