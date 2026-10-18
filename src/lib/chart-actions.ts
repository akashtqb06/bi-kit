'use client';

import { toast } from 'sonner';
import { toPng } from 'html-to-image';

export interface CsvColumn {
    name: string;
}

export interface ChartCsvTarget {
    id?: string;
    name?: string;
    title?: string;
    queryId?: string;
}

/**
 * Escapes a single CSV value according to RFC 4180.
 * If the value contains commas, double quotes, or newlines, it must be enclosed
 * in double quotes, and any internal double quotes must be doubled ("").
 */
export function escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

/**
 * Generates a clean URL-friendly and filename-safe slug from a chart/dashboard title.
 */
export function slugifyTitle(title?: string): string {
    if (!title) return 'chart-data';
    const slug = title
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return slug || 'chart-data';
}

// ---------------------------------------------------------------------------
// Chart Refetch Registry for refreshChart(chartId)
// ---------------------------------------------------------------------------

type RefetchFn = () => Promise<void> | void;
const refetchRegistry = new Map<string, RefetchFn>();

export function registerChartRefetcher(chartId: string, fn: RefetchFn): () => void {
    refetchRegistry.set(chartId, fn);
    return () => {
        if (refetchRegistry.get(chartId) === fn) {
            refetchRegistry.delete(chartId);
        }
    };
}

/**
 * Invalidates and refetches a chart's query data (bypassing any client cache).
 * Shows a sonner toast on failure.
 */
export async function refreshChart(chartId: string, customRefetch?: RefetchFn): Promise<void> {
    const fn = customRefetch ?? refetchRegistry.get(chartId);
    if (fn) {
        try {
            await fn();
            return;
        } catch (err) {
            const message = err instanceof Error ? err.message : 'Failed to refresh chart data';
            toast.error(message);
            throw err;
        }
    }

    // Fallback: fetch chart definition and run its query with cache bypass
    try {
        const chartRes = await fetch(`/api/charts/${chartId}`);
        if (!chartRes.ok) throw new Error('Chart not found');
        const chartJson = await chartRes.json();
        const queryId = chartJson.data?.queryId;
        if (!queryId) throw new Error('No query linked to chart');

        const queryRes = await fetch(`/api/queries/${queryId}`);
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
        toast.success('Chart refreshed');
    } catch (err) {
        const message = err instanceof Error ? err.message : 'Failed to refresh chart data';
        toast.error(message);
        throw err;
    }
}

// ---------------------------------------------------------------------------
// Navigation Helpers
// ---------------------------------------------------------------------------

export function openInWorkbook(
    router: { push: (url: string) => void },
    workbookId: string,
    chartId: string
): void {
    router.push(`/workbooks/${workbookId}/chart/${chartId}`);
}

export function openDashboardInWorkbook(
    router: { push: (url: string) => void },
    workbookId: string,
    dashboardId: string
): void {
    router.push(`/workbooks/${workbookId}/dashboard/${dashboardId}`);
}

// ---------------------------------------------------------------------------
// CSV Download Helper (RFC 4180 with Excel UTF-8 BOM)
// ---------------------------------------------------------------------------

export async function downloadChartCsv(
    chart: ChartCsvTarget,
    rows?: unknown[][] | Record<string, unknown>[],
    columns?: Array<CsvColumn | string>
): Promise<void> {
    let effectiveRows: unknown[][] = [];
    let effectiveCols: string[] = [];

    if (rows && rows.length > 0) {
        if (columns && columns.length > 0) {
            effectiveCols = columns.map((c) => (typeof c === 'string' ? c : c.name));
        }

        // Handle object rows (e.g. from aggregated chart views)
        if (typeof rows[0] === 'object' && !Array.isArray(rows[0]) && rows[0] !== null) {
            const objRows = rows as Record<string, unknown>[];
            if (effectiveCols.length === 0) {
                effectiveCols = Object.keys(objRows[0]);
            }
            effectiveRows = objRows.map((r) => effectiveCols.map((col) => r[col]));
        } else {
            effectiveRows = rows as unknown[][];
        }
    } else if (chart.queryId) {
        // Not loaded yet: fetch and execute the query
        try {
            const res = await fetch(`/api/queries/${chart.queryId}`);
            if (!res.ok) throw new Error('Failed to load query definition');
            const qJson = await res.json();
            const q = qJson.data;

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

            if (!runRes.ok) throw new Error('Failed to run query for export');
            const runJson = await runRes.json();
            if (runJson.data?.rows) {
                effectiveRows = runJson.data.rows;
                effectiveCols = (runJson.data.columns || []).map((c: { name: string }) => c.name);
            }
        } catch {
            toast.error('Failed to load chart data for CSV export');
            return;
        }
    }

    if (effectiveRows.length === 0) {
        toast.error('No data to export');
        return;
    }

    const headerLine = effectiveCols.map(escapeCsvField).join(',');
    const rowLines = effectiveRows.map((row) => row.map(escapeCsvField).join(','));
    const csvContent = (headerLine ? [headerLine, ...rowLines] : rowLines).join('\r\n');

    // Prepend UTF-8 BOM (\uFEFF) for Microsoft Excel compatibility
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const filename = `${slugifyTitle(chart.title || chart.name)}.csv`;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
    toast.success('CSV downloaded');
}

// ---------------------------------------------------------------------------
// PNG Export Helper (Dashboard & Chart)
// ---------------------------------------------------------------------------

export async function exportDashboardPng(
    gridElement: HTMLElement | null,
    title?: string
): Promise<void> {
    if (!gridElement) {
        toast.error('Grid element not found for export');
        return;
    }

    const toastId = toast.loading('Exporting...');

    try {
        // Await next animation frames to ensure SVG charts and layouts are fully painted
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

        // Resolve computed background color for current theme to avoid transparency or broken oklch/CSS vars
        const isDark = document.documentElement.classList.contains('dark');
        const bodyBg = window.getComputedStyle(document.body).backgroundColor;
        const computedBg =
            bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)'
                ? bodyBg
                : isDark
                ? '#09090b'
                : '#ffffff';

        // Target the inner grid element if nested in a scroll container
        const targetElement =
            (gridElement.querySelector('.react-grid-layout') as HTMLElement) ||
            (gridElement.firstElementChild as HTMLElement) ||
            gridElement;

        const dataUrl = await toPng(targetElement, {
            pixelRatio: 2,
            backgroundColor: computedBg,
            filter: (node: Node) => {
                if (!node) return true;
                const el = node as HTMLElement;
                if (el.classList) {
                    if (
                        el.classList.contains('no-export') ||
                        el.classList.contains('react-resizable-handle')
                    ) {
                        return false;
                    }
                }
                return true;
            },
        });

        const link = document.createElement('a');
        link.download = `${title || 'dashboard'}.png`;
        link.href = dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        toast.success('Exported', { id: toastId });
    } catch (err) {
        console.error('PNG export failed', err);
        toast.error('Failed to export PNG', { id: toastId });
    }
}

export async function exportChartPng(
    cardElement: HTMLElement | null,
    title?: string
): Promise<void> {
    return exportDashboardPng(cardElement, title || 'chart');
}

