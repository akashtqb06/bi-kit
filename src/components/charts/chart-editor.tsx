'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
    SelectGroup,
    SelectLabel,
} from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Card, CardTitle } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Collapsible, CollapsibleTrigger, CollapsibleContent } from '@/components/ui/collapsible';
import { ToggleGroup, ToggleGroupItem } from '@/components/ui/toggle-group';
import { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider } from '@/components/ui/tooltip';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from '@/components/ui/command';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuSeparator,
    DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
    AlertDialog,
    AlertDialogContent,
    AlertDialogHeader,
    AlertDialogTitle,
    AlertDialogDescription,
    AlertDialogFooter,
    AlertDialogCancel,
    AlertDialogAction,
} from '@/components/ui/alert-dialog';
import {
    BarChart3Icon,
    LineChartIcon,
    HashIcon,
    TableIcon,
    CircleDotIcon,
    BarChartHorizontalIcon,
    FilterIcon,
    MapPinIcon,
    CircleIcon,
    GitForkIcon,
    RefreshCwIcon,
    MoreHorizontalIcon,
    ChevronDownIcon,
    ChevronsUpDownIcon,
    CheckIcon,
    Settings2Icon,
    GripVerticalIcon,
    PlusIcon,
    Trash2Icon,
    AlertCircleIcon,
    DownloadIcon,
    CopyIcon,
} from 'lucide-react';
import { downloadChartCsv, exportChartPng, registerChartRefetcher } from '@src/lib/chart-actions';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { ChartRenderer } from './chart-renderer';
import { UnderlyingDataTable } from './underlying-data-table';
import {
    chartConfigSchema,
    defaultChartConfig,
    type ChartConfigData,
    type ChartType,
    type ChartSeriesConfig,
    type DateGrain,
    type ReferenceLine,
} from '@src/lib/schemas';
import type { QueryResultData } from '@src/components/query-builder/store';
import { aggregateChartData, normalizeData } from '@src/lib/charts/aggregate';

// ---------------------------------------------------------------------------
// Types & Helpers
// ---------------------------------------------------------------------------

interface QueryListItem {
    id: string;
    name: string;
    workbookId: string;
    dataSourceId: string;
    mode: 'builder' | 'sql';
    definition: string;
    sql: string;
}

interface ChartItem {
    id: string;
    workbookId: string;
    queryId: string;
    name: string;
    type: ChartType;
    config: Record<string, unknown>;
}

export interface ChartEditorProps {
    chartId: string;
    workbookId: string;
}

const ACTIVE_CHART_TYPES: {
    type: ChartType;
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}[] = [
    { type: 'number', label: 'Number', icon: HashIcon },
    { type: 'bar', label: 'Bar', icon: BarChart3Icon },
    { type: 'line', label: 'Line', icon: LineChartIcon },
    { type: 'row', label: 'Row', icon: BarChartHorizontalIcon },
    { type: 'donut', label: 'Donut', icon: CircleDotIcon },
    { type: 'table', label: 'Table', icon: TableIcon },
];

const DISABLED_CHART_TYPES: {
    label: string;
    icon: React.ComponentType<{ className?: string }>;
}[] = [
    { label: 'Funnel', icon: FilterIcon },
    { label: 'Map', icon: MapPinIcon },
    { label: 'Bubble', icon: CircleIcon },
    { label: 'Sankey', icon: GitForkIcon },
];

function queryHasGroupBy(q?: QueryListItem | null): boolean {
    if (!q) return false;
    if (q.mode === 'builder' && q.definition) {
        try {
            const def: unknown = JSON.parse(q.definition);
            const steps = Array.isArray(def)
                ? def
                : def && typeof def === 'object' && 'steps' in def && Array.isArray((def as { steps: unknown[] }).steps)
                  ? (def as { steps: unknown[] }).steps
                  : [];
            return steps.some(
                (s) =>
                    s &&
                    typeof s === 'object' &&
                    ('type' in s
                        ? (s as { type: string }).type === 'summarize'
                        : (s as { op: string }).op === 'summarize')
            );
        } catch {
            return false;
        }
    }
    if (q.mode === 'sql' && q.sql) {
        return /\bgroup\s+by\b/i.test(q.sql);
    }
    return false;
}

// ---------------------------------------------------------------------------
// ChartEditor Component
// ---------------------------------------------------------------------------

