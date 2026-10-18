'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { toast } from 'sonner';
import { ResizablePanelGroup, ResizablePanel, ResizableHandle } from '@/components/ui/resizable';
import { Tabs, TabsList, TabsTrigger, TabsContent } from '@/components/ui/tabs';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { SearchCodeIcon, BarChart2Icon, LayoutDashboardIcon, AlertCircleIcon, RefreshCwIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { useBreadcrumbStore } from '@src/components/layout/breadcrumb-store';
import { PanelList, type WorkspaceItem } from '@src/components/workbook/panel-list';
import { EditorPanel } from '@src/components/workbook/editor-panel';
import type { QueryPublic } from '@src/lib/queries/service';
import type { ChartPublic } from '@src/lib/charts/service';
import type { DashboardPublic } from '@src/lib/dashboards/service';
import type { WorkbookPublic } from '@src/lib/workbooks/service';

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type EditorType = 'query' | 'chart' | 'dashboard';
type ActiveTab = 'queries' | 'charts' | 'dashboards';

// ---------------------------------------------------------------------------
// WorkspaceClient — receives workbookId from the page
// ---------------------------------------------------------------------------

export function WorkspaceClient({ workbookId }: { workbookId: string }) {
    const router = useRouter();
    const searchParams = useSearchParams();

    // URL-persisted selection
    const urlType = searchParams.get('type') as EditorType | null;
    const urlId = searchParams.get('id');

    // Active left-panel tab
    const [activeTab, setActiveTab] = useState<ActiveTab>(
        urlType === 'chart' ? 'charts' : urlType === 'dashboard' ? 'dashboards' : 'queries'
    );

    // Data
    const [workbook, setWorkbook] = useState<WorkbookPublic | null>(null);
    const [queries, setQueries] = useState<QueryPublic[]>([]);
    const [charts, setCharts] = useState<ChartPublic[]>([]);
    const [dashboards, setDashboards] = useState<DashboardPublic[]>([]);
    const [loadingWb, setLoadingWb] = useState(true);
    const [workbookError, setWorkbookError] = useState<string | null>(null);
    const [loadingItems, setLoadingItems] = useState(true);
    const [itemsError, setItemsError] = useState<string | null>(null);

    // Synchronize breadcrumbs with current workbook & active item
    const setCrumbs = useBreadcrumbStore((s) => s.setCrumbs);
    useEffect(() => {
        if (!workbook) {
            setCrumbs(null);
            return;
        }

        let activeItemName: string | undefined;
        if (urlType === 'query' && urlId) {
            activeItemName = queries.find((q) => q.id === urlId)?.name;
        } else if (urlType === 'chart' && urlId) {
            activeItemName = charts.find((c) => c.id === urlId)?.name;
        } else if (urlType === 'dashboard' && urlId) {
            activeItemName = dashboards.find((d) => d.id === urlId)?.name;
        }

        const crumbs = [
            { label: 'Workbooks', href: '/workbooks' },
            activeItemName
                ? { label: workbook.name, href: `/workbooks/${workbook.id}` }
                : { label: workbook.name },
        ];

        if (activeItemName) {
            crumbs.push({ label: activeItemName });
        }

        setCrumbs(crumbs);

        return () => {
            setCrumbs(null);
        };
    }, [workbook, urlType, urlId, queries, charts, dashboards, setCrumbs]);

    // ---------------------------------------------------------------------------
    // Fetch workbook
    // ---------------------------------------------------------------------------

    const requestWorkbook = useCallback(async () => {
        const response = await fetch(`/api/workbooks/${workbookId}`);
        const json = (await response.json()) as { data?: WorkbookPublic; error?: string };
        if (!response.ok || !json.data) {
            throw new Error(json.error ?? 'Workbook not found');
        }
        return json.data;
    }, [workbookId]);

    useEffect(() => {
        let active = true;
        requestWorkbook()
            .then((data) => {
                if (!active) return;
                setWorkbook(data);
                setWorkbookError(null);
            })
            .catch((err: unknown) => {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'Failed to load workbook';
                setWorkbook(null);
                setWorkbookError(message);
                toast.error('Unable to load workbook', { description: message });
            })
            .finally(() => {
                if (active) setLoadingWb(false);
            });
        return () => {
            active = false;
        };
    }, [requestWorkbook]);

    const fetchWorkbook = async () => {
        try {
            setWorkbook(await requestWorkbook());
            setWorkbookError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load workbook';
            setWorkbook(null);
            setWorkbookError(message);
            toast.error('Unable to load workbook', { description: message });
        } finally {
            setLoadingWb(false);
        }
    };

    // ---------------------------------------------------------------------------
    // Fetch items
    // ---------------------------------------------------------------------------

    const requestItems = useCallback(async () => {
        const [qRes, cRes, dRes] = await Promise.all([
            fetch(`/api/queries?workbookId=${workbookId}`),
            fetch(`/api/charts?workbookId=${workbookId}`),
            fetch(`/api/dashboards?workbookId=${workbookId}`),
        ]);
        const [qJson, cJson, dJson] = await Promise.all([
            qRes.json() as Promise<{ data?: QueryPublic[] }>,
            cRes.json() as Promise<{ data?: ChartPublic[] }>,
            dRes.json() as Promise<{ data?: DashboardPublic[] }>,
        ]);
        if (!qRes.ok || !cRes.ok || !dRes.ok || !qJson.data || !cJson.data || !dJson.data) {
            throw new Error('Failed to load workbook items');
        }
        return { queries: qJson.data, charts: cJson.data, dashboards: dJson.data };
    }, [workbookId]);

    useEffect(() => {
        let active = true;
        requestItems()
            .then((data) => {
                if (!active) return;
                setQueries(data.queries);
                setCharts(data.charts);
                setDashboards(data.dashboards);
                setItemsError(null);
            })
            .catch((err: unknown) => {
                if (!active) return;
                const message = err instanceof Error ? err.message : 'Failed to load workbook items';
                setItemsError(message);
                toast.error('Unable to load workbook items', { description: message });
            })
            .finally(() => {
                if (active) setLoadingItems(false);
            });
        return () => {
            active = false;
        };
    }, [requestItems]);

    const fetchItems = async () => {
        try {
            const data = await requestItems();
            setQueries(data.queries);
            setCharts(data.charts);
            setDashboards(data.dashboards);
            setItemsError(null);
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to load workbook items';
            setItemsError(message);
            toast.error('Unable to load workbook items', { description: message });
        } finally {
            setLoadingItems(false);
        }
    };

    // ---------------------------------------------------------------------------
    // URL navigation helper
    // ---------------------------------------------------------------------------

    const navigate = useCallback(
        (type: EditorType, id: string) => {
            const params = new URLSearchParams();
            params.set('type', type);
            params.set('id', id);
            router.replace(`/workbooks/${workbookId}?${params.toString()}`, { scroll: false });
        },
        [router, workbookId]
    );

    // ---------------------------------------------------------------------------
    // Item CRUD helpers
    // ---------------------------------------------------------------------------

    // QUERIES
    const addQuery = async (name: string) => {
        // Need a data source — for now require at least one exists
        const dsRes = await fetch('/api/data-sources');
        const dsJson = (await dsRes.json()) as { data?: { id: string }[] };
        const firstDs = dsJson.data?.[0];
        if (!firstDs) {
            toast.error('No data sources found', {
                description: 'Add a data source before creating a query.',
            });
            throw new Error('no data source');
        }
        const res = await fetch('/api/queries', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                workbookId,
                name,
                dataSourceId: firstDs.id,
                mode: 'builder',
            }),
        });
        const json = (await res.json()) as { data?: QueryPublic; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed');
        setQueries((prev) => [...prev, json.data!]);
        navigate('query', json.data.id);
        toast.success(`Query "${name}" created`);
    };

    const renameQuery = async (id: string, name: string) => {
        const res = await fetch(`/api/queries/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error('Failed to rename');
        setQueries((prev) => prev.map((q) => (q.id === id ? { ...q, name } : q)));
        toast.success('Renamed');
    };

    const deleteQuery = async (id: string) => {
        const res = await fetch(`/api/queries/${id}`, { method: 'DELETE' });
        const json = (await res.json()) as { error?: string };
        if (!res.ok) throw new Error(json.error ?? 'Failed to delete');
        setQueries((prev) => prev.filter((q) => q.id !== id));
        if (urlId === id) router.replace(`/workbooks/${workbookId}`, { scroll: false });
        toast.success('Query deleted');
    };

    // CHARTS
    const addChart = async (name: string) => {
        const firstQuery = queries[0];
        if (!firstQuery) {
            toast.error('No queries found', {
                description: 'Create a query before creating a chart.',
            });
            throw new Error('no query');
        }
        const res = await fetch('/api/charts', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name, queryId: firstQuery.id, type: 'table', config: {} }),
        });
        const json = (await res.json()) as { data?: ChartPublic; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed');
        setCharts((prev) => [...prev, json.data!]);
        navigate('chart', json.data.id);
        toast.success(`Chart "${name}" created`);
    };

    const renameChart = async (id: string, name: string) => {
        const res = await fetch(`/api/charts/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error('Failed');
        setCharts((prev) => prev.map((c) => (c.id === id ? { ...c, name } : c)));
        toast.success('Renamed');
    };

    const deleteChart = async (id: string) => {
        const res = await fetch(`/api/charts/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        setCharts((prev) => prev.filter((c) => c.id !== id));
        if (urlId === id) router.replace(`/workbooks/${workbookId}`, { scroll: false });
        toast.success('Chart deleted');
    };

    // DASHBOARDS
    const addDashboard = async (name: string) => {
        const res = await fetch('/api/dashboards', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ workbookId, name, layout: [] }),
        });
        const json = (await res.json()) as { data?: DashboardPublic; error?: string };
        if (!res.ok || !json.data) throw new Error(json.error ?? 'Failed');
        setDashboards((prev) => [...prev, json.data!]);
        navigate('dashboard', json.data.id);
        toast.success(`Dashboard "${name}" created`);
    };

    const renameDashboard = async (id: string, name: string) => {
        const res = await fetch(`/api/dashboards/${id}`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name }),
        });
        if (!res.ok) throw new Error('Failed');
        setDashboards((prev) => prev.map((d) => (d.id === id ? { ...d, name } : d)));
        toast.success('Renamed');
    };

    const deleteDashboard = async (id: string) => {
        const res = await fetch(`/api/dashboards/${id}`, { method: 'DELETE' });
        if (!res.ok) throw new Error('Failed');
        setDashboards((prev) => prev.filter((d) => d.id !== id));
        if (urlId === id) router.replace(`/workbooks/${workbookId}`, { scroll: false });
        toast.success('Dashboard deleted');
    };

    // ---------------------------------------------------------------------------
    // Derived state
    // ---------------------------------------------------------------------------

    const toItems = (arr: { id: string; name: string }[]): WorkspaceItem[] => arr.map(({ id, name }) => ({ id, name }));

    const handleSelectTab = (tab: string) => {
        setActiveTab(tab as ActiveTab);
    };

    // ---------------------------------------------------------------------------
    // Render
    // ---------------------------------------------------------------------------

    return (
        <div className="flex h-full flex-col">
            {/* Workbook header */}
            <div className="flex items-center gap-3 border-b px-4 py-2.5 shrink-0">
                {loadingWb ? (
                    <Skeleton className="h-5 w-40" />
                ) : (
                    <>
                        <span className="font-semibold text-sm">
                            {workbook?.name ?? (workbookError ? 'Workbook unavailable' : 'Workbook')}
                        </span>
                        {workbook?.description && (
                            <span className="text-xs text-muted-foreground truncate max-w-xs">
                                {workbook.description}
                            </span>
                        )}
                    </>
                )}
                <div className="ml-auto flex items-center gap-2">
                    <Badge variant="outline" className="text-[10px]">
                        {queries.length}Q · {charts.length}C · {dashboards.length}D
                    </Badge>
                </div>
            </div>

            {workbookError && !loadingWb && (
                <div className="border-b p-3">
                    <Alert variant="destructive">
                        <AlertCircleIcon className="size-4" />
                        <AlertTitle>Workbook could not be loaded</AlertTitle>
                        <AlertDescription className="flex flex-wrap items-center justify-between gap-2">
                            <span>{workbookError}</span>
                            <Button variant="outline" size="sm" onClick={() => void fetchWorkbook()}>
                                <RefreshCwIcon className="mr-2 size-3.5" /> Retry
                            </Button>
                        </AlertDescription>
                    </Alert>
                </div>
            )}

            {/* ResizablePanelGroup */}
            <ResizablePanelGroup orientation="horizontal" className="flex-1 min-h-0">
                {/* Left panel — Tabs */}
                <ResizablePanel defaultSize={50} minSize={14} maxSize={320} className="flex flex-col min-h-0">
                    <Tabs
                        value={activeTab}
                        onValueChange={(v) => handleSelectTab(v as ActiveTab)}
                        className="flex flex-col h-full"
                    >
                        <TabsList className="w-full rounded-none border-b bg-transparent h-9 px-2 gap-0 justify-start shrink-0">
                            <TabsTrigger value="queries" className="flex-none gap-1 text-xs px-2">
                                <SearchCodeIcon className="size-3" />
                                Queries
                                {queries.length > 0 && (
                                    <span className="ml-0.5 text-muted-foreground">({queries.length})</span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="charts" className="flex-none gap-1 text-xs px-2">
                                <BarChart2Icon className="size-3" />
                                Charts
                                {charts.length > 0 && (
                                    <span className="ml-0.5 text-muted-foreground">({charts.length})</span>
                                )}
                            </TabsTrigger>
                            <TabsTrigger value="dashboards" className="flex-none gap-1 text-xs px-2">
                                <LayoutDashboardIcon className="size-3" />
                                Dashboards
                                {dashboards.length > 0 && (
                                    <span className="ml-0.5 text-muted-foreground">({dashboards.length})</span>
                                )}
                            </TabsTrigger>
                        </TabsList>

                        <TabsContent value="queries" className="flex-1 min-h-0 mt-0">
                            <PanelList
                                items={toItems(queries)}
                                loading={loadingItems}
                                error={itemsError}
                                onRetry={() => void fetchItems()}
                                selectedId={urlType === 'query' ? urlId : null}
                                onSelect={(id) => navigate('query', id)}
                                onAdd={addQuery}
                                onRename={renameQuery}
                                onDelete={deleteQuery}
                                addLabel="New Query"
                                emptyLabel="No queries yet"
                                emptyHint="Create a query to start exploring your data."
                                icon={<SearchCodeIcon className="size-8" />}
                            />
                        </TabsContent>

                        <TabsContent value="charts" className="flex-1 min-h-0 mt-0">
                            <PanelList
                                items={toItems(charts)}
                                loading={loadingItems}
                                error={itemsError}
                                onRetry={() => void fetchItems()}
                                selectedId={urlType === 'chart' ? urlId : null}
                                onSelect={(id) => navigate('chart', id)}
                                onAdd={addChart}
                                onRename={renameChart}
                                onDelete={deleteChart}
                                addLabel="New Chart"
                                emptyLabel="No charts yet"
                                emptyHint="Create a chart from an existing query."
                                icon={<BarChart2Icon className="size-8" />}
                            />
                        </TabsContent>

                        <TabsContent value="dashboards" className="flex-1 min-h-0 mt-0">
                            <PanelList
                                items={toItems(dashboards)}
                                loading={loadingItems}
                                error={itemsError}
                                onRetry={() => void fetchItems()}
                                selectedId={urlType === 'dashboard' ? urlId : null}
                                onSelect={(id) => navigate('dashboard', id)}
                                onAdd={addDashboard}
                                onRename={renameDashboard}
                                onDelete={deleteDashboard}
                                addLabel="New Dashboard"
                                emptyLabel="No dashboards yet"
                                emptyHint="Create a dashboard to display your charts."
                                icon={<LayoutDashboardIcon className="size-8" />}
                            />
                        </TabsContent>
                    </Tabs>
                </ResizablePanel>

                <ResizableHandle withHandle />

                {/* Main panel — editor */}
                <ResizablePanel defaultSize={78} className="flex flex-col min-h-0">
                    <EditorPanel type={urlType} id={urlId} workbookId={workbookId} onSelectTab={handleSelectTab} />
                </ResizablePanel>
            </ResizablePanelGroup>
        </div>
    );
}
