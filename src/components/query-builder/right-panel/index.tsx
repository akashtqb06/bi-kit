"use client";

import React, { useMemo, useState, useRef, useEffect } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  closestCenter,
  KeyboardSensor,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  sortableKeyboardCoordinates,
  verticalListSortingStrategy,
} from "@dnd-kit/sortable";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
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
import { Switch } from "@/components/ui/switch";
import { formatDistanceToNow } from "date-fns";
import {
  DatabaseIcon,
  ChevronDownIcon,
  TableIcon,
  ColumnsIcon,
  ClockIcon,
  CheckCircle2Icon,
  BarChart2Icon,
  Code2Icon,
  SlidersHorizontalIcon,
  Loader2Icon,
  LayersIcon,
  FileSpreadsheetIcon,
  HardDriveIcon,
  RefreshCwIcon,
} from "lucide-react";
import { toast } from "sonner";
import { defaultChartConfig } from "@src/lib/schemas";
import { cn } from "@/lib/utils";
import { useQueryEditorStore, cleanDefinitionForCompile } from "../store";
import { getAvailableColumnsForStep } from "@src/lib/query-engine/infer-columns";
import { getDialect } from "@src/lib/connectors/dialects";
import { AddOperationPopover, type OperationType } from "./add-operation-popover";
import { OperationRow } from "./operation-row";

