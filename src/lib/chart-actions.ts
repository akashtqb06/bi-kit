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
    queryId?: string | null;
}

import { escapeCsvField, slugify, slugifyTitle, buildCsvContent, downloadCsv } from '@src/lib/utils';
export { escapeCsvField, slugify, slugifyTitle };
import { buildFontEmbedCSS, collectChartFonts, collectDashboardFonts } from './fonts';
import type { ChartConfigData } from './schemas';

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
                refresh: true,
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

    const csvContent = buildCsvContent(effectiveCols, effectiveRows);
    const filename = `${slugifyTitle(chart.title || chart.name)}.csv`;
    downloadCsv(filename, csvContent);
    toast.success('CSV downloaded');
}

// ---------------------------------------------------------------------------
// PNG Export Helper (Dashboard & Chart)
// ---------------------------------------------------------------------------

export type ExportBackground = 'theme' | 'white' | 'transparent';

export interface ExportElementPngOptions {
    filename?: string;
    pixelRatio?: number;
    background?: ExportBackground;
    filter?: (node: Node) => boolean;
    fonts?: string[];
}

export interface CaptureElementPngResult {
    dataUrl: string;
    blob: Blob;
    pixelRatio: number;
    wasReduced: boolean;
    tableTruncated: boolean;
}

export function dataUrlToBlob(dataUrl: string): Blob {
    const arr = dataUrl.split(',');
    const mime = arr[0].match(/:(.*?);/)?.[1] || 'image/png';
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
}

/**
 * Resolves CSS variables on SVG presentation attributes and inline styles
 * to computed styles before capture, returning a function to revert them cleanly.
 */
function resolveCssVariables(root: HTMLElement): () => void {
    const revertFns: Array<() => void> = [];
    if (typeof window === 'undefined') return () => {};

    try {
        const elements = root.querySelectorAll('*');
        elements.forEach((el) => {
            const htmlOrSvg = el as HTMLElement | SVGElement;
            const computed = window.getComputedStyle(htmlOrSvg);

            // 1. Check SVG presentation attributes
            const attrsToCheck = ['fill', 'stroke', 'stop-color'];
            for (const attr of attrsToCheck) {
                const val = htmlOrSvg.getAttribute(attr);
                if (val && val.includes('var(')) {
                    const computedProp =
                        attr === 'stop-color'
                            ? computed.stopColor
                            : computed.getPropertyValue(attr);
                    if (computedProp && !computedProp.includes('var(')) {
                        htmlOrSvg.setAttribute(attr, computedProp);
                        revertFns.push(() => {
                            htmlOrSvg.setAttribute(attr, val);
                        });
                    }
                }
            }

            // 2. Check inline styles
            const style = htmlOrSvg.style;
            if (style && style.length > 0) {
                for (let i = 0; i < style.length; i++) {
                    const prop = style[i];
                    const val = style.getPropertyValue(prop);
                    if (val && val.includes('var(')) {
                        const computedVal = computed.getPropertyValue(prop);
                        if (computedVal && !computedVal.includes('var(')) {
                            const priority = style.getPropertyPriority(prop);
                            style.setProperty(prop, computedVal, priority);
                            revertFns.push(() => {
                                style.setProperty(prop, val, priority);
                            });
                        }
                    }
                }
            }
        });
    } catch {
        // Fallback gracefully if any DOM traversal error occurs
    }

    return () => {
        for (let i = revertFns.length - 1; i >= 0; i--) {
            try {
                revertFns[i]();
            } catch {
                // Ignore revert errors
            }
        }
    };
}

/**
 * Low-level capture helper returning PNG dataUrl and Blob.
 * Used by exportElementPng, export dialog live preview, and clipboard copy.
 */
