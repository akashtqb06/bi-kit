'use client';

import React, { useState, useEffect, useRef, useCallback, useMemo, useImperativeHandle } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import {
    DropdownMenu,
    DropdownMenuContent,
    DropdownMenuItem,
    DropdownMenuTrigger,
    DropdownMenuSub,
    DropdownMenuSubTrigger,
    DropdownMenuSubContent,
    DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import {
    PlusIcon,
    PencilIcon,
    RefreshCwIcon,
    CheckIcon,
    AlertCircleIcon,
    MoreHorizontalIcon,
    DownloadIcon,
    CopyIcon,
    Trash2Icon,
    BookOpenIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportDashboardPng } from '@src/lib/chart-actions';
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogFooter,
} from '@/components/ui/dialog';
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
import { Input } from '@/components/ui/input';
import { AddChartDialog } from './add-chart-dialog';
import { AddFilterDialog } from './add-filter-dialog';
import { useDashboardQueryRunner, type AutoRefreshInterval } from './use-query-cache';
import { sanitizeLayout } from './dashboard-grid';
import { nanoid } from 'nanoid';
import { cn } from '@/lib/utils';
import type { DashboardPublic } from '@src/lib/dashboards/service';
import type { ChartPublic } from '@src/lib/charts/service';
import type { QueryPublic } from '@src/lib/queries/service';
import type { LayoutItem, DashboardFilter } from '@src/lib/schemas';

// ---------------------------------------------------------------------------
// Dynamic import of Grid (client-only, prevents SSR hydration mismatch)
// ---------------------------------------------------------------------------

const DynamicDashboardGrid = dynamic(() => import('./dashboard-grid').then((mod) => mod.DashboardGrid), {
    ssr: false,
    loading: () => (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4">
            <Skeleton className="h-64 w-full rounded-lg" />
            <Skeleton className="h-64 w-full rounded-lg" />
        </div>
    ),
});

// ---------------------------------------------------------------------------
// Default sizes by chart type as specified
// number w3 h3, bar/line w6 h8, donut w4 h8, row w6 h8, table w12 h9
// ---------------------------------------------------------------------------

export function getDefaultDimensionsForChartType(type?: string): { w: number; h: number } {
    switch (type) {
        case 'number':
            return { w: 3, h: 3 };
        case 'donut':
        case 'pie':
            return { w: 4, h: 8 };
        case 'table':
            return { w: 12, h: 9 };
        case 'row':
        case 'bar':
        case 'line':
        case 'area':
        default:
            return { w: 6, h: 8 };
    }
}

// ---------------------------------------------------------------------------
// Props
// ---------------------------------------------------------------------------

export interface DashboardEditorProps {
    dashboardId: string;
    workbookId: string;
    gridRef?: React.Ref<HTMLDivElement>;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function DashboardEditor({ dashboardId, workbookId, gridRef }: DashboardEditorProps) {
    const router = useRouter();
    const searchParams = useSearchParams();
    const initialEditMode = searchParams?.get('edit') === 'true';
    const gridContainerRef = useRef<HTMLDivElement>(null);
    const titleInputRef = useRef<HTMLInputElement>(null);

    useImperativeHandle(gridRef, () => gridContainerRef.current as HTMLDivElement);

    // Dashboard core state (single source of truth for both modes)
    const [name, setName] = useState<string>('');
    const [layout, setLayout] = useState<LayoutItem[]>([]);
    const [filters, setFilters] = useState<DashboardFilter[]>([]);
    const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
    const [isEditMode, setIsEditMode] = useState<boolean>(initialEditMode);
    const [prevEditParam, setPrevEditParam] = useState<boolean>(initialEditMode);
    const [selectedWidgetId, setSelectedWidgetId] = useState<string | null>(null);

    if (initialEditMode !== prevEditParam) {
        setPrevEditParam(initialEditMode);
        if (initialEditMode) {
            setIsEditMode(true);
        }
    }

    // Resources & loading
    const [charts, setCharts] = useState<ChartPublic[]>([]);
    const [queries, setQueries] = useState<QueryPublic[]>([]);
    const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);
    const [dashboardLoadFailure, setDashboardLoadFailure] = useState<{ dashboardId: string; message: string } | null>(
        null
    );
    const [loadAttempt, setLoadAttempt] = useState(0);

