'use client';

import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
    BarChart,
    Bar,
    Line,
    Area,
    AreaChart,
    ResponsiveContainer,
    PieChart,
    Pie,
    Cell,
    XAxis,
    YAxis,
    CartesianGrid,
    ComposedChart,
    ReferenceLine,
    Brush,
} from 'recharts';
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from '@/components/ui/chart';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useLegacyTable, getCoreRowModel, type LegacyColumnDef } from '@tanstack/react-table/legacy';
import { flexRender } from '@tanstack/react-table';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertTitle, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';
import { AlertCircleIcon, BarChart2Icon, TrendingUpIcon, TrendingDownIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChartConfigData, ChartType } from '@src/lib/schemas';
import type { QueryResultData } from '@src/components/query-builder/store';
import { aggregateChartData, parseDateSafe } from '@src/lib/charts/aggregate';
import { format } from 'date-fns';

// ---------------------------------------------------------------------------
// Palettes
// ---------------------------------------------------------------------------

export const COLOR_PALETTES: Record<string, string[]> = {
    default: ['var(--chart-1)', 'var(--chart-2)', 'var(--chart-3)', 'var(--chart-4)', 'var(--chart-5)'],
    ocean: [
        'var(--chart-ocean-1)',
        'var(--chart-ocean-2)',
        'var(--chart-ocean-3)',
        'var(--chart-ocean-4)',
        'var(--chart-ocean-5)',
        'var(--chart-ocean-6)',
        'var(--chart-ocean-7)',
    ],
    emerald: [
        'var(--chart-emerald-1)',
        'var(--chart-emerald-2)',
        'var(--chart-emerald-3)',
        'var(--chart-emerald-4)',
        'var(--chart-emerald-5)',
        'var(--chart-emerald-6)',
        'var(--chart-emerald-7)',
    ],
    sunset: [
        'var(--chart-sunset-1)',
        'var(--chart-sunset-2)',
        'var(--chart-sunset-3)',
        'var(--chart-sunset-4)',
        'var(--chart-sunset-5)',
        'var(--chart-sunset-6)',
        'var(--chart-sunset-7)',
    ],
    monochrome: [
        'var(--chart-monochrome-1)',
        'var(--chart-monochrome-2)',
        'var(--chart-monochrome-3)',
        'var(--chart-monochrome-4)',
        'var(--chart-monochrome-5)',
        'var(--chart-monochrome-6)',
    ],
    rainbow: [
        'var(--chart-rainbow-1)',
        'var(--chart-rainbow-2)',
        'var(--chart-rainbow-3)',
        'var(--chart-rainbow-4)',
        'var(--chart-rainbow-5)',
        'var(--chart-rainbow-6)',
        'var(--chart-rainbow-7)',
    ],
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

export interface NormalizedData {
    columnNames: string[];
    rows: Record<string, unknown>[];
}

export function normalizeData(
    data?: QueryResultData | { columns?: unknown[]; rows?: unknown[][] } | Record<string, unknown>[] | null
): NormalizedData {
    if (!data) return { columnNames: [], rows: [] };

    if (Array.isArray(data)) {
        if (data.length === 0) return { columnNames: [], rows: [] };
        const columnNames = Object.keys(data[0] || {});
        return { columnNames, rows: data };
    }

    if (typeof data === 'object' && 'rows' in data && Array.isArray(data.rows)) {
        const rawCols = data.columns || [];
        const columnNames: string[] = rawCols.map((col, idx) => {
            if (typeof col === 'string') return col;
            if (col && typeof col === 'object' && 'name' in col && typeof col.name === 'string') {
                return col.name;
            }
            return `col_${idx}`;
        });

        const rows = (data.rows as unknown[][]).map((row) => {
            const rowObj: Record<string, unknown> = {};
            columnNames.forEach((colName, idx) => {
                const val = row[idx];
                rowObj[colName] = typeof val === 'bigint' ? Number(val) : val;
            });
            return rowObj;
        });

        return { columnNames, rows };
    }

    return { columnNames: [], rows: [] };
}

export function computeNumberCardValue(
    rows: Record<string, unknown>[],
    config: ChartConfigData,
    columnNames: string[]
): {
    value: number | string | null;
    formatted: string;
    label: string;
    comparison?: { diff: number; diffPct: number; isPositive: boolean; label: string } | null;
    timeDelta?: { diff: number; diffPct: number; isPositive: boolean } | null;
    sparklineData?: { value: number }[] | null;
} {
    const targetCol =
        config.numberValueColumn ||
        config.donutValueColumn ||
        config.seriesConfig?.[0]?.column ||
        config.yAxis?.[0] ||
        columnNames[0];
    if (!targetCol || rows.length === 0) {
        return { value: null, formatted: '—', label: targetCol || 'Value' };
    }

    const rawValues = rows.map((r) => r[targetCol]).filter((v) => v !== null && v !== undefined);
    const numValues = rawValues.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => !isNaN(n));

    const agg = config.numberAggregation || 'first';
    let calculatedVal: number | string | null = null;

    switch (agg) {
        case 'first':
            calculatedVal = rawValues.length > 0 ? (rawValues[0] as string | number) : null;
            break;
        case 'count':
            calculatedVal = rawValues.length;
            break;
        case 'sum':
            calculatedVal = numValues.reduce((acc, curr) => acc + curr, 0);
            break;
        case 'avg':
            calculatedVal =
                numValues.length > 0 ? numValues.reduce((acc, curr) => acc + curr, 0) / numValues.length : 0;
            break;
        case 'min':
            calculatedVal = numValues.length > 0 ? Math.min(...numValues) : 0;
            break;
        case 'max':
            calculatedVal = numValues.length > 0 ? Math.max(...numValues) : 0;
            break;
    }

    if (calculatedVal === null) {
        return { value: null, formatted: '—', label: targetCol };
    }

    let formatted = '';
    const num = typeof calculatedVal === 'number' ? calculatedVal : Number(calculatedVal);

    if (isNaN(num)) {
        formatted = String(calculatedVal);
    } else {
        const decimals = config.numberDecimals;
        const isInteger = Number.isInteger(num);
        const isLarge = Math.abs(num) >= 100_000;

        if (isLarge && config.numberFormat !== 'percent' && config.numberFormat !== 'currency') {
            formatted = new Intl.NumberFormat('en-US', {
                notation: 'compact',
                maximumFractionDigits: typeof decimals === 'number' ? decimals : 1,
            }).format(num);
        } else {
            switch (config.numberFormat) {
                case 'currency':
                    formatted = new Intl.NumberFormat('en-US', {
                        style: 'currency',
                        currency: 'USD',
                        minimumFractionDigits: typeof decimals === 'number' ? decimals : 2,
                        maximumFractionDigits: typeof decimals === 'number' ? decimals : 2,
                    }).format(num);
                    break;
                case 'percent':
                    formatted = `${(num <= 1 && num >= -1 ? num * 100 : num).toFixed(typeof decimals === 'number' ? decimals : (isInteger ? 0 : 1))}%`;
                    break;
                case 'compact':
                    formatted = new Intl.NumberFormat('en-US', {
                        notation: 'compact',
                        maximumFractionDigits: typeof decimals === 'number' ? decimals : 1,
                    }).format(num);
                    break;
                case 'number':
                case 'none':
                default:
                    if (typeof decimals === 'number') {
                        formatted = num.toLocaleString(undefined, {
                            minimumFractionDigits: decimals,
                            maximumFractionDigits: decimals,
                        });
                    } else if (isInteger) {
                        formatted = num.toLocaleString();
                    } else {
                        formatted = num.toLocaleString(undefined, {
                            minimumFractionDigits: 0,
                            maximumFractionDigits: 2,
                        });
                    }
                    break;
            }
        }
    }

    const prefix = config.numberPrefix || '';
    const suffix = config.numberSuffix || '';
    const finalFormatted = `${prefix}${formatted}${suffix}`;

    // Comparison calculation
    let comparison = null;
    if (config.numberComparisonColumn && columnNames.includes(config.numberComparisonColumn)) {
        const compRaw = rows.map((r) => r[config.numberComparisonColumn!]).filter((v) => v !== null && v !== undefined);
        const compNums = compRaw.map((v) => (typeof v === 'number' ? v : Number(v))).filter((n) => !isNaN(n));
        const compVal = compNums.length > 0 ? compNums.reduce((a, b) => a + b, 0) / compNums.length : 0;
        if (typeof num === 'number' && !isNaN(num) && compVal !== 0) {
            const diff = num - compVal;
            const diffPct = (diff / Math.abs(compVal)) * 100;
            comparison = {
                diff,
                diffPct: Math.round(diffPct * 10) / 10,
                isPositive: diff >= 0,
                label: config.numberComparisonColumn,
            };
        }
    }

    // Time delta and sparkline calculation (if date column is configured or present)
    let timeDelta = null;
    let sparklineData = null;
    const cfgRecord = config as Record<string, unknown>;
    const dateCol = (config.xAxis || cfgRecord.dateColumn || cfgRecord.numberDateColumn) as string | undefined ||
        columnNames.find((c) => /date|time|timestamp|month|year|day/i.test(c));

    if (dateCol && columnNames.includes(dateCol)) {
        const timePoints = rows
            .map((r) => {
                const dVal = r[dateCol];
                const nVal = Number(r[targetCol]);
                const d = parseDateSafe(dVal);
                return {
                    time: d ? d.getTime() : 0,
                    value: isNaN(nVal) ? 0 : nVal,
                };
            })
            .filter((p) => p.time > 0 && !isNaN(p.value))
            .sort((a, b) => a.time - b.time);

        if (timePoints.length >= 2) {
            const cur = timePoints[timePoints.length - 1];
            const prev = timePoints[timePoints.length - 2];
            const diff = cur.value - prev.value;
            const diffPct = prev.value !== 0 ? Math.round(((cur.value - prev.value) / Math.abs(prev.value)) * 1000) / 10 : 0;
            timeDelta = {
                diff,
                diffPct: Math.abs(diffPct),
                isPositive: diff >= 0,
            };
            sparklineData = timePoints.map((p) => ({ value: p.value }));
        }
    }

    return {
        value: calculatedVal,
        formatted: finalFormatted,
        label: targetCol,
        comparison,
        timeDelta,
        sparklineData,
    };
}