export function RightPanel() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const titleInputRef = useRef<HTMLInputElement>(null);
  const {
    queryId,
    workbookId,
    queryName,
    setQueryName,
    dataSourceId,
    setDataSourceId,
    dataSources,
    definition,
    schema,
    isLoadingSchema,
    mode,
    results,
    isDirty,
    lastSavedAt,
    setSourceTable,
    addStep,
    updateStep,
    removeStep,
    reorderSteps,
    insertSqlText,
    switchToSqlMode,
    switchToBuilderMode,
  } = useQueryEditorStore();

  useEffect(() => {
    if (searchParams?.get("focus") === "title") {
      const timer = setTimeout(() => {
        if (titleInputRef.current) {
          titleInputRef.current.focus();
          titleInputRef.current.select();
        }
      }, 150);
      return () => clearTimeout(timer);
    }
  }, [searchParams]);

  const [execInfoOpen, setExecInfoOpen] = useState(true);
  const [columnsOpen, setColumnsOpen] = useState(true);
  const [openTables, setOpenTables] = useState<Record<string, boolean>>({});
  const [isCreatingChart, setIsCreatingChart] = useState(false);
  const [switchGuardOpen, setSwitchGuardOpen] = useState(false);
  const [pendingSourceId, setPendingSourceId] = useState<string | null>(null);

  const [storeTable, setStoreTable] = useState<{
    id: string;
    status: string;
    storeTable: string;
    lastSyncedAt: string | null;
  } | null>(null);
  const [isTogglingStore, setIsTogglingStore] = useState(false);
  const [disableStoreDialogOpen, setDisableStoreDialogOpen] = useState(false);

  useEffect(() => {
    if (!queryId) return;
    let mounted = true;
    fetch(`/api/data-store/query/${queryId}`)
      .then((res) => res.json())
      .then((json) => {
        if (mounted && json.data) {
          setStoreTable(json.data);
        } else if (mounted) {
          setStoreTable(null);
        }
      })
      .catch(() => {});
    return () => {
      mounted = false;
    };
  }, [queryId]);

  const handleEnableDataStore = async () => {
    if (!queryId) return;
    setIsTogglingStore(true);
    try {
      const res = await fetch(`/api/data-store/query/${queryId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to enable Data Store");
      setStoreTable(json.data);
      toast.success("Data Store enabled. Query result materialized.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to enable Data Store");
    } finally {
      setIsTogglingStore(false);
    }
  };

  const handleDisableDataStore = async () => {
    if (!queryId) return;
    setIsTogglingStore(true);
    try {
      const res = await fetch(`/api/data-store/query/${queryId}`, { method: "DELETE" });
      if (!res.ok) throw new Error("Failed to disable Data Store");
      setStoreTable(null);
      setDisableStoreDialogOpen(false);
      toast.success("Data Store disabled. Materialized table dropped.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to disable Data Store");
    } finally {
      setIsTogglingStore(false);
    }
  };

  const handleRefreshDataStore = async () => {
    if (!queryId) return;
    setIsTogglingStore(true);
    try {
      const res = await fetch(`/api/data-store/query/${queryId}`, { method: "POST" });
      const json = await res.json();
      if (!res.ok) throw new Error(json.error?.message || "Failed to refresh Data Store");
      setStoreTable(json.data);
      toast.success("Data Store table refreshed.");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to refresh Data Store");
    } finally {
      setIsTogglingStore(false);
    }
  };

  const activeDs = useMemo(() => {
    return dataSources.find((d) => d.id === dataSourceId);
  }, [dataSources, dataSourceId]);

  const activeDialect = useMemo(() => {
    return getDialect(activeDs?.type);
  }, [activeDs]);

  const groupedDataSources = useMemo(() => {
    const databases = dataSources.filter(
      (d) => d.type === "postgres" || d.type === "postgresql" || d.type === "mysql" || d.type === "mssql"
    );
    const nosql = dataSources.filter((d) => d.type === "mongodb");
    const files = dataSources.filter(
      (d) => d.type === "sqlite" || d.type === "csv" || d.type === "excel"
    );
    const datastore = dataSources.filter((d) => d.type === "datastore");
    return { databases, nosql, files, datastore };
  }, [dataSources]);

  const executeDataSourceSwitch = async (targetId: string) => {
    await setDataSourceId(targetId);
    const updatedSchema = useQueryEditorStore.getState().schema;
    const currentDef = useQueryEditorStore.getState().definition;
    if (currentDef.source.table && updatedSchema) {
      const exists = updatedSchema.tables.some(
        (t) => t.name.toLowerCase() === currentDef.source.table.toLowerCase()
      );
      if (!exists) {
        toast.warning(
          `Table "${currentDef.source.table}" was not found in the new data source. Please select a valid table.`
        );
      }
    }
  };

  const handleDataSourceSelect = (targetId: string | null) => {
    if (!targetId || targetId === dataSourceId) return;
    if (mode === "sql" || mode === "pipeline") {
      setPendingSourceId(targetId);
      setSwitchGuardOpen(true);
    } else {
      void executeDataSourceSwitch(targetId);
    }
  };

  const sensors = useSensors(
    useSensor(PointerSensor, {
      activationConstraint: {
        distance: 5,
      },
    }),
    useSensor(KeyboardSensor, {
      coordinateGetter: sortableKeyboardCoordinates,
    })
  );

  const hasSource = Boolean(definition.source.table);
  const cleanDef = useMemo(() => cleanDefinitionForCompile(definition), [definition]);

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (over && active.id !== over.id) {
      const oldIndex = definition.steps.findIndex((s) => s._id === active.id);
      const newIndex = definition.steps.findIndex((s) => s._id === over.id);
      if (oldIndex !== -1 && newIndex !== -1) {
        reorderSteps(oldIndex, newIndex);
      }
    }
  };

  const handleSelectOperation = (type: OperationType) => {
    if (type === "source") {
      if (!dataSourceId) {
        toast.info("Please select a data source first.");
        return;
      }
      const firstTable = schema?.tables[0]?.name || "";
      if (firstTable) {
        setSourceTable(firstTable);
      } else {
        toast.info("No tables found in this data source.");
      }
      return;
    }

    if (
      type === "select" ||
      type === "filter" ||
      type === "join" ||
      type === "mutate" ||
      type === "convert" ||
      type === "summarize"
    ) {
      addStep(type);
    }
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

  const toggleTable = (tableName: string) => {
    setOpenTables((prev) => ({
      ...prev,
      [tableName]: !prev[tableName],
    }));
  };

  // Build list of non-source steps in REVERSE order (newest on top)
  const reversedSteps = useMemo(() => {
    return definition.steps
      .map((step, originalIndex) => ({
        step,
        originalIndex,
      }))
      .reverse();
  }, [definition.steps]);

  // Available columns for source
  const sourceColumns = useMemo(() => {
    if (!schema || !definition.source.table) return [];
    const tbl = schema.tables.find(
      (t) => t.name.toLowerCase() === definition.source.table.toLowerCase()
    );
    return tbl?.columns || [];
  }, [schema, definition.source.table]);

  const dataSourceItems = useMemo(() => {
    return dataSources.map((d) => ({
      value: d.id,
      label: d.name,
    }));
  }, [dataSources]);

  return (
    <div className="w-80 shrink-0 border-l bg-background flex flex-col h-full overflow-y-auto select-none">
      {/* 1. Section: Details (Query Title, Data Source Select) */}
      <div className="p-3 border-b space-y-3 shrink-0 bg-card/40">
        <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Details
        </h3>

        <div className="space-y-2.5">
          {/* Query Title */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Query Title
            </label>
            <Input
              ref={titleInputRef}
              value={queryName}
              onChange={(e) => setQueryName(e.target.value)}
              placeholder="Untitled query"
              className="h-8 text-xs font-medium bg-background"
            />
          </div>

          {/* Data Source Select */}
          <div className="space-y-1">
            <label className="text-[11px] font-medium text-muted-foreground">
              Data Source
            </label>
            {dataSources.length === 0 ? (
              <Skeleton className="h-8 w-full" />
            ) : (
              <Select
                value={dataSourceId}
                onValueChange={(val) => handleDataSourceSelect(val)}
                items={dataSourceItems}
              >
                <SelectTrigger className="h-8 text-xs bg-background w-full">
                  <SelectValue
                    placeholder="Select data source..."
                    notFoundText="Unknown source"
                  />
                </SelectTrigger>
                <SelectContent>
                  {groupedDataSources.databases.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider px-2 py-1">
                        Databases
                      </SelectLabel>
                      {groupedDataSources.databases.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id} className="text-xs">
                          <span className="flex items-center gap-1.5 truncate">
                            <DatabaseIcon className="size-3 text-blue-500 shrink-0" />
                            <span className="font-medium truncate">{ds.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                              ({ds.type})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}

                  {groupedDataSources.nosql.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider px-2 py-1">
                        NoSQL
                      </SelectLabel>
                      {groupedDataSources.nosql.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id} className="text-xs">
                          <span className="flex items-center gap-1.5 truncate">
                            <LayersIcon className="size-3 text-emerald-500 shrink-0" />
                            <span className="font-medium truncate">{ds.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                              ({ds.type})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}

                  {groupedDataSources.files.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider px-2 py-1">
                        Files
                      </SelectLabel>
                      {groupedDataSources.files.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id} className="text-xs">
                          <span className="flex items-center gap-1.5 truncate">
                            <FileSpreadsheetIcon className="size-3 text-amber-500 shrink-0" />
                            <span className="font-medium truncate">{ds.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                              ({ds.type})
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}

                  {groupedDataSources.datastore && groupedDataSources.datastore.length > 0 && (
                    <SelectGroup>
                      <SelectLabel className="text-[10px] text-muted-foreground uppercase font-bold tracking-wider px-2 py-1">
                        Data Store
                      </SelectLabel>
                      {groupedDataSources.datastore.map((ds) => (
                        <SelectItem key={ds.id} value={ds.id} className="text-xs">
                          <span className="flex items-center gap-1.5 truncate">
                            <HardDriveIcon className="size-3 text-purple-500 shrink-0" />
                            <span className="font-medium truncate">{ds.name}</span>
                            <span className="text-[10px] text-muted-foreground uppercase shrink-0">
                              (store)
                            </span>
                          </span>
                        </SelectItem>
                      ))}
                    </SelectGroup>
                  )}
                </SelectContent>
              </Select>
            )}
          </div>

          {/* 3. Enable Data Store Toggle */}
          {queryId && (
            <div className="pt-2.5 border-t space-y-2">
              <div className="flex items-center justify-between">
                <div className="space-y-0.5 pr-2">
                  <label className="text-[11px] font-medium text-foreground flex items-center gap-1.5 cursor-pointer">
                    <HardDriveIcon className="size-3 text-purple-500 shrink-0" />
                    <span>Enable Data Store</span>
                  </label>
                  <p className="text-[10px] text-muted-foreground leading-tight">
                    Materialize query results locally for fast dashboard path
                  </p>
                </div>
                <Switch
                  checked={Boolean(storeTable)}
                  disabled={isTogglingStore}
                  onCheckedChange={(checked) => {
                    if (checked) {
                      void handleEnableDataStore();
                    } else {
                      setDisableStoreDialogOpen(true);
                    }
                  }}
                />
              </div>

              {storeTable && (
                <div className="flex items-center justify-between bg-muted/40 rounded px-2 py-1 text-[11px] border">
                  <span className="flex items-center gap-1.5 text-muted-foreground truncate">
                    <span className="size-1.5 rounded-full bg-emerald-500 shrink-0 animate-pulse" />
                    <span className="truncate">
                      {storeTable.status === "syncing"
                        ? "Syncing..."
                        : storeTable.lastSyncedAt
                        ? `Stored · synced ${formatDistanceToNow(new Date(storeTable.lastSyncedAt), { addSuffix: true })}`
                        : "Stored · pending sync"}
                    </span>
                  </span>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="h-6 px-1.5 text-[10px] gap-1 shrink-0 ml-1"
                    disabled={isTogglingStore || storeTable.status === "syncing"}
                    onClick={() => void handleRefreshDataStore()}
                  >
                    <RefreshCwIcon className={cn("size-2.5", isTogglingStore && "animate-spin")} />
                    <span>Refresh</span>
                  </Button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 2. Middle Scrollable Section: Operations (Builder) OR Schema (SQL mode) */}
      <div className="flex-1 min-h-0 flex flex-col overflow-hidden border-b">
        {mode === "builder" ? (
          <>
            {/* Operations Header with + Add Operation button */}
            <div className="p-3 pb-2 space-y-2 shrink-0 border-b bg-card/20">
              <div className="flex items-center justify-between">
                <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                  Operations
                </h3>
                <span className="text-[10px] text-muted-foreground font-mono">
                  {definition.steps.length + (hasSource ? 1 : 0)} total
                </span>
              </div>

              <AddOperationPopover
                hasSource={hasSource}
                supportedOperations={["filter", "join", "mutate", "summarize", "select", "order", "limit"]}
                onSelectOperation={handleSelectOperation}
              />
            </div>

            {/* Vertical list of operation rows in REVERSE order */}
            <div className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2">
              <DndContext
                sensors={sensors}
                collisionDetection={closestCenter}
                onDragEnd={handleDragEnd}
              >
                <SortableContext
                  items={definition.steps.map((s) => s._id)}
                  strategy={verticalListSortingStrategy}
                >
                  <div className="space-y-2">
                    {reversedSteps.map(({ step, originalIndex }) => {
                      const availableColumns = getAvailableColumnsForStep(
                        cleanDef,
                        originalIndex,
                        schema
                      );

                      return (
                        <OperationRow
                          key={step._id}
                          step={step}
                          stepIndex={originalIndex}
                          schema={schema}
                          availableColumns={availableColumns}
                          onUpdateStep={updateStep}
                          onRemoveStep={removeStep}
                        />
                      );
                    })}
                  </div>
                </SortableContext>
              </DndContext>

              {/* Source operation row: ALWAYS LAST AT THE BOTTOM */}
              <OperationRow
                isSource
                sourceTable={definition.source.table}
                schema={schema}
                availableColumns={sourceColumns}
                onUpdateSource={(tbl) => setSourceTable(tbl)}
              />
            </div>
          </>
        ) : (
          /* SQL Mode: Schema Section */
          <div className="flex-1 min-h-0 flex flex-col overflow-hidden">
            <div className="p-3 pb-2 flex items-center justify-between shrink-0 border-b bg-card/20">
              <h3 className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                Schema
              </h3>
              <span className="text-[10px] text-muted-foreground font-mono">
                {schema?.tables.length ?? 0} tables
              </span>
            </div>

            <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
              {isLoadingSchema ? (
                <div className="p-2 space-y-2">
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                  <Skeleton className="h-7 w-full" />
                </div>
              ) : !schema || schema.tables.length === 0 ? (
                <div className="p-4 text-center text-xs text-muted-foreground">
                  No schema available. Select a data source to view tables.
                </div>
              ) : (
                schema.tables.map((table) => {
                  const isOpen = openTables[table.name] ?? false;
                  return (
                    <div
                      key={table.name}
                      className="rounded-md border bg-card/40 text-xs overflow-hidden"
                    >
                      <div className="flex items-center justify-between p-1.5 hover:bg-muted/40 cursor-pointer">
                        <button
                          type="button"
                          className="flex items-center gap-1.5 font-medium text-left truncate flex-1 hover:text-primary transition-colors"
                          onClick={() => insertSqlText(activeDialect.quoteIdent(table.name))}
                          title={`Click to insert "${table.name}" at cursor`}
                        >
                          <TableIcon className="size-3 text-muted-foreground shrink-0" />
                          <span className="truncate">{table.name}</span>
                        </button>
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            toggleTable(table.name);
                          }}
                          className="p-0.5 text-muted-foreground hover:text-foreground rounded"
                          title={isOpen ? "Collapse columns" : "Expand columns"}
                        >
                          <ChevronDownIcon
                            className={cn(
                              "size-3.5 transition-transform",
                              !isOpen && "-rotate-90"
                            )}
                          />
                        </button>
                      </div>
                      {isOpen && (
                        <div className="pl-3.5 pr-1.5 py-1 border-t bg-muted/10 space-y-1">
                          {table.columns.map((col) => (
                            <button
                              key={col.name}
                              type="button"
                              onClick={() => insertSqlText(activeDialect.quoteIdent(col.name))}
                              className="flex items-center justify-between w-full py-1 px-1.5 rounded hover:bg-muted/50 text-[11px] text-muted-foreground hover:text-foreground font-mono"
                              title={`Click to insert "${col.name}" at cursor`}
                            >
                              <span className="flex items-center gap-1.5 truncate">
                                <ColumnsIcon className="size-2.5 text-muted-foreground shrink-0" />
                                <span className="truncate">{col.name}</span>
                              </span>
                              <Badge
                                variant="outline"
                                className="text-[9px] px-1 py-0 h-3.5 font-mono uppercase shrink-0"
                              >
                                {col.type}
                              </Badge>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </div>
        )}
      </div>

      {/* 3. Compact Collapsible: Execution Info */}
      <div className="border-b shrink-0 bg-card/20">
        <Collapsible open={execInfoOpen} onOpenChange={setExecInfoOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30">
            <span>Execution Info</span>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform text-muted-foreground",
                !execInfoOpen && "-rotate-90"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-2.5 pt-1 space-y-1.5 text-xs">
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Mode</span>
              <Badge variant="outline" className="text-[10px] uppercase font-mono px-1.5 py-0">
                {mode}
              </Badge>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-muted-foreground text-[11px]">Save State</span>
              {isDirty ? (
                <span className="text-amber-500 font-sans text-xs">Unsaved</span>
              ) : lastSavedAt ? (
                <span className="flex items-center gap-1 text-emerald-600 text-xs">
                  <CheckCircle2Icon className="size-3 text-emerald-500" /> Saved
                </span>
              ) : (
                <span className="text-muted-foreground text-xs">Saved</span>
              )}
            </div>
            {results && (
              <>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Rows</span>
                  <span className="font-mono text-xs text-foreground">
                    {(results.totalRows ?? results.rowCount).toLocaleString()} rows
                  </span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-muted-foreground text-[11px]">Duration</span>
                  <span className="flex items-center gap-1 font-mono text-xs text-foreground">
                    <ClockIcon className="size-3 text-muted-foreground" />
                    {results.durationMs}ms
                  </span>
                </div>
              </>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* 4. Compact Collapsible: Output Columns */}
      <div className="border-b shrink-0 bg-card/20">
        <Collapsible open={columnsOpen} onOpenChange={setColumnsOpen}>
          <CollapsibleTrigger className="flex items-center justify-between w-full px-3 py-2 text-xs font-semibold text-muted-foreground uppercase tracking-wider hover:bg-muted/30">
            <div className="flex items-center gap-1.5">
              <span>Output Columns</span>
              {results?.columns && (
                <span className="text-[10px] text-muted-foreground font-mono">
                  ({results.columns.length})
                </span>
              )}
            </div>
            <ChevronDownIcon
              className={cn(
                "size-3.5 transition-transform text-muted-foreground",
                !columnsOpen && "-rotate-90"
              )}
            />
          </CollapsibleTrigger>
          <CollapsibleContent className="px-3 pb-2.5 pt-1">
            {results?.columns && results.columns.length > 0 ? (
              <div className="max-h-36 overflow-y-auto rounded-md border divide-y bg-background text-xs">
                {results.columns.map((col) => (
                  <div
                    key={col.name}
                    className="flex items-center justify-between px-2 py-1 text-xs"
                  >
                    <span className="font-mono text-[11px] truncate">{col.name}</span>
                    <Badge
                      variant="outline"
                      className="text-[9px] uppercase font-mono px-1 py-0 h-4 shrink-0"
                    >
                      {col.type}
                    </Badge>
                  </div>
                ))}
              </div>
            ) : (
              <div className="text-[11px] text-muted-foreground text-center py-2 border border-dashed rounded-md bg-muted/10">
                Run query to inspect column types.
              </div>
            )}
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* 5. Bottom Panel Actions: Ghost Button "Create Chart from Query" & Switch Mode */}
      <div className="p-2 space-y-1 shrink-0 bg-card/30">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => void handleCreateChart()}
          disabled={isCreatingChart || !queryId}
          className="w-full text-xs text-muted-foreground hover:text-foreground justify-start gap-2 h-8"
        >
          {isCreatingChart ? (
            <Loader2Icon className="size-3.5 animate-spin" />
          ) : (
            <BarChart2Icon className="size-3.5" />
          )}
          <span>Create Chart from Query</span>
        </Button>

        {mode === "builder" ? (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void switchToSqlMode()}
            className="w-full text-xs text-muted-foreground hover:text-foreground justify-start gap-2 h-8"
          >
            <Code2Icon className="size-3.5" />
            <span>Switch to SQL Mode</span>
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            onClick={() => void switchToBuilderMode()}
            className="w-full text-xs text-muted-foreground hover:text-foreground justify-start gap-2 h-8"
          >
            <SlidersHorizontalIcon className="size-3.5" />
            <span>Switch to Builder Mode</span>
          </Button>
        )}
      </div>
      {/* Switch Data Source Confirmation Guard */}
      <AlertDialog open={switchGuardOpen} onOpenChange={setSwitchGuardOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Switch Data Source?</AlertDialogTitle>
            <AlertDialogDescription>
              Raw queries are not portable across database types. Your current query may not run against the new data source. Switch anyway?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingSourceId(null)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => {
                if (pendingSourceId) {
                  const target = pendingSourceId;
                  setPendingSourceId(null);
                  setSwitchGuardOpen(false);
                  void executeDataSourceSwitch(target);
                }
              }}
            >
              Switch Data Source
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      {/* Disable Data Store Confirmation Guard */}
      <AlertDialog open={disableStoreDialogOpen} onOpenChange={setDisableStoreDialogOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Disable Data Store?</AlertDialogTitle>
            <AlertDialogDescription>
              Disabling Data Store will drop the materialized table from local storage. Queries, charts, and dashboards will run directly against the original data source.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setDisableStoreDialogOpen(false)}>
              Cancel
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => void handleDisableDataStore()}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              Disable & Drop Table
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