    // Dialog state
    const [addChartOpen, setAddChartOpen] = useState<boolean>(false);
    const [addFilterOpen, setAddFilterOpen] = useState<boolean>(false);
    const [autoRefresh, setAutoRefresh] = useState<AutoRefreshInterval>('off');
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
    const [isRenameDialogOpen, setIsRenameDialogOpen] = useState<boolean>(false);
    const [renameInput, setRenameInput] = useState<string>('');
    const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState<boolean>(false);
    const [isDeleting, setIsDeleting] = useState<boolean>(false);

    // Autosave state
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');
    const saveTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const isHydrated = useRef<boolean>(false);

    // Chart lookup map: chartId -> ChartPublic
    const chartsMap = useMemo(() => {
        const map = new Map<string, ChartPublic>();
        charts.forEach((c) => map.set(c.id, c));
        return map;
    }, [charts]);

    // Filters lookup map: filterId -> DashboardFilter
    const filtersMap = useMemo(() => {
        const map = new Map<string, DashboardFilter>();
        filters.forEach((f) => map.set(f.id, f));
        return map;
    }, [filters]);

    // Set of chart IDs currently placed on dashboard
    const existingChartIds = useMemo(() => {
        const set = new Set<string>();
        layout.forEach((item) => {
            if (item.chartId) set.add(item.chartId);
        });
        return set;
    }, [layout]);

    // Active query IDs referenced by placed charts
    const activeQueryIds = useMemo(() => {
        const ids: string[] = [];
        for (const item of layout) {
            if (item.chartId) {
                const chart = chartsMap.get(item.chartId);
                if (chart?.queryId) {
                    ids.push(chart.queryId);
                }
            }
        }
        return ids;
    }, [layout, chartsMap]);

    // Query runner with SWR-style caching, auto-refresh, and runtime dashboard filter injection
    const { cache, refetchAll, refetchQuery } = useDashboardQueryRunner(
        queries,
        activeQueryIds,
        autoRefresh,
        filters,
        filterValues
    );

    // Distinct values discovered from query cache for select filters
    const distinctValuesMap = useMemo(() => {
        const map: Record<string, string[]> = {};
        filters.forEach((f) => {
            if (f.type === 'select') {
                const values = new Set<string>();
                Object.values(cache).forEach((entry) => {
                    if (entry.data?.rows && entry.data?.columns) {
                        const colIdx = entry.data.columns.findIndex(
                            (c) => c.name.toLowerCase() === f.column.toLowerCase()
                        );
                        if (colIdx !== -1) {
                            entry.data.rows.forEach((r) => {
                                const val = r[colIdx];
                                if (val !== null && val !== undefined && val !== '') {
                                    values.add(String(val));
                                }
                            });
                        }
                    }
                });
                map[f.column] = Array.from(values).slice(0, 100);
            }
        });
        return map;
    }, [filters, cache]);

    // Available column names from charts and query cache for new filter dialog
    const availableColumns = useMemo(() => {
        const cols = new Set<string>();
        charts.forEach((c) => {
            const cfg = c.config as Record<string, unknown> | undefined;
            if (cfg?.xAxis && typeof cfg.xAxis === 'string') cols.add(cfg.xAxis);
            if (Array.isArray(cfg?.yAxis)) {
                cfg.yAxis.forEach((y) => {
                    if (typeof y === 'string') cols.add(y);
                });
            }
            if (cfg?.series && typeof cfg.series === 'string') cols.add(cfg.series);
            if (cfg?.numberValueColumn && typeof cfg.numberValueColumn === 'string') {
                cols.add(cfg.numberValueColumn);
            }
        });

        Object.values(cache).forEach((entry) => {
            entry.data?.columns?.forEach((col) => cols.add(col.name));
        });

        return Array.from(cols).sort();
    }, [charts, cache]);

    // -------------------------------------------------------------------------
    // Persistence
    // -------------------------------------------------------------------------