export async function captureElementPng(
    node: HTMLElement | null,
    options?: ExportElementPngOptions
): Promise<CaptureElementPngResult | null> {
    if (!node) return null;

    // 1. Await document fonts and 2 animation frames
    if (typeof document !== 'undefined' && document.fonts && document.fonts.ready) {
        try {
            await document.fonts.ready;
        } catch {
            // Ignore font loading errors
        }
    }
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));

    // 2. Dimension measurement: offsetWidth/offsetHeight explicitly
    const width = node.offsetWidth || Math.round(node.getBoundingClientRect().width) || 800;
    const height = node.offsetHeight || Math.round(node.getBoundingClientRect().height) || 600;

    // 3. 16,000 px dimension check & auto scale reduction
    let effectivePixelRatio = options?.pixelRatio ?? 2;
    let wasReduced = false;
    const maxDimension = Math.max(width * effectivePixelRatio, height * effectivePixelRatio);
    if (maxDimension > 16000) {
        const maxAllowed = Math.min(16000 / width, 16000 / height);
        effectivePixelRatio = Math.max(0.1, Math.floor(maxAllowed * 100) / 100);
        wasReduced = true;
    }

    // 4. Background calculation
    const bgMode = options?.background ?? 'theme';
    let computedBg: string | undefined;
    if (bgMode === 'white') {
        computedBg = '#ffffff';
    } else if (bgMode === 'transparent') {
        computedBg = undefined;
    } else {
        // 'theme'
        const isDark = typeof document !== 'undefined' && document.documentElement.classList.contains('dark');
        const bodyBg = typeof window !== 'undefined' ? window.getComputedStyle(document.body).backgroundColor : undefined;
        computedBg =
            bodyBg && bodyBg !== 'transparent' && bodyBg !== 'rgba(0, 0, 0, 0)'
                ? bodyBg
                : isDark
                ? '#09090b'
                : '#ffffff';
    }

    // 5. Table rows capping at 100
    let tableTruncated = false;
    const revertTableRows: Array<() => void> = [];
    try {
        const tableRows = node.querySelectorAll('tbody tr');
        if (tableRows.length > 100) {
            tableTruncated = true;
            for (let i = 100; i < tableRows.length; i++) {
                const tr = tableRows[i] as HTMLElement;
                const prevDisplay = tr.style.display;
                tr.style.display = 'none';
                revertTableRows.push(() => {
                    tr.style.display = prevDisplay;
                });
            }
        }
    } catch {
        // Ignore table row truncation errors
    }

    // 6. Disable pointer events during capture
    const origPointerEvents = node.style.pointerEvents;
    node.style.pointerEvents = 'none';

    // 7. Resolve CSS variables
    const revertColors = resolveCssVariables(node);

    // 8. Build fontEmbedCSS for requested font families
    let fontEmbedCSS: string | undefined;
    if (options?.fonts && options.fonts.length > 0) {
        try {
            fontEmbedCSS = await buildFontEmbedCSS(options.fonts);
        } catch {
            // Graceful fallback
        }
    }

    try {
        const dataUrl = await toPng(node, {
            width,
            height,
            pixelRatio: effectivePixelRatio,
            backgroundColor: computedBg,
            fontEmbedCSS: fontEmbedCSS || undefined,
            filter: (child: Node) => {
                if (!child) return true;
                const el = child as HTMLElement;
                if (el.classList) {
                    if (
                        el.classList.contains('no-export') ||
                        el.classList.contains('react-resizable-handle') ||
                        el.classList.contains('recharts-tooltip-wrapper') ||
                        el.classList.contains('recharts-tooltip-cursor') ||
                        el.classList.contains('selection-ring')
                    ) {
                        return false;
                    }
                }
                if (el.getAttribute && el.getAttribute('data-slot') === 'tooltip-content') {
                    return false;
                }
                if (options?.filter && !options.filter(child)) {
                    return false;
                }
                return true;
            },
        });

        const blob = dataUrlToBlob(dataUrl);

        return {
            dataUrl,
            blob,
            pixelRatio: effectivePixelRatio,
            wasReduced,
            tableTruncated,
        };
    } finally {
        node.style.pointerEvents = origPointerEvents;
        revertColors();
        for (let i = revertTableRows.length - 1; i >= 0; i--) {
            try {
                revertTableRows[i]();
            } catch {
                // Ignore revert error
            }
        }
    }
}