// ---------------------------------------------------------------------------
// ChartRenderer Props
// ---------------------------------------------------------------------------

export interface ChartRendererProps {
    type: ChartType;
    config: ChartConfigData;
    data?: QueryResultData | { columns?: unknown[]; rows?: unknown[][] } | Record<string, unknown>[] | null;
    loading?: boolean;
    error?: string | null;
    className?: string;
    showTitle?: boolean;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function ChartRenderer({
    type,
    config,
    data,
    loading = false,
    error = null,
    className,
    showTitle = true,
}: ChartRendererProps) {
    // Normalize data
    const { columnNames, rows } = useMemo(() => normalizeData(data), [data]);

    // Color palette
    const palette = useMemo(() => {
        return COLOR_PALETTES[config.colorPalette || 'default'] || COLOR_PALETTES.default;
    }, [config.colorPalette]);

    // Aggregate data using client-side aggregator
    const aggregated = useMemo(() => {
        return aggregateChartData(rows, config, columnNames);
    }, [rows, config, columnNames]);

    const xAxisKey = aggregated.xAxisKey;
    const chartData = aggregated.rows;
    const seriesList = aggregated.series;

    // Build chartConfig for shadcn ChartContainer
    const chartConfig = useMemo(() => {
        const cConfig: ChartConfig = {};
        seriesList.forEach((s, idx) => {
            const safeKey = s.key.replace(/[^a-zA-Z0-9_-]/g, '_');
            const color = s.color || palette[idx % palette.length];
            cConfig[safeKey] = { label: s.label, color };
            if (safeKey !== s.key) {
                cConfig[s.key] = { label: s.label, color };
            }
        });
        return cConfig;
    }, [seriesList, palette]);

    if (loading) {
        return (
            <div className={cn('flex flex-col gap-2 p-3 w-full h-full min-h-0 justify-center items-center', className)}>
                <Skeleton className="h-6 w-48 rounded" />
                <Skeleton className="h-44 w-full rounded" />
            </div>
        );
    }

    if (error) {
        return (
            <div className={cn('p-4 w-full', className)}>
                <Alert variant="destructive">
                    <AlertCircleIcon className="size-4" />
                    <AlertTitle>Failed to render chart</AlertTitle>
                    <AlertDescription className="text-xs mt-1">{error}</AlertDescription>
                </Alert>
            </div>
        );
    }

    if (rows.length === 0 || columnNames.length === 0) {
        return (
            <div
                className={cn(
                    'flex flex-col items-center justify-center p-4 text-center text-muted-foreground w-full h-full min-h-0',
                    className
                )}
            >
                <BarChart2Icon className="size-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">No data available</p>
                <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                    Run the linked query or configure columns to display visualization.
                </p>
            </div>
        );
    }

    if (seriesList.length === 0 && (type === 'bar' || type === 'line' || type === 'row' || type === 'area')) {
        return (
            <div
                className={cn(
                    'flex flex-col items-center justify-center p-4 text-center text-muted-foreground w-full h-full min-h-0',
                    className
                )}
            >
                <BarChart2Icon className="size-8 mb-2 opacity-30" />
                <p className="text-sm font-medium">Select X and Y columns</p>
                <p className="text-xs text-muted-foreground/80 mt-1 max-w-xs">
                    Choose an X axis and at least one series from the panel to visualize your data.
                </p>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // Render: NUMBER CARD
    // -------------------------------------------------------------------------
    if (type === 'number') {
        const { formatted, label, comparison, timeDelta, sparklineData } = computeNumberCardValue(
            rows,
            config,
            columnNames
        );
        const cardTitle = config.title || label;

        return (
            <div className={cn('flex flex-col justify-between p-3.5 w-full h-full min-h-0', className)}>
                {showTitle && cardTitle && (
                    <div className="text-sm font-medium text-muted-foreground truncate mb-1">
                        {cardTitle}
                    </div>
                )}
                <div className="flex items-end justify-between gap-3 mt-auto">
                    <div className="min-w-0">
                        <div className="text-3xl font-semibold tracking-tight text-foreground font-mono tabular-nums truncate">
                            {formatted}
                        </div>
                        {timeDelta ? (
                            <div className="flex items-center gap-1 text-xs mt-1">
                                {timeDelta.isPositive ? (
                                    <span className="flex items-center font-medium text-emerald-600 dark:text-emerald-400">
                                        <TrendingUpIcon className="size-3.5 mr-0.5" />
                                        +{timeDelta.diffPct}%
                                    </span>
                                ) : (
                                    <span className="flex items-center font-medium text-rose-600 dark:text-rose-400">
                                        <TrendingDownIcon className="size-3.5 mr-0.5" />
                                        -{timeDelta.diffPct}%
                                    </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">vs previous</span>
                            </div>
                        ) : comparison ? (
                            <div className="flex items-center gap-1 text-xs mt-1">
                                {comparison.isPositive ? (
                                    <span className="flex items-center font-medium text-emerald-600 dark:text-emerald-400">
                                        <TrendingUpIcon className="size-3.5 mr-0.5" />
                                        +{comparison.diffPct}%
                                    </span>
                                ) : (
                                    <span className="flex items-center font-medium text-rose-600 dark:text-rose-400">
                                        <TrendingDownIcon className="size-3.5 mr-0.5" />
                                        {comparison.diffPct}%
                                    </span>
                                )}
                                <span className="text-[11px] text-muted-foreground">vs {comparison.label}</span>
                            </div>
                        ) : null}
                    </div>
                    {sparklineData && sparklineData.length >= 2 && (
                        <div className="w-24 sm:w-28 h-10 shrink-0">
                            <ResponsiveContainer width="100%" height="100%">
                                <AreaChart data={sparklineData} margin={{ top: 2, right: 0, bottom: 2, left: 0 }}>
                                    <defs>
                                        <linearGradient id="sparkline-gradient" x1="0" y1="0" x2="0" y2="1">
                                            <stop
                                                offset="0%"
                                                stopColor={timeDelta?.isPositive !== false ? '#10b981' : '#f43f5e'}
                                                stopOpacity={0.4}
                                            />
                                            <stop
                                                offset="100%"
                                                stopColor={timeDelta?.isPositive !== false ? '#10b981' : '#f43f5e'}
                                                stopOpacity={0}
                                            />
                                        </linearGradient>
                                    </defs>
                                    <Area
                                        type="monotone"
                                        dataKey="value"
                                        stroke={timeDelta?.isPositive !== false ? '#10b981' : '#f43f5e'}
                                        strokeWidth={1.5}
                                        fill="url(#sparkline-gradient)"
                                        dot={false}
                                        isAnimationActive={false}
                                    />
                                </AreaChart>
                            </ResponsiveContainer>
                        </div>
                    )}
                </div>
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // Render: TABLE
    // -------------------------------------------------------------------------
    if (type === 'table') {
        return <TableView columnNames={columnNames} rows={rows} config={config} className={className} />;
    }

    // -------------------------------------------------------------------------
    // Render: DONUT & PIE CHARTS
    // -------------------------------------------------------------------------
    if (type === 'donut' || type === 'pie') {
        const labelCol = config.donutLabelColumn || config.xAxis || columnNames[0] || 'label';
        const measureCol =
            config.donutValueColumn ||
            config.seriesConfig?.[0]?.column ||
            config.yAxis?.[0] ||
            columnNames.find((c) => c !== labelCol) ||
            columnNames[0];

        const pieMap = new Map<string, number>();
        for (const r of rows) {
            const name = String(r[labelCol] ?? 'Unknown');
            const val = Number(r[measureCol]) || 0;
            pieMap.set(name, (pieMap.get(name) || 0) + val);
        }

        const pieData = Array.from(pieMap.entries())
            .map(([name, value]) => ({ name, value }))
            .filter((d) => d.value > 0)
            .sort((a, b) => b.value - a.value);

        const pieConfig: ChartConfig = {};
        pieData.forEach((d, idx) => {
            const safeKey = d.name.replace(/[^a-zA-Z0-9_-]/g, '_');
            const color = palette[idx % palette.length];
            pieConfig[safeKey] = { label: d.name, color };
            if (safeKey !== d.name) {
                pieConfig[d.name] = { label: d.name, color };
            }
        });

        const isDonut = type === 'donut';
        const total = pieData.reduce((sum, item) => sum + item.value, 0);

        return (
            <div className={cn('flex h-full min-h-0 w-full flex-col overflow-hidden', className)}>
                {showTitle && config.title && (
                    <div className="text-center mb-1">
                        <h4 className="text-sm font-semibold text-foreground">{config.title}</h4>
                        {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
                    </div>
                )}
                <PieChartWithLegend
                    data={pieData}
                    palette={palette}
                    chartConfig={pieConfig}
                    showLegend={config.showLegend !== false}
                    isDonut={isDonut}
                    total={total}
                    measureLabel={measureCol || 'Total'}
                />
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // Render: ROW (Horizontal Bar Chart)
    // -------------------------------------------------------------------------
    if (type === 'row') {
        return (
            <div className={cn('w-full h-full min-h-0 min-w-0 flex flex-col overflow-hidden', className)}>
                {showTitle && config.title && (
                    <div className="mb-2 px-2">
                        <h4 className="text-sm font-semibold text-foreground">{config.title}</h4>
                        {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
                    </div>
                )}
                <ChartContainer config={chartConfig} className="h-full w-full aspect-auto min-h-0 flex-1">
                    <BarChart
                        layout="vertical"
                        data={chartData}
                        margin={{ top: 8, right: 16, bottom: 4, left: 8 }}
                        barGap={config.overlap ? -20 : 4}
                    >
                        {config.showGrid && (
                            <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />
                        )}
                        <XAxis
                            type="number"
                            hide={!config.showAxisLabel}
                            domain={[config.yMin ?? 'auto', config.yMax ?? 'auto']}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={4}
                            tickFormatter={(val) =>
                                config.normalize
                                    ? `${val}%`
                                    : typeof val === 'number'
                                      ? val.toLocaleString()
                                      : String(val)
                            }
                        />
                        <YAxis
                            type="category"
                            dataKey={xAxisKey}
                            width={80}
                            interval={0}
                            hide={!config.showAxisLabel}
                            tickLine={false}
                            axisLine={false}
                            tickMargin={4}
                            tickFormatter={(val) => (val === null || val === undefined ? '' : String(val))}
                        />
                        <ChartTooltip content={<ChartTooltipContent />} />
                        {config.referenceLines?.map((ref, idx) => (
                            <ReferenceLine
                                key={idx}
                                x={ref.value}
                                label={ref.label}
                                stroke={ref.color || 'var(--chart-1, #e11d48)'}
                                strokeDasharray="3 3"
                            />
                        ))}
                        {seriesList.map((s, idx) => {
                            const safeKey = s.key.replace(/[^a-zA-Z0-9_-]/g, '_');
                            const color = s.color || palette[idx % palette.length];
                            return (
                                <Bar
                                    key={s.key}
                                    dataKey={s.key}
                                    fill={`var(--color-${safeKey}, ${color})`}
                                    radius={[0, 4, 4, 0]}
                                    stackId={config.stacked ? 'stack' : undefined}
                                    label={
                                        config.showDataLabels
                                            ? { position: 'right', fill: 'currentColor', fontSize: 10 }
                                            : false
                                    }
                                />
                            );
                        })}
                    </BarChart>
                </ChartContainer>
                {config.showLegend && <CompactSeriesLegend series={seriesList} palette={palette} />}
            </div>
        );
    }

    // -------------------------------------------------------------------------
    // Render: BAR, LINE, AREA, COMBO CHARTS
    // -------------------------------------------------------------------------
    const angle = config.xRotateValues ? -Number(config.xRotateValues) : 0;
    const textAnchor = config.xRotateValues ? 'end' : 'middle';

    return (
        <div className={cn('w-full h-full min-h-0 min-w-0 flex flex-col overflow-hidden', className)}>
            {showTitle && config.title && (
                <div className="mb-2 px-2">
                    <h4 className="text-sm font-semibold text-foreground">{config.title}</h4>
                    {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
                </div>
            )}
            <ChartContainer config={chartConfig} className="h-full w-full aspect-auto min-h-0 flex-1">
                <ComposedChart
                    data={chartData}
                    margin={{ top: 8, right: 16, bottom: config.xRotateValues ? 16 : 4, left: 4 }}
                    barGap={config.overlap ? -20 : 4}
                >
                    {config.showGrid && <CartesianGrid vertical={false} stroke="var(--border)" strokeOpacity={0.55} />}
                    <XAxis
                        dataKey={xAxisKey}
                        hide={!config.showAxisLabel}
                        tickLine={false}
                        axisLine={false}
                        angle={angle}
                        textAnchor={textAnchor}
                        interval="preserveStartEnd"
                        height={config.xRotateValues ? 60 : 30}
                        tickMargin={config.xRotateValues ? 8 : 4}
                        minTickGap={8}
                        tickFormatter={(val) => (val === null || val === undefined ? '' : String(val))}
                    />
                    <YAxis
                        hide={!config.showAxisLabel}
                        width={55}
                        domain={[config.yMin ?? 'auto', config.yMax ?? 'auto']}
                        tickLine={false}
                        axisLine={false}
                        tickMargin={4}
                        tickFormatter={(val) =>
                            config.normalize ? `${val}%` : typeof val === 'number' ? val.toLocaleString() : String(val)
                        }
                    />
                    <ChartTooltip content={<ChartTooltipContent />} />
                    {config.referenceLines?.map((ref, idx) => (
                        <ReferenceLine
                            key={idx}
                            y={ref.value}
                            label={ref.label}
                            stroke={ref.color || 'var(--chart-1, #e11d48)'}
                            strokeDasharray="3 3"
                        />
                    ))}
                    {config.showScrollbar && (
                        <Brush dataKey={xAxisKey} height={20} stroke="var(--primary)" fill="var(--muted)" />
                    )}
                    {seriesList.map((s, idx) => {
                        const safeKey = s.key.replace(/[^a-zA-Z0-9_-]/g, '_');
                        const color = s.color || palette[idx % palette.length];
                        const seriesType = s.type || (type === 'line' ? 'line' : type === 'area' ? 'area' : 'bar');

                        if (seriesType === 'line') {
                            return (
                                <Line
                                    key={s.key}
                                    type="monotone"
                                    dataKey={s.key}
                                    stroke={`var(--color-${safeKey}, ${color})`}
                                    strokeWidth={2}
                                    dot={false}
                                    label={
                                        config.showDataLabels
                                            ? { position: 'top', fill: 'currentColor', fontSize: 10 }
                                            : false
                                    }
                                />
                            );
                        }

                        if (seriesType === 'area') {
                            return (
                                <Area
                                    key={s.key}
                                    type="monotone"
                                    dataKey={s.key}
                                    fill={`var(--color-${safeKey}, ${color})`}
                                    stroke={`var(--color-${safeKey}, ${color})`}
                                    fillOpacity={0.3}
                                    stackId={config.stacked ? 'stack' : undefined}
                                />
                            );
                        }

                        return (
                            <Bar
                                key={s.key}
                                dataKey={s.key}
                                fill={`var(--color-${safeKey}, ${color})`}
                                radius={[4, 4, 0, 0]}
                                stackId={config.stacked ? 'stack' : undefined}
                                label={
                                    config.showDataLabels
                                        ? { position: 'top', fill: 'currentColor', fontSize: 10 }
                                        : false
                                }
                            />
                        );
                    })}
                </ComposedChart>
            </ChartContainer>
            {config.showLegend && <CompactSeriesLegend series={seriesList} palette={palette} />}
        </div>
    );
}

function CompactSeriesLegend({
    series,
    palette,
}: {
    series: ReturnType<typeof aggregateChartData>['series'];
    palette: string[];
}) {
    return (
        <div className="flex max-h-10 shrink-0 flex-wrap items-center justify-center gap-x-3 gap-y-1 overflow-y-auto px-1 py-1 text-[10px]">
            {series.map((item, index) => (
                <span key={item.key} className="flex min-w-0 max-w-full items-center gap-1 text-muted-foreground">
                    <span
                        className="size-2 shrink-0 rounded-full"
                        style={{ backgroundColor: item.color || palette[index % palette.length] }}
                    />
                    <span className="max-w-32 truncate" title={item.label}>
                        {item.label}
                    </span>
                </span>
            ))}
        </div>
    );
}

function PieChartWithLegend({
    data,
    palette,
    chartConfig,
    showLegend,
    isDonut,
    total,
    measureLabel,
}: {
    data: { name: string; value: number }[];
    palette: string[];
    chartConfig: ChartConfig;
    showLegend: boolean;
    isDonut: boolean;
    total: number;
    measureLabel: string;
}) {
    const containerRef = useRef<HTMLDivElement>(null);
    const [isWide, setIsWide] = useState(false);
    const [hoveredName, setHoveredName] = useState<string | null>(null);

    useEffect(() => {
        const container = containerRef.current;
        if (!container) return;
        const observer = new ResizeObserver(([entry]) => setIsWide(entry.contentRect.width >= 480));
        observer.observe(container);
        return () => observer.disconnect();
    }, []);

    return (
        <div
            ref={containerRef}
            className={`flex min-h-0 min-w-0 flex-1 h-full w-full ${isWide ? 'flex-row' : 'flex-col'} ${showLegend ? 'gap-2' : ''}`}
        >
            <div
                className={`relative flex min-h-0 min-w-0 flex-1 ${isWide && showLegend ? 'w-[58%]' : 'w-full'}`}
            >
                <ChartContainer config={chartConfig} className="h-full w-full aspect-auto min-h-0 flex-1">
                    <PieChart margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                        <ChartTooltip
                            content={
                                <ChartTooltipContent
                                    hideLabel
                                    formatter={(value, name) => {
                                        const amount = Number(value) || 0;
                                        const percent = total > 0 ? (amount / total) * 100 : 0;
                                        return (
                                            <div className="flex min-w-36 items-center justify-between gap-4">
                                                <span>{String(name)}</span>
                                                <span className="font-mono tabular-nums">
                                                    {amount.toLocaleString()} ({percent.toFixed(1)}%)
                                                </span>
                                            </div>
                                        );
                                    }}
                                />
                            }
                        />
                        <Pie
                            data={data}
                            dataKey="value"
                            nameKey="name"
                            cx="50%"
                            cy="50%"
                            innerRadius={isDonut ? '60%' : 0}
                            outerRadius="85%"
                            paddingAngle={isDonut ? 1 : 0}
                        >
                            {data.map((item, index) => (
                                <Cell
                                    key={item.name}
                                    fill={palette[index % palette.length]}
                                    fillOpacity={hoveredName && hoveredName !== item.name ? 0.35 : 1}
                                />
                            ))}
                        </Pie>
                    </PieChart>
                </ChartContainer>
                {isDonut && (
                    <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
                        <span className="max-w-[65%] truncate text-sm font-semibold tabular-nums text-foreground">
                            {new Intl.NumberFormat(undefined, { notation: 'compact', maximumFractionDigits: 1 }).format(
                                total
                            )}
                        </span>
                        <span className="max-w-[70%] truncate text-[9px] text-muted-foreground">
                            {measureLabel || 'Total'}
                        </span>
                    </div>
                )}
            </div>
            {showLegend && (
                <TooltipProvider>
                    <div
                        className={`flex min-h-0 min-w-0 flex-col overflow-y-auto ${isWide ? 'flex-1' : 'max-h-24 shrink-0'}`}
                    >
                        {data.map((item, index) => {
                            const percent = total > 0 ? (item.value / total) * 100 : 0;
                            return (
                                <Tooltip key={item.name}>
                                    <TooltipTrigger
                                        className="flex min-h-6 w-full min-w-0 items-center gap-1.5 rounded-sm px-1 text-left text-[10px] hover:bg-muted/60"
                                        onMouseEnter={() => setHoveredName(item.name)}
                                        onMouseLeave={() => setHoveredName(null)}
                                        onFocus={() => setHoveredName(item.name)}
                                        onBlur={() => setHoveredName(null)}
                                    >
                                        <span
                                            className="size-2 shrink-0 rounded-full"
                                            style={{ backgroundColor: palette[index % palette.length] }}
                                        />
                                        <span className="min-w-0 flex-1 truncate text-foreground">{item.name}</span>
                                        <span
                                            className="min-w-0 max-w-[58%] shrink truncate text-right tabular-nums text-muted-foreground"
                                            title={`${item.value.toLocaleString()} (${percent.toFixed(1)}%)`}
                                        >
                                            {item.value.toLocaleString()} ({percent.toFixed(1)}%)
                                        </span>
                                    </TooltipTrigger>
                                    <TooltipContent>{item.name}</TooltipContent>
                                </Tooltip>
                            );
                        })}
                    </div>
                </TooltipProvider>
            )}
        </div>
    );
}

// ---------------------------------------------------------------------------
// Table subview
// ---------------------------------------------------------------------------

function TableView({
    columnNames,
    rows,
    config,
    className,
}: {
    columnNames: string[];
    rows: Record<string, unknown>[];
    config: ChartConfigData;
    className?: string;
}) {
    type RowType = Record<string, unknown>;

    const displayCols = useMemo(() => {
        if (config.visibleColumns && config.visibleColumns.length > 0) {
            const filtered = config.visibleColumns.filter((c) => columnNames.includes(c));
            if (filtered.length > 0) return filtered;
        }
        if (config.yAxis && config.yAxis.length > 0) {
            const selected = [...(config.xAxis ? [config.xAxis] : []), ...config.yAxis].filter((c) =>
                columnNames.includes(c)
            );
            if (selected.length > 0) {
                return Array.from(new Set(selected));
            }
        }
        return columnNames;
    }, [columnNames, config.xAxis, config.yAxis, config.visibleColumns]);

    const columns = useMemo<LegacyColumnDef<RowType>[]>(() => {
        return displayCols.map((colName) => ({
            id: colName,
            header: () => <span className="font-semibold text-xs whitespace-nowrap">{colName}</span>,
            accessorFn: (row: RowType) => row[colName],
            cell: ({ getValue }: { getValue: () => unknown }) => {
                const val = getValue();
                if (val === null || val === undefined) {
                    return <span className="text-muted-foreground/40 italic">null</span>;
                }
                if (typeof val === 'boolean') {
                    return val ? 'true' : 'false';
                }
                if (typeof val === 'number') {
                    return <span className="text-right font-mono tabular-nums">{val.toLocaleString()}</span>;
                }
                if (typeof val === 'string') {
                    if (/^[A-Za-z]+,\s*\d{4}$/.test(val.trim())) {
                        return <span>{val}</span>;
                    }
                    const d = parseDateSafe(val);
                    if (d) {
                        return <span>{format(d, 'MMMM, yyyy')}</span>;
                    }
                }
                return <span className="truncate">{String(val)}</span>;
            },
        }));
    }, [displayCols]);

    const table = useLegacyTable({
        data: rows,
        columns,
        getCoreRowModel: getCoreRowModel(),
    });

    return (
        <div className={cn('flex flex-col h-full overflow-hidden border rounded-md', className)}>
            {config.title && (
                <div className="p-3 border-b bg-muted/20">
                    <h4 className="text-sm font-semibold text-foreground">{config.title}</h4>
                    {config.description && <p className="text-xs text-muted-foreground">{config.description}</p>}
                </div>
            )}
            <ScrollArea className="flex-1 w-full overflow-auto">
                <Table>
                    <TableHeader className="bg-muted/30 sticky top-0 z-10">
                        {table.getHeaderGroups().map((headerGroup) => (
                            <TableRow key={headerGroup.id}>
                                {headerGroup.headers.map((header) => (
                                    <TableHead key={header.id} className="h-8 py-1.5 px-3">
                                        {flexRender(header.column.columnDef.header, header.getContext())}
                                    </TableHead>
                                ))}
                            </TableRow>
                        ))}
                    </TableHeader>
                    <TableBody>
                        {table.getRowModel().rows.map((row) => (
                            <TableRow key={row.id} className="hover:bg-muted/40">
                                {row.getVisibleCells().map((cell) => (
                                    <TableCell
                                        key={cell.id}
                                        className="py-1.5 px-3 text-xs font-mono text-muted-foreground"
                                    >
                                        {flexRender(cell.column.columnDef.cell, cell.getContext())}
                                    </TableCell>
                                ))}
                            </TableRow>
                        ))}
                    </TableBody>
                </Table>
            </ScrollArea>
        </div>
    );
}
