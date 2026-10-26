'use client';

import React, { use, useState, useEffect, useRef, useCallback, useMemo, Suspense } from 'react';
import dynamic from 'next/dynamic';
import { useRouter, useSearchParams, usePathname, notFound } from 'next/navigation';
import Link from 'next/link';
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
    Breadcrumb,
    BreadcrumbItem,
    BreadcrumbLink,
    BreadcrumbList,
    BreadcrumbPage,
    BreadcrumbSeparator,
} from '@/components/ui/breadcrumb';
import {
    RefreshCwIcon,
    AlertCircleIcon,
    ArrowLeftIcon,
    MoreHorizontalIcon,
    DownloadIcon,
    BookOpenIcon,
    XIcon,
} from 'lucide-react';
import { toast } from 'sonner';
import { exportDashboardPng, openDashboardInWorkbook } from '@src/lib/chart-actions';
import { useDashboardQueryRunner, type AutoRefreshInterval } from '@src/components/dashboards/use-query-cache';
import { sanitizeLayout } from '@src/components/dashboards/dashboard-grid';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import type { DashboardPublic } from '@src/lib/dashboards/service';
import type { ChartPublic } from '@src/lib/charts/service';
import type { QueryPublic } from '@src/lib/queries/service';
import type { DashboardFilter } from '@src/lib/schemas';

// ---------------------------------------------------------------------------
// Dynamic import of Grid (client-only, prevents SSR hydration mismatch)
// ---------------------------------------------------------------------------