/**
 * Generic PNG export helper for DOM elements with loading/success toasts and file download.
 */
export async function exportElementPng(
    node: HTMLElement | null,
    options?: ExportElementPngOptions
): Promise<void> {
    if (!node) {
        toast.error('Element not found for export');
        return;
    }

    const toastId = toast.loading('Exporting...');

    try {
        const result = await captureElementPng(node, options);
        if (!result) {
            throw new Error('Capture returned no result');
        }

        if (result.tableTruncated) {
            toast.warning('Table rows truncated to 100 for export');
        }

        const link = document.createElement('a');
        let filename = options?.filename || 'export.png';
        if (!filename.toLowerCase().endsWith('.png')) {
            filename += '.png';
        }
        link.download = filename;
        link.href = result.dataUrl;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        if (result.wasReduced) {
            toast.success(`Exported (scale reduced to ${result.pixelRatio}x to fit canvas limits)`, {
                id: toastId,
            });
        } else {
            toast.success('Exported', { id: toastId });
        }
    } catch (err) {
        console.error('PNG export failed', err);
        toast.error('Failed to export PNG', { id: toastId });
    }
}

/**
 * Dashboard PNG export helper. Collects font families from charts if provided.
 */
export async function exportDashboardPng(
    gridElement: HTMLElement | null,
    title?: string,
    chartsOrFonts?: Array<{ config?: unknown }> | string[]
): Promise<void> {
    if (!gridElement) {
        toast.error('Grid element not found for export');
        return;
    }

    let fonts: string[] | undefined;
    if (Array.isArray(chartsOrFonts)) {
        if (chartsOrFonts.length > 0 && typeof chartsOrFonts[0] === 'string') {
            fonts = chartsOrFonts as string[];
        } else {
            fonts = collectDashboardFonts(chartsOrFonts as Array<{ config?: unknown }>);
        }
    }

    // Target the inner grid element if nested in a scroll container
    const targetElement =
        (gridElement.querySelector('.react-grid-layout') as HTMLElement) ||
        (gridElement.firstElementChild as HTMLElement) ||
        gridElement;

    return exportElementPng(targetElement, {
        filename: `${title || 'dashboard'}.png`,
        pixelRatio: 2,
        background: 'theme',
        fonts,
    });
}

/**
 * Chart PNG export helper. Captures the chart card root and formats filename as {chart-title-slug}.png.
 * Embeds web fonts used in chart config/textStyle.
 */
export async function exportChartPng(
    cardElement: HTMLElement | null,
    title?: string,
    fontsOrConfigOrOptions?: string[] | Partial<ChartConfigData> | Partial<ExportElementPngOptions>,
    chartConfig?: Partial<ChartConfigData>
): Promise<void> {
    if (!cardElement) {
        toast.error('Chart element not found for export');
        return;
    }

    let fonts: string[] | undefined;
    let extraOptions: Partial<ExportElementPngOptions> = {};

    if (Array.isArray(fontsOrConfigOrOptions)) {
        fonts = fontsOrConfigOrOptions;
    } else if (fontsOrConfigOrOptions && typeof fontsOrConfigOrOptions === 'object') {
        if (
            'filename' in fontsOrConfigOrOptions ||
            'pixelRatio' in fontsOrConfigOrOptions ||
            'background' in fontsOrConfigOrOptions ||
            'filter' in fontsOrConfigOrOptions ||
            'fonts' in fontsOrConfigOrOptions
        ) {
            extraOptions = fontsOrConfigOrOptions as Partial<ExportElementPngOptions>;
            fonts = extraOptions.fonts;
        } else {
            fonts = collectChartFonts(fontsOrConfigOrOptions as Partial<ChartConfigData>);
        }
    }

    if (!fonts && chartConfig) {
        fonts = collectChartFonts(chartConfig);
    }

    const filename = extraOptions.filename || `${slugify(title, 'chart')}.png`;

    return exportElementPng(cardElement, {
        filename,
        pixelRatio: 2,
        background: 'theme',
        ...extraOptions,
        fonts,
    });
}