export function ChartEditor({ chartId, workbookId }: ChartEditorProps) {
    const router = useRouter();
    const chartContainerRef = useRef<HTMLDivElement>(null);

    // Chart state
    const [name, setName] = useState<string>('');
    const [queryId, setQueryId] = useState<string>('');
    const [type, setType] = useState<ChartType>('bar');
    const [config, setConfig] = useState<ChartConfigData>(defaultChartConfig);

    // Queries in workbook
    const [queries, setQueries] = useState<QueryListItem[]>([]);

    // Query execution & results
    const [queryResults, setQueryResults] = useState<QueryResultData | null>(null);
    const [isRunningQuery, setIsRunningQuery] = useState(false);
    const [queryError, setQueryError] = useState<string | null>(null);
    const [queryDurationMs, setQueryDurationMs] = useState<number>(74);
    const [lastFetchedAt, setLastFetchedAt] = useState<Date | null>(null);

    // UI popovers & collapsible sections state
    const [chartOpen, setChartOpen] = useState(true);
    const [xAxisOpen, setXAxisOpen] = useState(true);
    const [yAxisOpen, setYAxisOpen] = useState(true);
    const [splitOpen, setSplitOpen] = useState(true);
    const [numberOpen, setNumberOpen] = useState(true);
    const [donutOpen, setDonutOpen] = useState(true);
    const [tableOpen, setTableOpen] = useState(true);

    const [xColComboboxOpen, setXColComboboxOpen] = useState(false);

    // Lifecycle & save status
    const [isLoadingChart, setIsLoadingChart] = useState(true);
    const [chartLoadFailure, setChartLoadFailure] = useState<string | null>(null);
    const [isSaving, setIsSaving] = useState(false);
    const [isDirty, setIsDirty] = useState(false);

    const isHydrated = useRef(false);
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const lastExecutedQueryRef = useRef<{ id: string; hash: string } | null>(null);
    const chartAbortControllerRef = useRef<AbortController | null>(null);
    const chartCardRef = useRef<HTMLDivElement>(null);
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false);
    const [isDeleting, setIsDeleting] = useState(false);

    const [now, setNow] = useState<number>(() => Date.now());

    useEffect(() => {
        if (!lastFetchedAt) return;
        const interval = setInterval(() => {
            setNow(Date.now());
        }, 5000);
        return () => clearInterval(interval);
    }, [lastFetchedAt]);

    const relativeTime = useMemo(() => {
        if (!lastFetchedAt || !now) return 'just now';
        const diffSec = Math.max(0, Math.floor((now - lastFetchedAt.getTime()) / 1000));
        if (diffSec < 10) return 'just now';
        if (diffSec < 60) return `${diffSec}s ago`;
        const diffMin = Math.floor(diffSec / 60);
        if (diffMin < 60) return `${diffMin}m ago`;
        const diffHour = Math.floor(diffMin / 60);
        return `${diffHour}h ago`;
    }, [lastFetchedAt, now]);

    // -------------------------------------------------------------------------
    // Fetch workbook queries
    // -------------------------------------------------------------------------
    const loadQueries = useCallback(async () => {
        try {
            const res = await fetch(`/api/queries?workbookId=${workbookId}`);
            if (!res.ok) throw new Error('Failed to load queries');
            const json = await res.json();
            setQueries(json.data || []);
            return (json.data as QueryListItem[]) || [];
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load queries';
            toast.error('Unable to load queries', { description: message });
            return [];
        }
    }, [workbookId]);

    // -------------------------------------------------------------------------
    // Run query to get live results
    // -------------------------------------------------------------------------
    const executeQuery = useCallback(async (q: QueryListItem, signal?: AbortSignal) => {
        if (!q.dataSourceId) {
            setQueryError('Query has no data source assigned.');
            return;
        }

        setIsRunningQuery(true);
        setQueryError(null);

        const startTime = Date.now();

        try {
            let def: unknown = undefined;
            if (q.mode === 'builder' && q.definition) {
                try {
                    def = JSON.parse(q.definition);
                } catch {
                    def = undefined;
                }
            }

            const res = await fetch('/api/queries/run', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    dataSourceId: q.dataSourceId,
                    mode: q.mode,
                    definition: def,
                    sql: q.sql,
                }),
                signal,
            });

            const json = await res.json();
            if (!res.ok) {
                throw new Error(json.error?.message || json.message || 'Failed to execute query');
            }

            const resultData: QueryResultData = json.data;
            setQueryResults(resultData);
            const duration = resultData.durationMs || Date.now() - startTime;
            setQueryDurationMs(duration);
            setNow(Date.now());
            setLastFetchedAt(new Date());
        } catch (err) {
            if (err instanceof Error && err.name === 'AbortError') return;
            const msg = err instanceof Error ? err.message : 'Query execution failed';
            setQueryError(msg);
            setQueryResults(null);
            toast.error('Query execution failed', { description: msg });
        } finally {
            setIsRunningQuery(false);
        }
    }, []);

    // -------------------------------------------------------------------------
    // Fetch Chart details on mount
    // -------------------------------------------------------------------------
    useEffect(() => {
        let mounted = true;
        isHydrated.current = false;

        async function init() {
            setIsLoadingChart(true);
            try {
                const [chartRes, queryList] = await Promise.all([fetch(`/api/charts/${chartId}`), loadQueries()]);

                if (!chartRes.ok) throw new Error('Failed to load chart');
                const chartJson = await chartRes.json();
                const chartData: ChartItem = chartJson.data;

                if (!mounted) return;

                setName(chartData.name);
                setQueryId(chartData.queryId);
                setType(chartData.type || 'bar');

                const parsedConfig = chartConfigSchema.safeParse(chartData.config);
                const resolvedConfig = parsedConfig.success ? parsedConfig.data : defaultChartConfig;
                setConfig(resolvedConfig);

                const matchedQuery = queryList.find((q) => q.id === chartData.queryId);
                let qToRun = matchedQuery;
                if (!qToRun && chartData.queryId) {
                    const singleQRes = await fetch(`/api/queries/${chartData.queryId}`);
                    if (singleQRes.ok) {
                        const singleQJson = await singleQRes.json();
                        if (singleQJson.data) {
                            qToRun = singleQJson.data;
                        }
                    }
                }

                if (qToRun) {
                    const qHash = `${qToRun.dataSourceId}:${qToRun.mode}:${qToRun.definition || ''}:${qToRun.sql || ''}`;
                    const last = lastExecutedQueryRef.current;
                    if (!last || last.id !== qToRun.id || last.hash !== qHash) {
                        if (chartAbortControllerRef.current) {
                            chartAbortControllerRef.current.abort();
                        }
                        const controller = new AbortController();
                        chartAbortControllerRef.current = controller;
                        lastExecutedQueryRef.current = { id: qToRun.id, hash: qHash };
                        void executeQuery(qToRun, controller.signal);
                    }
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Error loading chart';
                setChartLoadFailure(message);
                toast.error('Unable to load chart', { description: message });
            } finally {
                if (mounted) {
                    setIsLoadingChart(false);
                    setTimeout(() => {
                        isHydrated.current = true;
                    }, 400);
                }
            }
        }

        void init();

        return () => {
            mounted = false;
            if (chartAbortControllerRef.current) {
                chartAbortControllerRef.current.abort();
            }
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
        };
    }, [chartId, loadQueries, executeQuery]);

    // -------------------------------------------------------------------------
    // Autosave when dirty
    // -------------------------------------------------------------------------
    const saveChart = useCallback(
        async (nameToSave: string, queryIdToSave: string, typeToSave: ChartType, configToSave: ChartConfigData) => {
            try {
                setIsSaving(true);
                const res = await fetch(`/api/charts/${chartId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: nameToSave.trim() || 'Untitled Chart',
                        queryId: queryIdToSave,
                        type: typeToSave,
                        config: configToSave,
                    }),
                });

                if (!res.ok) throw new Error('Failed to save chart');
                setIsDirty(false);
            } catch (err) {
                const msg = err instanceof Error ? err.message : 'Autosave failed';
                toast.error('Failed to save chart changes', { description: msg });
            } finally {
                setIsSaving(false);
            }
        },
        [chartId]
    );

    const triggerSave = useCallback(
        (updatedName: string, updatedQueryId: string, updatedType: ChartType, updatedConfig: ChartConfigData) => {
            if (!isHydrated.current) return;
            setIsDirty(true);
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = setTimeout(() => {
                void saveChart(updatedName, updatedQueryId, updatedType, updatedConfig);
            }, 500);
        },
        [saveChart]
    );

    const updateConfig = useCallback(
        (patch: Partial<ChartConfigData>) => {
            const next = { ...config, ...patch };
            setConfig(next);
            triggerSave(name, queryId, type, next);
        },
        [config, name, queryId, type, triggerSave]
    );

    const handleTypeChange = useCallback(
        (nextType: ChartType) => {
            setType(nextType);
            const nextConfig = { ...config };
            const colNames = queryResults?.columns?.map((c) => c.name) || [];

            if (nextType === 'donut' || nextType === 'pie') {
                if (!nextConfig.donutLabelColumn && nextConfig.xAxis) {
                    nextConfig.donutLabelColumn = nextConfig.xAxis;
                } else if (!nextConfig.donutLabelColumn && colNames.length > 0) {
                    nextConfig.donutLabelColumn = colNames[0];
                }
                const firstVal =
                    nextConfig.seriesConfig?.[0]?.column ||
                    nextConfig.yAxis?.[0] ||
                    nextConfig.numberValueColumn ||
                    colNames.find((c) => c !== nextConfig.donutLabelColumn) ||
                    colNames[0];
                if (!nextConfig.donutValueColumn && firstVal) {
                    nextConfig.donutValueColumn = firstVal;
                }
                nextConfig.stacked = false;
                nextConfig.normalize = false;
            } else if (nextType === 'number') {
                const firstVal =
                    nextConfig.donutValueColumn ||
                    nextConfig.seriesConfig?.[0]?.column ||
                    nextConfig.yAxis?.[0] ||
                    colNames[0];
                if (!nextConfig.numberValueColumn && firstVal) {
                    nextConfig.numberValueColumn = firstVal;
                }
                nextConfig.stacked = false;
                nextConfig.normalize = false;
            } else if (nextType === 'table') {
                nextConfig.stacked = false;
                nextConfig.normalize = false;
            } else {
                // bar, line, row
                if (!nextConfig.xAxis && nextConfig.donutLabelColumn) {
                    nextConfig.xAxis = nextConfig.donutLabelColumn;
                }
                const fallbackVal =
                    nextConfig.seriesConfig?.[0]?.column ||
                    nextConfig.yAxis?.[0] ||
                    nextConfig.donutValueColumn ||
                    nextConfig.numberValueColumn;
                if ((!nextConfig.seriesConfig || nextConfig.seriesConfig.length === 0) && fallbackVal) {
                    nextConfig.seriesConfig = [
                        {
                            column: fallbackVal,
                            aggregation: 'sum',
                            label: fallbackVal,
                        },
                    ];
                    nextConfig.yAxis = [fallbackVal];
                }
                if (nextType === 'row') {
                    nextConfig.overlap = false;
                }
            }

            setConfig(nextConfig);
            triggerSave(name, queryId, nextType, nextConfig);
        },
        [name, queryId, config, queryResults, triggerSave]
    );


    const handleSelectQuery = useCallback(
        (nextQueryId: string) => {
            setQueryId(nextQueryId);
            triggerSave(name, nextQueryId, type, config);
            const q = queries.find((item) => item.id === nextQueryId);
            if (q) {
                void executeQuery(q);
            }
        },
        [name, type, config, queries, executeQuery, triggerSave]
    );

    const handleRefresh = useCallback(async () => {
        const q = queries.find((item) => item.id === queryId);
        if (q) {
            await executeQuery(q);
            toast.success('Chart refreshed');
        } else {
            toast.error('Please select a query first');
        }
    }, [queries, queryId, executeQuery]);

    useEffect(() => {
        return registerChartRefetcher(chartId, handleRefresh);
    }, [chartId, handleRefresh]);

    // Columns from query results
    const availableColumns = useMemo(() => {
        return queryResults?.columns || [];
    }, [queryResults]);

    const linkedQuery = useMemo(() => {
        return queries.find((q) => q.id === queryId);
    }, [queries, queryId]);

    // Series management helpers
    const seriesList: ChartSeriesConfig[] = useMemo(() => {
        if (config.seriesConfig && config.seriesConfig.length > 0) {
            return config.seriesConfig;
        }
        if (config.yAxis && config.yAxis.length > 0) {
            return config.yAxis.map((col) => ({
                column: col,
                aggregation: 'sum',
                label: col,
            }));
        }
        const fallbackCol =
            availableColumns.find((c) => c.name !== config.xAxis)?.name || availableColumns[0]?.name || '';
        return fallbackCol ? [{ column: fallbackCol, aggregation: 'sum', label: fallbackCol }] : [];
    }, [config.seriesConfig, config.yAxis, config.xAxis, availableColumns]);

    const handleUpdateSeries = (index: number, patch: Partial<ChartSeriesConfig>) => {
        const updated = [...seriesList];
        updated[index] = { ...updated[index], ...patch };
        updateConfig({
            seriesConfig: updated,
            yAxis: updated.map((s) => s.column),
        });
    };

    const handleAddSeries = () => {
        const usedCols = new Set(seriesList.map((s) => s.column));
        const unused = availableColumns.find((c) => !usedCols.has(c.name) && c.name !== config.xAxis);
        const colToAdd = unused?.name || availableColumns[0]?.name || 'value';
        const nextList: ChartSeriesConfig[] = [
            ...seriesList,
            {
                column: colToAdd,
                aggregation: 'sum',
                label: colToAdd,
                type: 'bar',
            },
        ];
        updateConfig({
            seriesConfig: nextList,
            yAxis: nextList.map((s) => s.column),
        });
    };

    const handleRemoveSeries = (index: number) => {
        if (seriesList.length <= 1) return;
        const nextList = seriesList.filter((_, i) => i !== index);
        updateConfig({
            seriesConfig: nextList,
            yAxis: nextList.map((s) => s.column),
        });
    };

    // Reference lines helpers
    const handleAddReferenceLine = () => {
        const nextLines: ReferenceLine[] = [
            ...(config.referenceLines || []),
            { label: 'Target', value: 100, color: '#e11d48' },
        ];
        updateConfig({ referenceLines: nextLines });
    };

    const handleUpdateReferenceLine = (index: number, patch: Partial<ReferenceLine>) => {
        const nextLines = [...(config.referenceLines || [])];
        nextLines[index] = { ...nextLines[index], ...patch };
        updateConfig({ referenceLines: nextLines });
    };

    const handleRemoveReferenceLine = (index: number) => {
        const nextLines = (config.referenceLines || []).filter((_, i) => i !== index);
        updateConfig({ referenceLines: nextLines });
    };

    // Export helpers
    const handleDownloadPng = async () => {
        if (!chartCardRef.current) return;
        await exportChartPng(chartCardRef.current, config.title || name || 'chart');
    };

    const handleDownloadCsv = () => {
        const { columnNames: colNames, rows: rawRows } = normalizeData(queryResults);
        const agg = aggregateChartData(rawRows, config, colNames, {
            queryHasGroupBy: queryHasGroupBy(linkedQuery),
        });

        if (agg.rows.length === 0) {
            toast.error('No data to export');
            return;
        }

        void downloadChartCsv(
            { id: chartId, name, title: config.title || name, queryId },
            agg.rows,
            agg.columnNames
        );
    };

    const handleDuplicate = async () => {
        try {
            const res = await fetch('/api/charts', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    workbookId,
                    queryId,
                    name: `${name || 'Untitled Chart'} (Copy)`,
                    type,
                    config,
                }),
            });
            if (!res.ok) throw new Error('Failed to duplicate chart');
            const json = await res.json();
            toast.success('Chart duplicated');
            router.push(`/workbooks/${workbookId}/chart/${json.data.id}`);
        } catch {
            toast.error('Failed to duplicate chart');
        }
    };

    const handleConfirmDelete = async () => {
        try {
            setIsDeleting(true);
            const res = await fetch(`/api/charts/${chartId}`, { method: 'DELETE' });
            if (!res.ok) throw new Error('Failed to delete chart');
            toast.success('Chart deleted');
            setIsDeleteDialogOpen(false);
            router.push(`/workbooks/${workbookId}`);
        } catch {
            toast.error('Failed to delete chart');
        } finally {
            setIsDeleting(false);
        }
    };

    // Calculate aggregated underlying data for table view
    const aggregatedTableData = useMemo(() => {
        const { columnNames: colNames, rows: rawRows } = normalizeData(queryResults);
        return aggregateChartData(rawRows, config, colNames, {
            queryHasGroupBy: queryHasGroupBy(linkedQuery),
        });
    }, [queryResults, config, linkedQuery]);

    // -------------------------------------------------------------------------
    // Render Loading & Error Skeletons
    // -------------------------------------------------------------------------
    if (isLoadingChart) {
        return (
            <div className="flex h-full w-full flex-col p-6 gap-6">
                <div className="flex items-center justify-between border-b pb-4">
                    <Skeleton className="h-8 w-64 rounded-md" />
                    <Skeleton className="h-8 w-36 rounded-md" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 flex-1">
                    <div className="col-span-2 space-y-4">
                        <Skeleton className="h-72 w-full rounded-md" />
                        <Skeleton className="h-44 w-full rounded-md" />
                    </div>
                    <div className="space-y-4">
                        <Skeleton className="h-40 w-full rounded-md" />
                        <Skeleton className="h-40 w-full rounded-md" />
                    </div>
                </div>
            </div>
        );
    }

    if (chartLoadFailure) {
        return (
            <div className="flex h-full w-full items-center justify-center p-6">
                <div className="w-full max-w-lg space-y-3">
                    <Alert variant="destructive">
                        <AlertCircleIcon className="size-4" />
                        <AlertTitle>Chart could not be loaded</AlertTitle>
                        <AlertDescription>{chartLoadFailure}</AlertDescription>
                    </Alert>
                </div>
            </div>
        );
    }

    return (
        <div className="flex flex-1 min-h-0 min-w-0 w-full flex-row overflow-hidden bg-background">
            {/* ----------------------------------------------------------------- */}
            {/* CENTER AREA: Status Bar + Chart Card + Underlying Data Card       */}
            {/* ----------------------------------------------------------------- */}
            <div className="flex flex-1 min-h-0 min-w-0 flex-col overflow-hidden">
                {/* 1. Status Bar Row */}
                <div className="flex items-center justify-between px-4 py-2 border-b bg-background shrink-0 text-xs select-none">
                    {/* Left: Status indicator dot & Fetched text */}
                    <div className="flex items-center gap-2">
                        {isRunningQuery ? (
                            <>
                                <span className="size-2 rounded-full bg-blue-500 animate-pulse shrink-0" />
                                <span className="text-muted-foreground">Executing query...</span>
                            </>
                        ) : queryError ? (
                            <>
                                <span className="size-2 rounded-full bg-rose-500 shrink-0" />
                                <span className="text-rose-500 truncate max-w-md font-medium" title={queryError}>
                                    {queryError}
                                </span>
                            </>
                        ) : queryResults && lastFetchedAt ? (
                            <>
                                <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-muted-foreground font-normal">
                                    Fetched in {(queryDurationMs / 1000).toFixed(3)}s {relativeTime}
                                </span>
                            </>
                        ) : (
                            <>
                                <span className="size-2 rounded-full bg-emerald-500 shrink-0" />
                                <span className="text-muted-foreground font-normal">Fetched in 0.074s just now</span>
                            </>
                        )}
                    </div>

                    {/* Right: Refresh button & "..." DropdownMenu */}
                    <div className="flex items-center gap-2">
                        <Button
                            variant="outline"
                            size="sm"
                            onClick={handleRefresh}
                            disabled={isRunningQuery || !queryId}
                            className="h-8 gap-1.5 text-xs font-medium px-3 shadow-xs"
                        >
                            <RefreshCwIcon className={cn('size-3.5', isRunningQuery && 'animate-spin')} />
                            <span>Refresh</span>
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
                                <span className="sr-only">More options</span>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="end" className="w-44">
                                <DropdownMenuItem onClick={handleRefresh}>
                                    <RefreshCwIcon className="size-3.5 mr-2" />
                                    <span>Refresh</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleDownloadPng}>
                                    <DownloadIcon className="size-3.5 mr-2" />
                                    <span>Download PNG</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={handleDownloadCsv}>
                                    <DownloadIcon className="size-3.5 mr-2" />
                                    <span>Download CSV</span>
                                </DropdownMenuItem>
                                <DropdownMenuSeparator />
                                <DropdownMenuItem onClick={handleDuplicate}>
                                    <CopyIcon className="size-3.5 mr-2" />
                                    <span>Duplicate</span>
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                    onClick={() => setIsDeleteDialogOpen(true)}
                                    className="text-destructive focus:text-destructive"
                                >
                                    <Trash2Icon className="size-3.5 mr-2" />
                                    <span>Delete</span>
                                </DropdownMenuItem>
                            </DropdownMenuContent>
                        </DropdownMenu>
                    </div>
                </div>

                {/* 2. Scrollable Center Content: Chart Card + Data Table Card */}
                <div className="flex-1 min-h-0 min-w-0 overflow-y-auto p-4 space-y-4">
                    {/* Top Card: Chart Title & Live Chart */}
                    <Card ref={chartCardRef} className="flex flex-col p-3 bg-card shadow-xs h-[380px] min-h-[280px] shrink-0">
                        <div className="flex items-center justify-between pb-2 border-b shrink-0">
                            <CardTitle className="text-sm font-semibold text-foreground tracking-tight">
                                {config.title || name || 'Untitled Chart'}
                            </CardTitle>
                            {isSaving ? (
                                <Badge variant="secondary" className="text-[10px] font-mono text-muted-foreground">
                                    Saving...
                                </Badge>
                            ) : isDirty ? (
                                <span className="text-[10px] text-amber-500 font-medium">Unsaved changes</span>
                            ) : null}
                        </div>

                        <div
                            className="flex-1 w-full min-h-0 min-w-0 mt-1 relative flex flex-col overflow-hidden"
                            ref={chartContainerRef}
                        >
                            <ChartRenderer
                                type={type}
                                config={config}
                                data={queryResults}
                                loading={isRunningQuery}
                                error={queryError}
                                className="h-full w-full min-h-0 min-w-0"
                                showTitle={false}
                            />
                        </div>
                    </Card>

                    {/* Bottom Card: Underlying Data Table */}
                    <Card className="flex flex-col p-4 bg-card shadow-xs">
                        <div className="flex items-center justify-between pb-3">
                            <div className="flex items-center gap-2">
                                <h3 className="text-xs font-semibold text-foreground tracking-tight">
                                    Underlying Data
                                </h3>
                                <Badge variant="secondary" className="text-[10px] font-mono px-1.5 py-0">
                                    {aggregatedTableData.rows.length} rows
                                </Badge>
                            </div>
                        </div>

                        <UnderlyingDataTable
                            columnNames={aggregatedTableData.columnNames}
                            rows={aggregatedTableData.rows}
                            maxHeight="max-h-[320px]"
                        />
                    </Card>
                </div>
            </div>

            {/* ----------------------------------------------------------------- */}
            {/* RIGHT PANEL: w-80, ScrollArea, Frappe Insights Chart Inspector    */}
            {/* ----------------------------------------------------------------- */}
            <div className="w-80 border-l bg-card flex flex-col shrink-0 h-full overflow-y-auto">
                <ScrollArea className="flex-1">
                    <div className="p-4 space-y-4">
                        {/* 1. Collapsible heading "Chart" with 3-column toggle buttons */}
                        <Collapsible open={chartOpen} onOpenChange={setChartOpen}>
                            <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                <span>Chart</span>
                                <ChevronDownIcon
                                    className={cn(
                                        'size-3.5 transition-transform text-muted-foreground',
                                        !chartOpen && '-rotate-90'
                                    )}
                                />
                            </CollapsibleTrigger>
                            <CollapsibleContent className="pt-2 space-y-2">
                                <ToggleGroup
                                    value={[type]}
                                    onValueChange={(vals) => {
                                        if (vals && vals.length > 0) {
                                            const chosen = vals[vals.length - 1] as ChartType;
                                            handleTypeChange(chosen);
                                        }
                                    }}
                                    className="grid grid-cols-3 gap-1.5 w-full"
                                >
                                    {ACTIVE_CHART_TYPES.map((t) => {
                                        const Icon = t.icon;
                                        const isSelected = type === t.type;
                                        return (
                                            <ToggleGroupItem
                                                key={t.type}
                                                value={t.type}
                                                className={cn(
                                                    'flex flex-col items-center justify-center p-2 rounded-lg border text-xs font-medium transition-all gap-1 h-auto cursor-pointer text-center',
                                                    isSelected
                                                        ? 'border-primary bg-primary/10 text-primary font-semibold shadow-xs'
                                                        : 'border-border/60 hover:border-border hover:bg-muted/50 text-muted-foreground'
                                                )}
                                            >
                                                <Icon className="size-4 shrink-0" />
                                                <span className="text-[11px] leading-tight truncate">{t.label}</span>
                                            </ToggleGroupItem>
                                        );
                                    })}
                                </ToggleGroup>

                                {/* Disabled buttons with "Coming soon" Tooltip */}
                                <TooltipProvider delay={150}>
                                    <div className="grid grid-cols-3 gap-1.5 w-full">
                                        {DISABLED_CHART_TYPES.map((t) => {
                                            const Icon = t.icon;
                                            return (
                                                <Tooltip key={t.label}>
                                                    <TooltipTrigger
                                                        render={
                                                            <button
                                                                type="button"
                                                                disabled
                                                                className="flex flex-col items-center justify-center p-2 rounded-lg border border-dashed border-border/40 text-muted-foreground/40 text-xs font-medium gap-1 cursor-not-allowed opacity-50 select-none text-center"
                                                            />
                                                        }
                                                    >
                                                        <Icon className="size-4 shrink-0" />
                                                        <span className="text-[11px] leading-tight truncate">
                                                            {t.label}
                                                        </span>
                                                    </TooltipTrigger>
                                                    <TooltipContent side="top">Coming soon</TooltipContent>
                                                </Tooltip>
                                            );
                                        })}
                                    </div>
                                </TooltipProvider>
                            </CollapsibleContent>
                        </Collapsible>

                        {/* 2. "Query": Select showing query name with TableIcon */}
                        <div className="space-y-1.5 pt-1">
                            <label className="text-xs font-medium text-foreground">Query</label>
                            <Select
                                value={queryId}
                                onValueChange={(val) => {
                                    if (val) handleSelectQuery(val);
                                }}
                                items={queries.map((q) => ({ value: q.id, label: q.name }))}
                            >
                                <SelectTrigger className="h-8 text-xs w-full">
                                    <div className="flex items-center gap-2 truncate">
                                        <TableIcon className="size-3.5 text-muted-foreground shrink-0" />
                                        <SelectValue placeholder="Select query..." notFoundText="Unknown query" />
                                    </div>
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectGroup>
                                        <SelectLabel className="text-[11px]">Workbook Queries</SelectLabel>
                                        {queries.map((q) => (
                                            <SelectItem key={q.id} value={q.id} className="text-xs">
                                                <div className="flex items-center gap-2 truncate">
                                                    <TableIcon className="size-3.5 text-muted-foreground shrink-0" />
                                                    <span className="font-medium truncate">{q.name}</span>
                                                </div>
                                            </SelectItem>
                                        ))}
                                    </SelectGroup>
                                </SelectContent>
                            </Select>
                        </div>

                        {/* 3. "Title": Input */}
                        <div className="space-y-1.5">
                            <label className="text-xs font-medium text-foreground">Title</label>
                            <Input
                                value={config.title !== undefined ? config.title : name}
                                onChange={(e) => {
                                    updateConfig({ title: e.target.value });
                                    setName(e.target.value);
                                }}
                                placeholder="Chart Title"
                                className="h-8 text-xs"
                            />
                        </div>

                        {/* ------------------------------------------------------------- */}
                        {/* Controls for Bar, Line, Row                                   */}
                        {/* ------------------------------------------------------------- */}
                        {['bar', 'line', 'row', 'area'].includes(type) && (
                            <>
                                {/* 4. Collapsible section "X Axis" */}
                                <Collapsible open={xAxisOpen} onOpenChange={setXAxisOpen}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                        <span>X Axis</span>
                                        <ChevronDownIcon
                                            className={cn(
                                                'size-3.5 transition-transform text-muted-foreground',
                                                !xAxisOpen && '-rotate-90'
                                            )}
                                        />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 space-y-3">
                                        {/* Column Select with Command in Popover + adjacent gear Popover */}
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-medium text-foreground">Column</label>
                                            <div className="flex items-center gap-1.5">
                                                <Popover open={xColComboboxOpen} onOpenChange={setXColComboboxOpen}>
                                                    <PopoverTrigger
                                                        render={
                                                            <Button
                                                                variant="outline"
                                                                role="combobox"
                                                                aria-expanded={xColComboboxOpen}
                                                                className="h-8 justify-between text-xs font-normal flex-1"
                                                            />
                                                        }
                                                    >
                                                        <span className="truncate">
                                                            {config.xAxis || 'Select column...'}
                                                        </span>
                                                        <ChevronsUpDownIcon className="size-3.5 opacity-50 shrink-0 ml-1" />
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-56 p-0" align="start">
                                                        <Command>
                                                            <CommandInput
                                                                placeholder="Search column..."
                                                                className="h-8 text-xs"
                                                            />
                                                            <CommandList>
                                                                <CommandEmpty className="p-2 text-xs text-muted-foreground">
                                                                    No column found.
                                                                </CommandEmpty>
                                                                <CommandGroup>
                                                                    {availableColumns.map((c) => (
                                                                        <CommandItem
                                                                            key={c.name}
                                                                            value={c.name}
                                                                            onSelect={() => {
                                                                                updateConfig({ xAxis: c.name });
                                                                                setXColComboboxOpen(false);
                                                                            }}
                                                                            className="text-xs"
                                                                        >
                                                                            <CheckIcon
                                                                                className={cn(
                                                                                    'mr-2 size-3.5',
                                                                                    config.xAxis === c.name
                                                                                        ? 'opacity-100'
                                                                                        : 'opacity-0'
                                                                                )}
                                                                            />
                                                                            <span className="truncate">{c.name}</span>
                                                                        </CommandItem>
                                                                    ))}
                                                                </CommandGroup>
                                                            </CommandList>
                                                        </Command>
                                                    </PopoverContent>
                                                </Popover>

                                                {/* Gear Popover for date grain & format */}
                                                <Popover>
                                                    <PopoverTrigger
                                                        render={
                                                            <Button
                                                                variant="outline"
                                                                size="icon"
                                                                className="size-8 shrink-0 text-muted-foreground hover:text-foreground"
                                                            />
                                                        }
                                                    >
                                                        <Settings2Icon className="size-3.5" />
                                                        <span className="sr-only">X Axis Options</span>
                                                    </PopoverTrigger>
                                                    <PopoverContent className="w-64 p-3 space-y-3" align="end">
                                                        <div className="font-semibold text-xs text-foreground pb-1 border-b">
                                                            X Axis Options
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-medium text-foreground">
                                                                Date Grain
                                                            </label>
                                                            <Select
                                                                value={config.xDateGrain || 'none'}
                                                                onValueChange={(val) => {
                                                                    updateConfig({
                                                                        xDateGrain:
                                                                            val === 'none'
                                                                                ? undefined
                                                                                : (val as DateGrain),
                                                                    });
                                                                }}
                                                                items={[
                                                                    { value: 'none', label: 'None (Raw values)' },
                                                                    { value: 'day', label: 'Day' },
                                                                    { value: 'week', label: 'Week' },
                                                                    { value: 'month', label: 'Month' },
                                                                    { value: 'quarter', label: 'Quarter' },
                                                                    { value: 'year', label: 'Year' },
                                                                ]}
                                                            >
                                                                <SelectTrigger className="h-8 text-xs w-full">
                                                                    <SelectValue placeholder="None (Raw values)" />
                                                                </SelectTrigger>
                                                                <SelectContent>
                                                                    <SelectItem value="none" className="text-xs">
                                                                        None (Raw values)
                                                                    </SelectItem>
                                                                    <SelectItem value="day" className="text-xs">
                                                                        Day
                                                                    </SelectItem>
                                                                    <SelectItem value="week" className="text-xs">
                                                                        Week
                                                                    </SelectItem>
                                                                    <SelectItem value="month" className="text-xs">
                                                                        Month
                                                                    </SelectItem>
                                                                    <SelectItem value="quarter" className="text-xs">
                                                                        Quarter
                                                                    </SelectItem>
                                                                    <SelectItem value="year" className="text-xs">
                                                                        Year
                                                                    </SelectItem>
                                                                </SelectContent>
                                                            </Select>
                                                        </div>
                                                        <div className="space-y-1">
                                                            <label className="text-[11px] font-medium text-foreground">
                                                                Format
                                                            </label>
                                                            <Input
                                                                value={config.xFormat || ''}
                                                                onChange={(e) =>
                                                                    updateConfig({ xFormat: e.target.value })
                                                                }
                                                                placeholder="e.g. MMMM, yyyy"
                                                                className="h-8 text-xs"
                                                            />
                                                        </div>
                                                    </PopoverContent>
                                                </Popover>
                                            </div>
                                        </div>

                                        {/* Rotate Values Select */}
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-medium text-foreground">
                                                Rotate Values
                                            </label>
                                            <Select
                                                value={String(config.xRotateValues ?? 0)}
                                                onValueChange={(val) =>
                                                    updateConfig({ xRotateValues: Number(val) as 0 | 45 | 90 })
                                                }
                                                items={[
                                                    { value: '0', label: '0° (Horizontal)' },
                                                    { value: '45', label: '45° (Slanted)' },
                                                    { value: '90', label: '90° (Vertical)' },
                                                ]}
                                            >
                                                <SelectTrigger className="h-8 text-xs w-full">
                                                    <SelectValue />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem value="0" className="text-xs">
                                                        0° (Horizontal)
                                                    </SelectItem>
                                                    <SelectItem value="45" className="text-xs">
                                                        45° (Slanted)
                                                    </SelectItem>
                                                    <SelectItem value="90" className="text-xs">
                                                        90° (Vertical)
                                                    </SelectItem>
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>

                                {/* 5. Collapsible section "Y Axis" */}
                                <Collapsible open={yAxisOpen} onOpenChange={setYAxisOpen}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                        <span>Y Axis</span>
                                        <ChevronDownIcon
                                            className={cn(
                                                'size-3.5 transition-transform text-muted-foreground',
                                                !yAxisOpen && '-rotate-90'
                                            )}
                                        />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 space-y-3">
                                        <label className="text-[11px] font-medium text-foreground block">Series</label>

                                        {/* Series Rows */}
                                        <div className="space-y-2">
                                            {seriesList.map((series, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-1.5 p-1.5 border rounded-md bg-muted/20"
                                                >
                                                    <GripVerticalIcon className="size-3.5 text-muted-foreground/60 cursor-grab shrink-0" />
                                                    <Select
                                                        value={series.column}
                                                        items={availableColumns.map((c) => ({
                                                            value: c.name,
                                                            label: c.name,
                                                        }))}
                                                        onValueChange={(val) => {
                                                            if (val) handleUpdateSeries(idx, { column: val });
                                                        }}
                                                    >
                                                        <SelectTrigger className="h-7 text-xs flex-1">
                                                            <SelectValue placeholder="Select column..." />
                                                        </SelectTrigger>
                                                        <SelectContent>
                                                            {availableColumns.map((c) => (
                                                                <SelectItem
                                                                    key={c.name}
                                                                    value={c.name}
                                                                    className="text-xs"
                                                                >
                                                                    {c.name}
                                                                </SelectItem>
                                                            ))}
                                                        </SelectContent>
                                                    </Select>

                                                    {/* Series Options Popover */}
                                                    <Popover>
                                                        <PopoverTrigger
                                                            render={
                                                                <Button
                                                                    variant="ghost"
                                                                    size="icon"
                                                                    className="size-7 shrink-0 text-muted-foreground hover:text-foreground"
                                                                />
                                                            }
                                                        >
                                                            <Settings2Icon className="size-3" />
                                                            <span className="sr-only">Series Options</span>
                                                        </PopoverTrigger>
                                                        <PopoverContent className="w-60 p-3 space-y-3" align="end">
                                                            <div className="font-semibold text-xs text-foreground pb-1 border-b">
                                                                Series Options
                                                            </div>
                                                            <div className="space-y-1">
                                                                <label className="text-[11px] font-medium text-foreground">
                                                                    Aggregation
                                                                </label>
                                                                <Select
                                                                    value={series.aggregation || 'sum'}
                                                                    items={[
                                                                        { value: 'sum', label: 'Sum' },
                                                                        { value: 'avg', label: 'Average' },
                                                                        { value: 'count', label: 'Count' },
                                                                        { value: 'min', label: 'Min' },
                                                                        { value: 'max', label: 'Max' },
                                                                    ]}
                                                                    onValueChange={(val) =>
                                                                        handleUpdateSeries(idx, {
                                                                            aggregation: val as
                                                                                | 'sum'
                                                                                | 'avg'
                                                                                | 'count'
                                                                                | 'min'
                                                                                | 'max',
                                                                        })
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-7 text-xs w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="sum" className="text-xs">
                                                                            Sum
                                                                        </SelectItem>
                                                                        <SelectItem value="avg" className="text-xs">
                                                                            Average
                                                                        </SelectItem>
                                                                        <SelectItem value="count" className="text-xs">
                                                                            Count
                                                                        </SelectItem>
                                                                        <SelectItem value="min" className="text-xs">
                                                                            Min
                                                                        </SelectItem>
                                                                        <SelectItem value="max" className="text-xs">
                                                                            Max
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>

                                                            <div className="space-y-1">
                                                                <label className="text-[11px] font-medium text-foreground">
                                                                    Label
                                                                </label>
                                                                <Input
                                                                    value={series.label || ''}
                                                                    onChange={(e) =>
                                                                        handleUpdateSeries(idx, {
                                                                            label: e.target.value,
                                                                        })
                                                                    }
                                                                    placeholder={series.column}
                                                                    className="h-7 text-xs"
                                                                />
                                                            </div>

                                                            <div className="space-y-1">
                                                                <label className="text-[11px] font-medium text-foreground">
                                                                    Color
                                                                </label>
                                                                <div className="flex items-center gap-2">
                                                                    <input
                                                                        type="color"
                                                                        value={series.color || '#3b82f6'}
                                                                        onChange={(e) =>
                                                                            handleUpdateSeries(idx, {
                                                                                color: e.target.value,
                                                                            })
                                                                        }
                                                                        className="size-7 p-0 rounded border cursor-pointer shrink-0"
                                                                    />
                                                                    <Input
                                                                        value={series.color || ''}
                                                                        onChange={(e) =>
                                                                            handleUpdateSeries(idx, {
                                                                                color: e.target.value,
                                                                            })
                                                                        }
                                                                        placeholder="e.g. #3b82f6"
                                                                        className="h-7 text-xs font-mono"
                                                                    />
                                                                </div>
                                                            </div>

                                                            <div className="space-y-1">
                                                                <label className="text-[11px] font-medium text-foreground">
                                                                    Series Type
                                                                </label>
                                                                <Select
                                                                    value={
                                                                        series.type ||
                                                                        (type === 'line' ? 'line' : 'bar')
                                                                    }
                                                                    items={[
                                                                        { value: 'bar', label: 'Bar' },
                                                                        { value: 'line', label: 'Line' },
                                                                    ]}
                                                                    onValueChange={(val) =>
                                                                        handleUpdateSeries(idx, {
                                                                            type: val as 'bar' | 'line',
                                                                        })
                                                                    }
                                                                >
                                                                    <SelectTrigger className="h-7 text-xs w-full">
                                                                        <SelectValue />
                                                                    </SelectTrigger>
                                                                    <SelectContent>
                                                                        <SelectItem value="bar" className="text-xs">
                                                                            Bar
                                                                        </SelectItem>
                                                                        <SelectItem value="line" className="text-xs">
                                                                            Line
                                                                        </SelectItem>
                                                                    </SelectContent>
                                                                </Select>
                                                            </div>
                                                        </PopoverContent>
                                                    </Popover>

                                                    {seriesList.length > 1 && (
                                                        <Button
                                                            variant="ghost"
                                                            size="icon"
                                                            onClick={() => handleRemoveSeries(idx)}
                                                            className="size-7 shrink-0 text-muted-foreground hover:text-destructive"
                                                        >
                                                            <Trash2Icon className="size-3" />
                                                        </Button>
                                                    )}
                                                </div>
                                            ))}

                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleAddSeries}
                                                className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                                            >
                                                <PlusIcon className="size-3.5 mr-1.5" /> Add series
                                            </Button>
                                        </div>

                                        {/* Labeled Switch Rows */}
                                        <div className="space-y-2 pt-2 border-t">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground">Stack</span>
                                                <Switch
                                                    checked={config.stacked}
                                                    onCheckedChange={(val) => updateConfig({ stacked: val })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground">Overlap</span>
                                                <Switch
                                                    checked={config.overlap}
                                                    onCheckedChange={(val) => updateConfig({ overlap: val })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground">Normalize</span>
                                                <Switch
                                                    checked={config.normalize}
                                                    onCheckedChange={(val) => updateConfig({ normalize: val })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground">Show Data Labels</span>
                                                <Switch
                                                    checked={config.showDataLabels}
                                                    onCheckedChange={(val) => updateConfig({ showDataLabels: val })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground">Show Axis Label</span>
                                                <Switch
                                                    checked={config.showAxisLabel !== false}
                                                    onCheckedChange={(val) => updateConfig({ showAxisLabel: val })}
                                                />
                                            </div>
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs text-foreground">Show Scrollbar</span>
                                                <Switch
                                                    checked={config.showScrollbar}
                                                    onCheckedChange={(val) => updateConfig({ showScrollbar: val })}
                                                />
                                            </div>
                                        </div>

                                        {/* Y-Min and Y-Max number inputs */}
                                        <div className="grid grid-cols-2 gap-2 pt-2 border-t">
                                            <div>
                                                <label className="text-[11px] text-muted-foreground block mb-1">
                                                    Y-Min
                                                </label>
                                                <Input
                                                    type="number"
                                                    value={
                                                        config.yMin !== null && config.yMin !== undefined
                                                            ? config.yMin
                                                            : ''
                                                    }
                                                    onChange={(e) =>
                                                        updateConfig({
                                                            yMin: e.target.value === '' ? null : Number(e.target.value),
                                                        })
                                                    }
                                                    placeholder="Auto"
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                            <div>
                                                <label className="text-[11px] text-muted-foreground block mb-1">
                                                    Y-Max
                                                </label>
                                                <Input
                                                    type="number"
                                                    value={
                                                        config.yMax !== null && config.yMax !== undefined
                                                            ? config.yMax
                                                            : ''
                                                    }
                                                    onChange={(e) =>
                                                        updateConfig({
                                                            yMax: e.target.value === '' ? null : Number(e.target.value),
                                                        })
                                                    }
                                                    placeholder="Auto"
                                                    className="h-8 text-xs font-mono"
                                                />
                                            </div>
                                        </div>

                                        {/* Reference Lines */}
                                        <div className="space-y-2 pt-2 border-t">
                                            <div className="flex items-center justify-between">
                                                <span className="text-xs font-medium text-foreground">
                                                    Reference Lines
                                                </span>
                                            </div>
                                            {config.referenceLines?.map((ref, idx) => (
                                                <div
                                                    key={idx}
                                                    className="flex items-center gap-1.5 p-1.5 border rounded-md"
                                                >
                                                    <Input
                                                        value={ref.label}
                                                        onChange={(e) =>
                                                            handleUpdateReferenceLine(idx, { label: e.target.value })
                                                        }
                                                        placeholder="Label"
                                                        className="h-7 text-xs flex-1"
                                                    />
                                                    <Input
                                                        type="number"
                                                        value={ref.value}
                                                        onChange={(e) =>
                                                            handleUpdateReferenceLine(idx, {
                                                                value: Number(e.target.value) || 0,
                                                            })
                                                        }
                                                        placeholder="Value"
                                                        className="h-7 text-xs w-16 font-mono"
                                                    />
                                                    <input
                                                        type="color"
                                                        value={ref.color || '#e11d48'}
                                                        onChange={(e) =>
                                                            handleUpdateReferenceLine(idx, { color: e.target.value })
                                                        }
                                                        className="size-6 p-0 rounded border cursor-pointer shrink-0"
                                                    />
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        onClick={() => handleRemoveReferenceLine(idx)}
                                                        className="size-6 shrink-0 text-muted-foreground hover:text-destructive"
                                                    >
                                                        <Trash2Icon className="size-3" />
                                                    </Button>
                                                </div>
                                            ))}
                                            <Button
                                                variant="ghost"
                                                size="sm"
                                                onClick={handleAddReferenceLine}
                                                className="w-full justify-start text-xs text-muted-foreground hover:text-foreground h-7 px-2"
                                            >
                                                <PlusIcon className="size-3.5 mr-1.5" /> Add reference line
                                            </Button>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>

                                {/* 6. Collapsible section "Split Series" */}
                                <Collapsible open={splitOpen} onOpenChange={setSplitOpen}>
                                    <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                        <span>Split Series</span>
                                        <ChevronDownIcon
                                            className={cn(
                                                'size-3.5 transition-transform text-muted-foreground',
                                                !splitOpen && '-rotate-90'
                                            )}
                                        />
                                    </CollapsibleTrigger>
                                    <CollapsibleContent className="pt-2 space-y-2">
                                        <div className="space-y-1">
                                            <label className="text-[11px] font-medium text-foreground">Split By</label>
                                            <Select
                                                value={config.splitBy || 'none'}
                                                items={[
                                                    { value: 'none', label: '(None) No split' },
                                                    ...availableColumns.map((c) => ({ value: c.name, label: c.name })),
                                                ]}
                                                onValueChange={(val) => {
                                                    updateConfig({
                                                        splitBy: val === 'none' ? undefined : val,
                                                    });
                                                }}
                                            >
                                                <SelectTrigger className="h-8 text-xs w-full">
                                                    <SelectValue placeholder="(None) Single Series" />
                                                </SelectTrigger>
                                                <SelectContent>
                                                    <SelectItem
                                                        value="none"
                                                        className="text-xs italic text-muted-foreground"
                                                    >
                                                        (None) No split
                                                    </SelectItem>
                                                    {availableColumns.map((c) => (
                                                        <SelectItem key={c.name} value={c.name} className="text-xs">
                                                            {c.name}
                                                        </SelectItem>
                                                    ))}
                                                </SelectContent>
                                            </Select>
                                        </div>
                                    </CollapsibleContent>
                                </Collapsible>
                            </>
                        )}

                        {/* ------------------------------------------------------------- */}
                        {/* Controls for NUMBER CARD                                      */}
                        {/* ------------------------------------------------------------- */}
                        {type === 'number' && (
                            <Collapsible open={numberOpen} onOpenChange={setNumberOpen}>
                                <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                    <span>Number Settings</span>
                                    <ChevronDownIcon
                                        className={cn(
                                            'size-3.5 transition-transform text-muted-foreground',
                                            !numberOpen && '-rotate-90'
                                        )}
                                    />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-foreground">Value Column</label>
                                        <Select
                                            value={config.numberValueColumn || config.yAxis?.[0] || ''}
                                            items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
                                            onValueChange={(val) => updateConfig({ numberValueColumn: val })}
                                        >
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue placeholder="Select column..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableColumns.map((c) => (
                                                    <SelectItem key={c.name} value={c.name} className="text-xs">
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-foreground">Aggregation</label>
                                        <Select
                                            value={config.numberAggregation || 'first'}
                                            items={[
                                                { value: 'first', label: 'First Row Value' },
                                                { value: 'sum', label: 'Sum' },
                                                { value: 'avg', label: 'Average' },
                                                { value: 'count', label: 'Count' },
                                                { value: 'min', label: 'Minimum' },
                                                { value: 'max', label: 'Maximum' },
                                            ]}
                                            onValueChange={(val) =>
                                                updateConfig({
                                                    numberAggregation: val as ChartConfigData['numberAggregation'],
                                                })
                                            }
                                        >
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem value="first" className="text-xs">
                                                    First Row Value
                                                </SelectItem>
                                                <SelectItem value="sum" className="text-xs">
                                                    Sum
                                                </SelectItem>
                                                <SelectItem value="avg" className="text-xs">
                                                    Average
                                                </SelectItem>
                                                <SelectItem value="count" className="text-xs">
                                                    Count
                                                </SelectItem>
                                                <SelectItem value="min" className="text-xs">
                                                    Minimum
                                                </SelectItem>
                                                <SelectItem value="max" className="text-xs">
                                                    Maximum
                                                </SelectItem>
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="grid grid-cols-2 gap-2">
                                        <div>
                                            <label className="text-[11px] font-medium text-foreground block mb-1">
                                                Prefix
                                            </label>
                                            <Input
                                                value={config.numberPrefix || ''}
                                                onChange={(e) => updateConfig({ numberPrefix: e.target.value })}
                                                placeholder="$"
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                        <div>
                                            <label className="text-[11px] font-medium text-foreground block mb-1">
                                                Suffix
                                            </label>
                                            <Input
                                                value={config.numberSuffix || ''}
                                                onChange={(e) => updateConfig({ numberSuffix: e.target.value })}
                                                placeholder="USD"
                                                className="h-8 text-xs"
                                            />
                                        </div>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-foreground">Decimals</label>
                                        <Input
                                            type="number"
                                            min={0}
                                            max={10}
                                            value={
                                                config.numberDecimals !== undefined && config.numberDecimals !== null
                                                    ? config.numberDecimals
                                                    : ''
                                            }
                                            onChange={(e) =>
                                                updateConfig({
                                                    numberDecimals:
                                                        e.target.value === '' ? null : Number(e.target.value),
                                                })
                                            }
                                            placeholder="Auto"
                                            className="h-8 text-xs font-mono"
                                        />
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-foreground">
                                            Comparison Column (Optional)
                                        </label>
                                        <Select
                                            value={config.numberComparisonColumn || 'none'}
                                            items={[
                                                { value: 'none', label: '(None) No comparison' },
                                                ...availableColumns.map((c) => ({ value: c.name, label: c.name })),
                                            ]}
                                            onValueChange={(val) =>
                                                updateConfig({
                                                    numberComparisonColumn: val === 'none' ? undefined : val,
                                                })
                                            }
                                        >
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue placeholder="(None)" />
                                            </SelectTrigger>
                                            <SelectContent>
                                                <SelectItem
                                                    value="none"
                                                    className="text-xs italic text-muted-foreground"
                                                >
                                                    (None) No comparison
                                                </SelectItem>
                                                {availableColumns.map((c) => (
                                                    <SelectItem key={c.name} value={c.name} className="text-xs">
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}

                        {/* ------------------------------------------------------------- */}
                        {/* Controls for DONUT                                            */}
                        {/* ------------------------------------------------------------- */}
                        {(type === 'donut' || type === 'pie') && (
                            <Collapsible open={donutOpen} onOpenChange={setDonutOpen}>
                                <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                    <span>Donut Settings</span>
                                    <ChevronDownIcon
                                        className={cn(
                                            'size-3.5 transition-transform text-muted-foreground',
                                            !donutOpen && '-rotate-90'
                                        )}
                                    />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 space-y-3">
                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-foreground">Label Column</label>
                                        <Select
                                            value={config.donutLabelColumn || config.xAxis || ''}
                                            items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
                                            onValueChange={(val) => updateConfig({ donutLabelColumn: val, xAxis: val })}
                                        >
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue placeholder="Select column..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableColumns.map((c) => (
                                                    <SelectItem key={c.name} value={c.name} className="text-xs">
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="space-y-1">
                                        <label className="text-[11px] font-medium text-foreground">Value Column</label>
                                        <Select
                                            value={
                                                config.donutValueColumn ||
                                                config.seriesConfig?.[0]?.column ||
                                                config.yAxis?.[0] ||
                                                ''
                                            }
                                            items={availableColumns.map((c) => ({ value: c.name, label: c.name }))}
                                            onValueChange={(val) =>
                                                updateConfig({
                                                    donutValueColumn: val,
                                                    yAxis: val ? [val] : [],
                                                    seriesConfig: val
                                                        ? [{ column: val, aggregation: 'sum', label: val }]
                                                        : [],
                                                })
                                            }
                                        >
                                            <SelectTrigger className="h-8 text-xs w-full">
                                                <SelectValue placeholder="Select column..." />
                                            </SelectTrigger>
                                            <SelectContent>
                                                {availableColumns.map((c) => (
                                                    <SelectItem key={c.name} value={c.name} className="text-xs">
                                                        {c.name}
                                                    </SelectItem>
                                                ))}
                                            </SelectContent>
                                        </Select>
                                    </div>

                                    <div className="flex items-center justify-between pt-1">
                                        <span className="text-xs text-foreground">Show Legend</span>
                                        <Switch
                                            checked={config.showLegend !== false}
                                            onCheckedChange={(val) => updateConfig({ showLegend: val })}
                                        />
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}

                        {/* ------------------------------------------------------------- */}
                        {/* Controls for TABLE                                            */}
                        {/* ------------------------------------------------------------- */}
                        {type === 'table' && (
                            <Collapsible open={tableOpen} onOpenChange={setTableOpen}>
                                <CollapsibleTrigger className="flex items-center justify-between w-full font-semibold text-xs text-foreground py-1 cursor-pointer select-none">
                                    <span>Visible Columns</span>
                                    <ChevronDownIcon
                                        className={cn(
                                            'size-3.5 transition-transform text-muted-foreground',
                                            !tableOpen && '-rotate-90'
                                        )}
                                    />
                                </CollapsibleTrigger>
                                <CollapsibleContent className="pt-2 space-y-2">
                                    <div className="space-y-1 max-h-56 overflow-y-auto border rounded-md p-2 bg-muted/10">
                                        {availableColumns.map((c) => {
                                            const isChecked = config.visibleColumns
                                                ? config.visibleColumns.includes(c.name)
                                                : true;

                                            return (
                                                <label
                                                    key={c.name}
                                                    className="flex items-center gap-2 text-xs py-1 px-1 rounded hover:bg-muted/40 cursor-pointer"
                                                >
                                                    <input
                                                        type="checkbox"
                                                        checked={isChecked}
                                                        onChange={(e) => {
                                                            const current =
                                                                config.visibleColumns ||
                                                                availableColumns.map((col) => col.name);
                                                            const next = e.target.checked
                                                                ? [...current, c.name]
                                                                : current.filter((x) => x !== c.name);
                                                            updateConfig({ visibleColumns: next });
                                                        }}
                                                        className="rounded size-3.5 border-input text-primary"
                                                    />
                                                    <span className="truncate">{c.name}</span>
                                                </label>
                                            );
                                        })}
                                    </div>
                                </CollapsibleContent>
                            </Collapsible>
                        )}
                    </div>
                </ScrollArea>
            </div>

            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Chart</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &ldquo;{name || 'this chart'}&rdquo;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            onClick={handleConfirmDelete}
                            disabled={isDeleting}
                            className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                        >
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>
        </div>
    );
}