    const persistDashboard = useCallback(
        async (currentLayout?: LayoutItem[], currentName?: string, currentFilters?: DashboardFilter[]) => {
            try {
                setSaveStatus('saving');
                const targetName = (currentName !== undefined ? currentName : name).trim() || 'Untitled Dashboard';
                const targetLayout = currentLayout !== undefined ? currentLayout : layout;
                const targetFilters = currentFilters !== undefined ? currentFilters : filters;

                const res = await fetch(`/api/dashboards/${dashboardId}`, {
                    method: 'PUT',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        name: targetName,
                        layout: targetLayout.map((item) => ({
                            i: item.i,
                            chartId: item.chartId,
                            widgetType: item.widgetType || 'chart',
                            title: item.title,
                            text: item.text,
                            filterId: item.filterId,
                            x: Math.max(0, Math.floor(item.x)),
                            y: Math.max(0, Math.floor(item.y)),
                            w: Math.max(2, Math.floor(item.w)),
                            h: Math.max(1, Math.floor(item.h)),
                        })),
                        filters: targetFilters,
                    }),
                });

                if (!res.ok) {
                    const json = await res.json();
                    throw new Error(json.error?.message || json.message || 'Failed to save dashboard');
                }

                setSaveStatus('saved');
            } catch (err) {
                setSaveStatus('idle');
                toast.error(err instanceof Error ? err.message : 'Failed to save dashboard');
            }
        },
        [dashboardId, name, layout, filters]
    );

    // Debounced autosave (800ms)
    const triggerAutosave = useCallback(
        (currentLayout?: LayoutItem[], currentName?: string, currentFilters?: DashboardFilter[]) => {
            if (!isHydrated.current) return;
            if (saveTimeoutRef.current) clearTimeout(saveTimeoutRef.current);
            setSaveStatus('saving');
            saveTimeoutRef.current = setTimeout(() => {
                void persistDashboard(currentLayout, currentName, currentFilters);
            }, 800);
        },
        [persistDashboard]
    );

    // -------------------------------------------------------------------------
    // Fetch dashboard, workbook charts, and queries
    // -------------------------------------------------------------------------

    useEffect(() => {
        let mounted = true;
        isHydrated.current = false;

        async function loadDashboardData() {
            setIsLoadingDashboard(true);
            try {
                const [dashRes, chartsRes, queriesRes] = await Promise.all([
                    fetch(`/api/dashboards/${dashboardId}`),
                    fetch(`/api/charts?workbookId=${workbookId}`),
                    fetch(`/api/queries?workbookId=${workbookId}`),
                ]);

                if (!dashRes.ok || !chartsRes.ok || !queriesRes.ok) {
                    throw new Error('Failed to load dashboard data');
                }
                const dashJson = await dashRes.json();
                const dashData: DashboardPublic = dashJson.data;

                const chartsJson = (await chartsRes.json()) as { data?: ChartPublic[] };
                const chartsData: ChartPublic[] = chartsJson.data || [];

                const queriesJson = (await queriesRes.json()) as { data?: QueryPublic[] };
                const queriesData: QueryPublic[] = queriesJson.data || [];

                if (!dashData || !chartsJson.data || !queriesJson.data) {
                    throw new Error('Dashboard data was incomplete');
                }

                if (!mounted) return;

                setName(dashData.name);
                if (dashData.autoRefresh) setAutoRefresh(dashData.autoRefresh);
                // Sanitize layout on load to clamp min w/h, resolve overlaps and compact vertically
                const sanitized = sanitizeLayout(dashData.layout || []);
                setLayout(sanitized);
                setFilters(dashData.filters || []);
                setCharts(chartsData);
                setQueries(queriesData);

                // If sanitization resolved overlaps or clamped, persist the sanitized result
                if (JSON.stringify(sanitized) !== JSON.stringify(dashData.layout || [])) {
                    void fetch(`/api/dashboards/${dashboardId}`, {
                        method: 'PUT',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({
                            name: dashData.name,
                            layout: sanitized,
                            filters: dashData.filters || [],
                        }),
                    });
                }
            } catch (err) {
                const message = err instanceof Error ? err.message : 'Error loading dashboard';
                setDashboardLoadFailure({ dashboardId, message });
                toast.error('Unable to load dashboard', { description: message });
            } finally {
                if (mounted) {
                    setIsLoadingDashboard(false);
                    setTimeout(() => {
                        isHydrated.current = true;
                    }, 300);
                }
            }
        }

        void loadDashboardData();

        return () => {
            mounted = false;
        };
    }, [dashboardId, loadAttempt, workbookId]);

    // Track view once per page load when in view mode
    const viewTrackedRef = useRef<boolean>(false);
    useEffect(() => {
        if (!viewTrackedRef.current && !isEditMode && dashboardId) {
            viewTrackedRef.current = true;
            fetch(`/api/dashboards/${dashboardId}/view`, { method: 'POST' }).catch(() => {});
        }
    }, [dashboardId, isEditMode]);

    // -------------------------------------------------------------------------
    // Selection Keyboard Shortcuts (Escape clears, Delete/Backspace removes with undo)
    // -------------------------------------------------------------------------

    const handleRemoveTile = useCallback(
        (itemId: string) => {
            const itemToRemove = layout.find((l) => l.i === itemId);
            if (!itemToRemove) return;

            const prevLayout = [...layout];
            const prevFilters = [...filters];

            let nextFilters = filters;
            if (itemToRemove.widgetType === 'filter' && itemToRemove.filterId) {
                nextFilters = filters.filter((f) => f.id !== itemToRemove.filterId);
                setFilters(nextFilters);
            }

            const nextLayout = layout.filter((l) => l.i !== itemId);
            setLayout(nextLayout);
            if (selectedWidgetId === itemId) {
                setSelectedWidgetId(null);
            }
            triggerAutosave(nextLayout, undefined, nextFilters);

            toast('Widget removed from dashboard', {
                action: {
                    label: 'Undo',
                    onClick: () => {
                        setLayout(prevLayout);
                        setFilters(prevFilters);
                        setSelectedWidgetId(itemId);
                        triggerAutosave(prevLayout, undefined, prevFilters);
                    },
                },
            });
        },
        [layout, filters, selectedWidgetId, triggerAutosave]
    );

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            const target = e.target as HTMLElement | null;
            if (
                target &&
                (target.tagName === 'INPUT' ||
                    target.tagName === 'TEXTAREA' ||
                    target.tagName === 'SELECT' ||
                    target.isContentEditable)
            ) {
                return;
            }

            if (e.key === 'Escape') {
                setSelectedWidgetId(null);
            } else if (e.key === 'Delete' || e.key === 'Backspace') {
                if (isEditMode && selectedWidgetId) {
                    e.preventDefault();
                    handleRemoveTile(selectedWidgetId);
                }
            }
        };

        window.addEventListener('keydown', handleKeyDown);
        return () => window.removeEventListener('keydown', handleKeyDown);
    }, [isEditMode, selectedWidgetId, handleRemoveTile]);

    // -------------------------------------------------------------------------
    // Action Handlers
    // -------------------------------------------------------------------------

    const handleDone = async () => {
        if (saveTimeoutRef.current) {
            clearTimeout(saveTimeoutRef.current);
            saveTimeoutRef.current = null;
        }
        await persistDashboard(layout, name, filters);
        setIsEditMode(false);
        setSelectedWidgetId(null);
    };

    const handleLayoutChange = (newLayout: LayoutItem[]) => {
        setLayout(newLayout);
        triggerAutosave(newLayout);
    };

    const handleAddCharts = (selectedCharts: ChartPublic[]) => {
        let currentMaxY = layout.reduce((acc, curr) => Math.max(acc, curr.y + curr.h), 0);
        let currentX = 0;
        const newItems: LayoutItem[] = [];

        for (const chart of selectedCharts) {
            const dims = getDefaultDimensionsForChartType(chart.type);
            let x = currentX;
            let y = currentMaxY;
            if (x + dims.w > 12) {
                x = 0;
                currentMaxY = y + dims.h;
                y = currentMaxY;
            }
            const newItem: LayoutItem = {
                i: `tile_${chart.id}_${nanoid(6)}`,
                chartId: chart.id,
                widgetType: 'chart',
                x,
                y,
                w: dims.w,
                h: dims.h,
            };
            newItems.push(newItem);
            currentX = x + dims.w;
            if (currentX >= 12) {
                currentX = 0;
                currentMaxY = y + dims.h;
            }
        }

        const nextLayout = [...layout, ...newItems];
        setLayout(nextLayout);
        triggerAutosave(nextLayout);

        if (newItems.length > 0) {
            const firstNewId = newItems[0].i;
            setSelectedWidgetId(firstNewId);
            setTimeout(() => {
                document.getElementById(`widget-${firstNewId}`)?.scrollIntoView({
                    behavior: 'smooth',
                    block: 'nearest',
                });
            }, 100);
        }

        toast.success(`Added ${newItems.length} chart${newItems.length > 1 ? 's' : ''}`);
    };

    const handleAddTextWidget = () => {
        const maxY = layout.reduce((acc, curr) => Math.max(acc, curr.y + curr.h), 0);
        const newTextItem: LayoutItem = {
            i: `text_${nanoid(6)}`,
            widgetType: 'text',
            title: '',
            text: '### Note\nDouble-click to edit this note...',
            x: 0,
            y: maxY,
            w: 12,
            h: 2,
        };
        const nextLayout = [...layout, newTextItem];
        setLayout(nextLayout);
        triggerAutosave(nextLayout);
        setSelectedWidgetId(newTextItem.i);
        setTimeout(() => {
            document.getElementById(`widget-${newTextItem.i}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }, 100);
        toast.success('Added text widget');
    };

    const handleAddFilter = (newFilter: DashboardFilter) => {
        const maxY = layout.reduce((acc, curr) => Math.max(acc, curr.y + curr.h), 0);
        const newFilterItem: LayoutItem = {
            i: `filter_${newFilter.id}_${nanoid(6)}`,
            widgetType: 'filter',
            filterId: newFilter.id,
            title: newFilter.name,
            x: 0,
            y: maxY,
            w: 4,
            h: 2,
        };
        const nextFilters = [...filters, newFilter];
        const nextLayout = [...layout, newFilterItem];
        setFilters(nextFilters);
        setLayout(nextLayout);
        triggerAutosave(nextLayout, undefined, nextFilters);
        setSelectedWidgetId(newFilterItem.i);
        setTimeout(() => {
            document.getElementById(`widget-${newFilterItem.i}`)?.scrollIntoView({
                behavior: 'smooth',
                block: 'nearest',
            });
        }, 100);
        toast.success(`Added filter "${newFilter.name}"`);
    };

    const handleUpdateText = (itemId: string, newText: string) => {
        const nextLayout = layout.map((item) =>
            item.i === itemId ? { ...item, text: newText } : item
        );
        setLayout(nextLayout);
        triggerAutosave(nextLayout);
    };

    const handleEditWidget = async (itemId: string) => {
        const item = layout.find((l) => l.i === itemId);
        if (!item) return;

        if (item.chartId) {
            if (saveTimeoutRef.current) {
                clearTimeout(saveTimeoutRef.current);
                saveTimeoutRef.current = null;
            }
            await persistDashboard(layout, name, filters);
            router.push(`/workbooks/${workbookId}/chart/${item.chartId}`);
        }
    };

    const handleFilterValueChange = (filterId: string, value: unknown) => {
        setFilterValues((prev) => ({
            ...prev,
            [filterId]: value,
        }));
    };

    const handleExportPng = async () => {
        if (!gridContainerRef.current) return;
        await exportDashboardPng(gridContainerRef.current, name || 'dashboard', charts);
    };

    const handleDuplicate = async () => {
        try {
            const res = await fetch(`/api/dashboards/${dashboardId}/duplicate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: `${name} (Copy)` }),
            });
            if (!res.ok) throw new Error('Failed to duplicate dashboard');
            const json = await res.json();
            toast.success('Dashboard duplicated');
            router.push(`/workbooks/${workbookId}/dashboard/${json.data.id}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to duplicate dashboard');
        }
    };

    const handleSetAutoRefresh = async (interval: AutoRefreshInterval) => {
        setAutoRefresh(interval);
        try {
            const res = await fetch(`/api/dashboards/${dashboardId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ autoRefresh: interval }),
            });
            if (!res.ok) throw new Error('Failed to update auto refresh');
            toast.success(`Auto refresh set to ${interval === 'off' ? 'Off' : interval}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to update auto refresh');
        }
    };

    const handleConfirmRename = async () => {
        const trimmed = renameInput.trim();
        if (!trimmed) {
            toast.error('Dashboard name cannot be empty');
            return;
        }
        setName(trimmed);
        setIsRenameDialogOpen(false);
        try {
            await persistDashboard(layout, trimmed, filters);
            toast.success('Dashboard renamed');
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to rename dashboard');
        }
    };

    const handleConfirmDelete = async () => {
        setIsDeleting(true);
        try {
            const res = await fetch(`/api/dashboards/${dashboardId}`, {
                method: 'DELETE',
            });
            if (!res.ok) throw new Error('Failed to delete dashboard');
            toast.success('Dashboard deleted');
            setIsDeleteDialogOpen(false);
            router.push(`/workbooks/${workbookId}`);
        } catch (err) {
            toast.error(err instanceof Error ? err.message : 'Failed to delete dashboard');
        } finally {
            setIsDeleting(false);
        }
    };

    const handleDuplicateTile = (itemId: string) => {
        const item = layout.find((l) => l.i === itemId);
        if (!item) return;
        const maxY = layout.reduce((acc, curr) => Math.max(acc, curr.y + curr.h), 0);
        const newItem: LayoutItem = {
            ...item,
            i: `${item.widgetType || 'widget'}_${nanoid(6)}`,
            x: 0,
            y: maxY,
        };
        const nextLayout = [...layout, newItem];
        setLayout(nextLayout);
        triggerAutosave(nextLayout);
        setSelectedWidgetId(newItem.i);
        toast.success('Widget duplicated');
    };

    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refetchAll();
            toast.success('Refreshed');
        } catch {
            toast.error('Failed to refresh data');
        } finally {
            setIsRefreshing(false);
        }
    };

    // -------------------------------------------------------------------------
    // Skeletons and Errors
    // -------------------------------------------------------------------------

    if (isLoadingDashboard) {
        return (
            <div className="flex h-full w-full flex-col bg-background">
                <div className="flex h-12 items-center justify-between border-b px-4">
                    <Skeleton className="h-6 w-48 rounded" />
                    <Skeleton className="h-8 w-44 rounded" />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-4 flex-1">
                    <Skeleton className="h-72 w-full rounded-lg" />
                    <Skeleton className="h-72 w-full rounded-lg" />
                </div>
            </div>
        );
    }

    const dashboardLoadError =
        dashboardLoadFailure?.dashboardId === dashboardId ? dashboardLoadFailure.message : null;

    if (dashboardLoadError) {
        return (
            <div className="flex h-full items-center justify-center p-6 bg-background">
                <div className="w-full max-w-lg space-y-3">
                    <Alert variant="destructive">
                        <AlertCircleIcon className="size-4" />
                        <AlertTitle>Dashboard could not be loaded</AlertTitle>
                        <AlertDescription>{dashboardLoadError}</AlertDescription>
                    </Alert>
                    <Button
                        variant="outline"
                        onClick={() => {
                            setDashboardLoadFailure(null);
                            setLoadAttempt((attempt) => attempt + 1);
                        }}
                    >
                        <RefreshCwIcon className="mr-2 size-4" /> Retry
                    </Button>
                </div>
            </div>
        );
    }

    return (
        <div className="flex h-full w-full flex-col min-h-0 min-w-0 overflow-hidden bg-background">
            {/* ------------------------------------------------------------------- */}
            {/* TOOLBAR: ONE slim row (h-12, px-4, border-b) */}
            {/* ------------------------------------------------------------------- */}
            <div className="h-12 px-4 border-b bg-card shrink-0 flex items-center justify-between gap-3 select-none">
                {/* Left: Dashboard title as plain text (inline-editable on click in edit mode) */}
                <div className="flex items-center min-w-0">
                    {isEditMode ? (
                        <input
                            ref={titleInputRef}
                            type="text"
                            value={name}
                            onChange={(e) => {
                                setName(e.target.value);
                                triggerAutosave(undefined, e.target.value);
                            }}
                            placeholder="Untitled Dashboard"
                            className="text-lg font-semibold text-foreground bg-transparent border-none outline-none focus:ring-0 p-0 hover:bg-muted/40 focus:bg-muted/40 rounded px-1.5 -ml-1.5 transition-colors cursor-text max-w-sm sm:max-w-md truncate"
                        />
                    ) : (
                        <h1
                            className="text-lg font-semibold text-foreground truncate max-w-sm sm:max-w-md"
                            title={name || 'Untitled Dashboard'}
                        >
                            {name || 'Untitled Dashboard'}
                        </h1>
                    )}

                    {/* Quiet "Saving... / Saved" text next to the title in edit mode */}
                    {isEditMode && (
                        <span className="text-xs text-muted-foreground font-normal ml-3 select-none">
                            {saveStatus === 'saving' ? 'Saving...' : saveStatus === 'saved' ? 'Saved' : ''}
                        </span>
                    )}
                </div>

                {/* Right Controls */}
                <div className="flex items-center gap-2 shrink-0">
                    {isEditMode ? (
                        <>
                            {/* Outline "+ Chart" */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAddChartOpen(true)}
                                className="h-8 text-xs gap-1.5 font-medium cursor-pointer"
                            >
                                <PlusIcon className="size-3.5" />
                                Chart
                            </Button>

                            {/* Outline "+ Filter" */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => setAddFilterOpen(true)}
                                className="h-8 text-xs gap-1.5 font-medium cursor-pointer"
                            >
                                <PlusIcon className="size-3.5" />
                                Filter
                            </Button>

                            {/* Outline "+ Text" */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={handleAddTextWidget}
                                className="h-8 text-xs gap-1.5 font-medium cursor-pointer"
                            >
                                <PlusIcon className="size-3.5" />
                                Text
                            </Button>

                            {/* Primary "Done" Button with check icon */}
                            <Button
                                variant="default"
                                size="sm"
                                onClick={() => void handleDone()}
                                className="h-8 text-xs gap-1.5 font-medium cursor-pointer"
                            >
                                <CheckIcon className="size-3.5" />
                                Done
                            </Button>
                        </>
                    ) : (
                        <>
                            {/* View mode: Outline "Refresh" Button */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => void handleManualRefresh()}
                                disabled={isRefreshing}
                                className="h-8 text-xs gap-1.5 font-normal cursor-pointer"
                            >
                                <RefreshCwIcon className={cn('size-3.5', isRefreshing && 'animate-spin')} />
                                Refresh
                            </Button>

                            {/* View mode: Outline "Edit" Button */}
                            <Button
                                variant="outline"
                                size="sm"
                                onClick={() => {
                                    setIsEditMode(true);
                                    setSelectedWidgetId(null);
                                }}
                                className="h-8 text-xs gap-1.5 font-normal cursor-pointer"
                            >
                                <PencilIcon className="size-3.5" />
                                Edit
                            </Button>
                        </>
                    )}

                    {/* "..." outline icon button opening DropdownMenu */}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    className="size-8 cursor-pointer"
                                    aria-label="Dashboard options"
                                />
                            }
                        >
                            <MoreHorizontalIcon className="size-4" />
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 no-drag">
                            <DropdownMenuSub>
                                <DropdownMenuSubTrigger className="text-xs">
                                    Auto refresh: {autoRefresh === 'off' ? 'Off' : autoRefresh}
                                </DropdownMenuSubTrigger>
                                <DropdownMenuSubContent className="w-36 no-drag">
                                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => void handleSetAutoRefresh('off')}>
                                        Off {autoRefresh === 'off' && '✓'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => void handleSetAutoRefresh('30s')}>
                                        Every 30s {autoRefresh === '30s' && '✓'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => void handleSetAutoRefresh('1m')}>
                                        Every 1m {autoRefresh === '1m' && '✓'}
                                    </DropdownMenuItem>
                                    <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => void handleSetAutoRefresh('5m')}>
                                        Every 5m {autoRefresh === '5m' && '✓'}
                                    </DropdownMenuItem>
                                </DropdownMenuSubContent>
                            </DropdownMenuSub>

                            <DropdownMenuItem
                                className="text-xs cursor-pointer"
                                onClick={() => {
                                    setRenameInput(name);
                                    setIsRenameDialogOpen(true);
                                }}
                            >
                                <PencilIcon className="mr-2 size-3.5" />
                                Rename
                            </DropdownMenuItem>

                            <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => void handleDuplicate()}>
                                <CopyIcon className="mr-2 size-3.5" />
                                Duplicate
                            </DropdownMenuItem>

                            <DropdownMenuItem className="text-xs cursor-pointer" onClick={() => void handleExportPng()}>
                                <DownloadIcon className="mr-2 size-3.5" />
                                Export as PNG
                            </DropdownMenuItem>

                            <DropdownMenuItem
                                className="text-xs cursor-pointer"
                                onClick={() => router.push(`/workbooks/${workbookId}`)}
                            >
                                <BookOpenIcon className="mr-2 size-3.5" />
                                Open Workbook
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                variant="destructive"
                                className="text-xs text-destructive cursor-pointer"
                                onClick={() => setIsDeleteDialogOpen(true)}
                            >
                                <Trash2Icon className="mr-2 size-3.5" />
                                Delete
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* ------------------------------------------------------------------- */}
            {/* FULL WIDTH SCROLL CONTAINER: Single scrollbar, pt-4, stable scrollbar */}
            {/* Pill overlapping top edge is never clipped because of pt-4 */}
            {/* ------------------------------------------------------------------- */}
            <div
                ref={gridContainerRef}
                className="flex-1 min-h-0 min-w-0 w-full overflow-y-auto [scrollbar-gutter:stable] px-4 pt-4 pb-8 bg-background"
                onClick={(e) => {
                    // Clicking empty space in scroll container clears selection
                    if (e.target === e.currentTarget) {
                        setSelectedWidgetId(null);
                    }
                }}
            >
                <DynamicDashboardGrid
                    items={layout}
                    chartsMap={chartsMap}
                    filtersMap={filtersMap}
                    filterValues={filterValues}
                    onFilterValueChange={handleFilterValueChange}
                    distinctValuesMap={distinctValuesMap}
                    cache={cache}
                    isEditMode={isEditMode}
                    selectedWidgetId={selectedWidgetId}
                    onSelectWidget={setSelectedWidgetId}
                    onEditWidget={handleEditWidget}
                    onUpdateText={handleUpdateText}
                    onLayoutChange={handleLayoutChange}
                    onOpenChart={(chartId) => router.push(`/workbooks/${workbookId}/chart/${chartId}`)}
                    onRefreshQuery={(qId) => void refetchQuery(qId)}
                    onRemoveTile={handleRemoveTile}
                    onDuplicateTile={handleDuplicateTile}
                    onAddChartClick={() => setAddChartOpen(true)}
                />
            </div>

            {/* Rename Dialog */}
            <Dialog open={isRenameDialogOpen} onOpenChange={setIsRenameDialogOpen}>
                <DialogContent className="max-w-sm">
                    <DialogHeader>
                        <DialogTitle>Rename Dashboard</DialogTitle>
                    </DialogHeader>
                    <div className="py-2">
                        <Input
                            value={renameInput}
                            onChange={(e) => setRenameInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter') {
                                    void handleConfirmRename();
                                }
                            }}
                            placeholder="Dashboard name"
                            autoFocus
                            className="h-8 text-xs"
                        />
                    </div>
                    <DialogFooter>
                        <Button variant="outline" size="sm" onClick={() => setIsRenameDialogOpen(false)}>
                            Cancel
                        </Button>
                        <Button size="sm" onClick={() => void handleConfirmRename()}>
                            Save
                        </Button>
                    </DialogFooter>
                </DialogContent>
            </Dialog>

            {/* Delete Confirmation Dialog */}
            <AlertDialog open={isDeleteDialogOpen} onOpenChange={setIsDeleteDialogOpen}>
                <AlertDialogContent>
                    <AlertDialogHeader>
                        <AlertDialogTitle>Delete Dashboard</AlertDialogTitle>
                        <AlertDialogDescription>
                            Are you sure you want to delete &ldquo;{name}&rdquo;? This action cannot be undone.
                        </AlertDialogDescription>
                    </AlertDialogHeader>
                    <AlertDialogFooter>
                        <AlertDialogCancel disabled={isDeleting}>Cancel</AlertDialogCancel>
                        <AlertDialogAction
                            variant="destructive"
                            onClick={() => void handleConfirmDelete()}
                            disabled={isDeleting}
                        >
                            <Trash2Icon className="mr-1.5 size-4" />
                            {isDeleting ? 'Deleting...' : 'Delete'}
                        </AlertDialogAction>
                    </AlertDialogFooter>
                </AlertDialogContent>
            </AlertDialog>

            {/* Select Charts Dialog */}
            <AddChartDialog
                open={addChartOpen}
                onOpenChange={setAddChartOpen}
                charts={charts}
                existingChartIds={existingChartIds}
                onAddCharts={handleAddCharts}
            />

            {/* Add Filter Dialog */}
            <AddFilterDialog
                open={addFilterOpen}
                onOpenChange={setAddFilterOpen}
                availableColumns={availableColumns}
                onAddFilter={handleAddFilter}
            />
        </div>
    );
}