const DynamicDashboardGrid = dynamic(
    () => import('@src/components/dashboards/dashboard-grid').then((mod) => mod.DashboardGrid),
    {
        ssr: false,
        loading: () => (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 p-6">
                <Skeleton className="h-64 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        ),
    }
);

// ---------------------------------------------------------------------------
// Helpers: Filter params serialization / deserialization
// ---------------------------------------------------------------------------

function parseFiltersFromSearchParams(
    filters: DashboardFilter[],
    searchParams: URLSearchParams
): Record<string, unknown> {
    const values: Record<string, unknown> = {};

    for (const f of filters) {
        const raw = searchParams.get(`filter_${f.id}`) || searchParams.get(f.column);
        if (!raw) continue;

        if (f.type === 'date_range') {
            const parts = raw.split('..');
            if (parts.length === 2) {
                const fromDate = parts[0] ? new Date(parts[0]) : undefined;
                const toDate = parts[1] ? new Date(parts[1]) : undefined;
                if ((fromDate && !Number.isNaN(fromDate.getTime())) || (toDate && !Number.isNaN(toDate.getTime()))) {
                    values[f.id] = { from: fromDate, to: toDate };
                }
            }
        } else if (f.type === 'select') {
            values[f.id] = raw;
        }
    }

    return values;
}

function syncFiltersToSearchParams(
    filters: DashboardFilter[],
    values: Record<string, unknown>,
    pathname: string,
    currentSearchParams: URLSearchParams
) {
    const next = new URLSearchParams(currentSearchParams.toString());

    for (const f of filters) {
        const key = `filter_${f.id}`;
        const val = values[f.id];

        if (val === undefined || val === null || val === '' || val === '__all__') {
            next.delete(key);
            next.delete(f.column);
        } else if (f.type === 'date_range') {
            const range = val as { from?: Date | string; to?: Date | string };
            if (range.from || range.to) {
                const fromStr = range.from ? format(new Date(range.from), 'yyyy-MM-dd') : '';
                const toStr = range.to ? format(new Date(range.to), 'yyyy-MM-dd') : '';
                next.set(key, `${fromStr}..${toStr}`);
            } else {
                next.delete(key);
                next.delete(f.column);
            }
        } else if (f.type === 'select') {
            next.set(key, String(val));
        }
    }

    const queryStr = next.toString();
    const newUrl = queryStr ? `${pathname}?${queryStr}` : pathname;
    window.history.replaceState(null, '', newUrl);
}

// ---------------------------------------------------------------------------
// Dashboard Viewer Content Component
// ---------------------------------------------------------------------------

function DashboardViewerContent({ params }: { params: Promise<{ did: string }> }) {
    const { did: dashboardId } = use(params);
    const router = useRouter();
    const pathname = usePathname();
    const searchParams = useSearchParams();

    const gridContainerRef = useRef<HTMLDivElement>(null);

    // Dashboard data
    const [dashboard, setDashboard] = useState<DashboardPublic | null>(null);
    const [charts, setCharts] = useState<ChartPublic[]>([]);
    const [queries, setQueries] = useState<QueryPublic[]>([]);
    const [isLoading, setIsLoading] = useState<boolean>(true);
    const [loadError, setLoadError] = useState<string | null>(null);
    const [loadAttempt, setLoadAttempt] = useState<number>(0);

    // Interactive state
    const [autoRefresh, setAutoRefresh] = useState<AutoRefreshInterval>('off');
    const [filterValues, setFilterValues] = useState<Record<string, unknown>>({});
    const [isRefreshing, setIsRefreshing] = useState<boolean>(false);

    // Initial filter hydration tracker
    const filtersHydrated = useRef<boolean>(false);

    // Load dashboard, charts, queries
    useEffect(() => {
        let active = true;

        async function load() {
            try {
                const dashRes = await fetch(`/api/dashboards/${dashboardId}`);
                if (!dashRes.ok) {
                    if (dashRes.status === 404 || dashRes.status === 403) {
                        notFound();
                    }
                    throw new Error('Failed to load dashboard');
                }
                const dashJson = await dashRes.json();
                const dash: DashboardPublic = dashJson.data;

                const [chartsRes, queriesRes] = await Promise.all([
                    fetch(`/api/charts?workbookId=${dash.workbookId}`),
                    fetch(`/api/queries?workbookId=${dash.workbookId}`),
                ]);

                if (!chartsRes.ok || !queriesRes.ok) {
                    throw new Error('Failed to load dashboard resources');
                }

                const chartsJson = await chartsRes.json();
                const queriesJson = await queriesRes.json();

                if (!active) return;

                // Sanitize layout to ensure minimum dimensions and eliminate overlaps
                dash.layout = sanitizeLayout(dash.layout || []);
                setDashboard(dash);
                if (dash.autoRefresh) {
                    setAutoRefresh(dash.autoRefresh);
                }
                setCharts(chartsJson.data || []);
                setQueries(queriesJson.data || []);

                if (!filtersHydrated.current && dash.filters && searchParams) {
                    const parsed = parseFiltersFromSearchParams(dash.filters, searchParams);
                    setFilterValues(parsed);
                    filtersHydrated.current = true;
                }

                setIsLoading(false);
            } catch (err) {
                if (!active) return;
                setLoadError(err instanceof Error ? err.message : 'Unknown error');
                setIsLoading(false);
            }
        }

        void load();

        return () => {
            active = false;
        };
    }, [dashboardId, loadAttempt, searchParams]);

    // Track view once per page load
    const viewTrackedRef = useRef<boolean>(false);
    useEffect(() => {
        if (!viewTrackedRef.current && dashboardId) {
            viewTrackedRef.current = true;
            fetch(`/api/dashboards/${dashboardId}/view`, { method: 'POST' }).catch(() => {});
        }
    }, [dashboardId]);

    // Fast chart lookup map
    const chartsMap = useMemo(() => {
        const map = new Map<string, ChartPublic>();
        charts.forEach((c) => map.set(c.id, c));
        return map;
    }, [charts]);

    // Extract active query IDs referenced by placed charts
    const activeQueryIds = useMemo(() => {
        if (!dashboard?.layout) return [];
        const ids: string[] = [];
        for (const item of dashboard.layout) {
            if (item.chartId) {
                const chart = chartsMap.get(item.chartId);
                if (chart?.queryId) {
                    ids.push(chart.queryId);
                }
            }
        }
        return ids;
    }, [dashboard, chartsMap]);

    // Query runner for all charts on this dashboard
    const { cache, refetchAll, refetchQuery } = useDashboardQueryRunner(
        queries,
        activeQueryIds,
        autoRefresh,
        dashboard?.filters || [],
        filterValues
    );

    // Sync filter values to URL query params
    const handleFilterValueChange = useCallback(
        (filterId: string, value: unknown) => {
            setFilterValues((prev) => {
                const next = { ...prev, [filterId]: value };
                if (dashboard?.filters) {
                    syncFiltersToSearchParams(dashboard.filters, next, pathname, searchParams);
                }
                return next;
            });
        },
        [dashboard, pathname, searchParams]
    );

    const handleClearAllFilters = useCallback(() => {
        setFilterValues({});
        if (dashboard?.filters) {
            syncFiltersToSearchParams(dashboard.filters, {}, pathname, searchParams);
        }
    }, [dashboard, pathname, searchParams]);

    // Manual refresh action
    const handleManualRefresh = async () => {
        setIsRefreshing(true);
        try {
            await refetchAll();
            toast.success('Dashboard refreshed');
        } catch {
            toast.error('Failed to refresh data');
        } finally {
            setIsRefreshing(false);
        }
    };

    // Auto refresh action with dashboard persistence
    const handleSetAutoRefresh = async (interval: AutoRefreshInterval) => {
        setAutoRefresh(interval);
        if (!dashboard?.id) return;
        try {
            const res = await fetch(`/api/dashboards/${dashboard.id}`, {
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

    // Export as PNG
    const handleExportPng = async () => {
        if (!gridContainerRef.current) return;
        await exportDashboardPng(
            gridContainerRef.current,
            dashboard?.name || dashboard?.title || 'dashboard',
            charts
        );
    };

    // Build distinct value lists for select filters
    const distinctValuesMap = useMemo(() => {
        const map: Record<string, string[]> = {};
        dashboard?.filters?.forEach((f) => {
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
                map[f.column] = Array.from(values).sort();
            }
        });
        return map;
    }, [dashboard, cache]);

    const filtersMap = useMemo(() => {
        const map = new Map<string, DashboardFilter>();
        dashboard?.filters?.forEach((f) => map.set(f.id, f));
        return map;
    }, [dashboard]);

    // Loading State
    if (isLoading) {
        return <DashboardViewerSkeleton />;
    }

    // Error State
    if (loadError || !dashboard) {
        return (
            <div className="flex flex-1 flex-col items-center justify-center p-8 gap-4 bg-background">
                <Alert variant="destructive" className="max-w-md">
                    <AlertCircleIcon className="size-4" />
                    <AlertTitle>Dashboard not found or could not be loaded</AlertTitle>
                    <AlertDescription>{loadError || 'The requested dashboard could not be loaded.'}</AlertDescription>
                </Alert>
                <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => router.push('/dashboards')}>
                        <ArrowLeftIcon className="mr-1.5 size-4" />
                        Back to Dashboards
                    </Button>
                    <Button
                        size="sm"
                        onClick={() => {
                            setIsLoading(true);
                            setLoadError(null);
                            setLoadAttempt((a) => a + 1);
                        }}
                    >
                        <RefreshCwIcon className="mr-1.5 size-4" />
                        Retry
                    </Button>
                </div>
            </div>
        );
    }

    const editUrl = `/workbooks/${dashboard.workbookId}/dashboard/${dashboard.id}`;
    const activeFilterCount = Object.values(filterValues).filter(
        (v) => v !== undefined && v !== null && v !== '' && v !== '__all__'
    ).length;

    return (
        <div className="flex flex-1 flex-col min-h-0 min-w-0 w-full overflow-hidden bg-background">
            {/* ------------------------------------------------------------------- */}
            {/* Standalone Viewer Header: ONE slim row (h-12, border-b, px-4) */}
            {/* Left: breadcrumb / title as plain text */}
            {/* Right: Refresh outline button (icon + label) + "..." outline icon button */}
            {/* ------------------------------------------------------------------- */}
            <div className="h-12 border-b px-4 shrink-0 flex items-center justify-between gap-3 bg-card select-none">
                {/* Left: Breadcrumbs & inline filter chips */}
                <div className="flex items-center gap-3 min-w-0">
                    <Breadcrumb>
                        <BreadcrumbList>
                            <BreadcrumbItem>
                                <BreadcrumbLink render={<Link href="/dashboards" />}>
                                    Dashboards
                                </BreadcrumbLink>
                            </BreadcrumbItem>
                            <BreadcrumbSeparator />
                            <BreadcrumbItem>
                                <BreadcrumbPage className="text-lg font-semibold text-foreground truncate max-w-[200px] sm:max-w-[320px]">
                                    {dashboard.title || dashboard.name}
                                </BreadcrumbPage>
                            </BreadcrumbItem>
                        </BreadcrumbList>
                    </Breadcrumb>

                    {/* Filter chips (only when filters exist) */}
                    {dashboard.filters && dashboard.filters.length > 0 && (
                        <div className="hidden sm:flex items-center gap-1.5 overflow-x-auto max-w-md shrink-0 py-0.5 ml-2">
                            {dashboard.filters.map((f) => {
                                if (f.type === 'select') {
                                    const curVal = String(filterValues[f.id] ?? '__all__');
                                    return (
                                        <div
                                            key={f.id}
                                            className="flex items-center gap-1 bg-muted/50 border rounded-md px-1.5 py-0.5 text-xs shrink-0"
                                        >
                                            <span className="text-[11px] text-muted-foreground">{f.name}:</span>
                                            <select
                                                value={curVal}
                                                onChange={(e) =>
                                                    handleFilterValueChange(
                                                        f.id,
                                                        e.target.value === '__all__' ? undefined : e.target.value
                                                    )
                                                }
                                                className="bg-transparent text-xs font-medium outline-none cursor-pointer text-foreground"
                                            >
                                                <option value="__all__">All</option>
                                                {(distinctValuesMap[f.column] || []).map((val) => (
                                                    <option key={val} value={val}>
                                                        {val}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    );
                                }
                                return null;
                            })}
                            {activeFilterCount > 0 && (
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    className="h-6 text-[11px] px-1.5 text-muted-foreground hover:text-foreground shrink-0 gap-1"
                                    onClick={handleClearAllFilters}
                                >
                                    <XIcon className="size-3" /> Clear
                                </Button>
                            )}
                        </div>
                    )}
                </div>

                {/* Right controls: Refresh outline button and "..." outline icon button */}
                <div className="flex items-center gap-2 shrink-0">
                    {/* Refresh outline button (icon + label) */}
                    <Button
                        variant="outline"
                        size="sm"
                        className="h-8 text-xs gap-1.5 font-normal cursor-pointer"
                        onClick={() => void handleManualRefresh()}
                        disabled={isRefreshing}
                    >
                        <RefreshCwIcon className={cn('size-3.5', isRefreshing && 'animate-spin')} />
                        <span>Refresh</span>
                    </Button>

                    {/* "..." outline icon button */}
                    <DropdownMenu>
                        <DropdownMenuTrigger
                            render={
                                <Button
                                    variant="outline"
                                    size="icon-sm"
                                    className="size-8 cursor-pointer"
                                    aria-label="Dashboard actions"
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
                                    void handleExportPng();
                                }}
                            >
                                <DownloadIcon className="mr-2 size-3.5" />
                                Export as PNG
                            </DropdownMenuItem>

                            <DropdownMenuSeparator />

                            <DropdownMenuItem
                                className="text-xs cursor-pointer"
                                onClick={() => {
                                    openDashboardInWorkbook(router, dashboard.workbookId, dashboard.id);
                                }}
                            >
                                <BookOpenIcon className="mr-2 size-3.5" />
                                Open Workbook
                            </DropdownMenuItem>
                        </DropdownMenuContent>
                    </DropdownMenu>
                </div>
            </div>

            {/* ------------------------------------------------------------------- */}
            {/* ONE Single Scroller holding the grid */}
            {/* ------------------------------------------------------------------- */}
            <div
                ref={gridContainerRef}
                className="flex-1 min-h-0 min-w-0 w-full overflow-y-auto [scrollbar-gutter:stable] px-4 pt-4 pb-8 bg-background"
            >
                <DynamicDashboardGrid
                    items={dashboard.layout || []}
                    chartsMap={chartsMap}
                    filtersMap={filtersMap}
                    filterValues={filterValues}
                    onFilterValueChange={handleFilterValueChange}
                    distinctValuesMap={distinctValuesMap}
                    cache={cache}
                    isEditMode={false}
                    onLayoutChange={() => {}}
                    onOpenChart={(chartId) => router.push(`/workbooks/${dashboard.workbookId}/chart/${chartId}`)}
                    onRefreshQuery={(queryId) => refetchQuery(queryId)}
                    onRemoveTile={() => {}}
                    onEditInWorkbook={() => router.push(editUrl)}
                />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Skeleton Loading Fallback
// ---------------------------------------------------------------------------

function DashboardViewerSkeleton() {
    return (
        <div className="flex flex-1 flex-col min-h-0 min-w-0 w-full overflow-hidden bg-background">
            <div className="flex items-center justify-between border-b px-4 h-12">
                <div className="flex items-center gap-3">
                    <Skeleton className="h-5 w-44" />
                </div>
                <div className="flex items-center gap-2">
                    <Skeleton className="h-8 w-20" />
                    <Skeleton className="size-8" />
                </div>
            </div>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 p-4">
                <Skeleton className="h-64 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
                <Skeleton className="h-64 w-full rounded-lg" />
            </div>
        </div>
    );
}

// ---------------------------------------------------------------------------
// Main Page Shell (Sync with Suspense boundary)
// ---------------------------------------------------------------------------

export default function DashboardViewerPage({
    params,
}: {
    params: Promise<{ did: string }>;
}) {
    return (
        <Suspense fallback={<DashboardViewerSkeleton />}>
            <DashboardViewerContent params={params} />
        </Suspense>
    );
}
