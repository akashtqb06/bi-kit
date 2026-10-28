import { z } from 'zod';

// ---------------------------------------------------------------------------
// DataSource
// ---------------------------------------------------------------------------

export const sqliteSourceConfigSchema = z.object({
    path: z.string().min(1, 'File path is required').optional(),
    managedPath: z.string().optional(),
    serverPath: z.string().optional(),
    fileName: z.string().optional(),
    size: z.number().optional(),
    importedAt: z.string().optional(),
});

export const csvSourceConfigSchema = z.object({
    dbPath: z.string().optional(),
    managedPath: z.string().optional(),
    tableName: z.string().optional(),
    originalFileName: z.string().optional(),
    fileName: z.string().optional(),
    rowCount: z.number().int().nonnegative().optional(),
});

export const dataSourceTypeSchema = z.string().min(1);

export const createDataSourceSchema = z.object({
    name: z.string().min(1).max(255),
    type: z.string().min(1),
    config: z.union([z.record(z.string(), z.unknown()), z.string()]).optional(),
    previewToken: z.string().optional(),
    options: z.record(z.string(), z.unknown()).optional(),
});

export const updateDataSourceSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    config: z.record(z.string(), z.unknown()).optional(),
});

export const bulkDeleteDataSourcesSchema = z.object({
    ids: z.array(z.string().min(1)).min(1, 'At least one data source ID is required'),
});

export type DataSourceType = z.infer<typeof dataSourceTypeSchema>;
export type SqliteSourceConfig = z.infer<typeof sqliteSourceConfigSchema>;
export type CsvSourceConfig = z.infer<typeof csvSourceConfigSchema>;
export type CreateDataSourceInput = z.infer<typeof createDataSourceSchema>;
export type BulkDeleteDataSourcesInput = z.infer<typeof bulkDeleteDataSourcesSchema>;

// ---------------------------------------------------------------------------
// Workbook
// ---------------------------------------------------------------------------

export const createWorkbookSchema = z.object({
    name: z.string().min(1).max(255),
    description: z.string().max(1000).default(''),
});

export const updateWorkbookSchema = createWorkbookSchema.partial();

export const bulkDeleteWorkbooksSchema = z.object({
    ids: z.array(z.string().min(1)).min(1, 'At least one workbook ID is required'),
});

export const duplicateWorkbookSchema = z.object({
    name: z.string().min(1).max(255).optional(),
}).optional();

export type CreateWorkbookInput = z.input<typeof createWorkbookSchema>;
export type BulkDeleteWorkbooksInput = z.infer<typeof bulkDeleteWorkbooksSchema>;
export type DuplicateWorkbookInput = z.infer<typeof duplicateWorkbookSchema>;

// ---------------------------------------------------------------------------
// Folder
// ---------------------------------------------------------------------------

export const folderKindSchema = z.enum(['query', 'chart', 'dashboard']);
export type FolderKind = z.infer<typeof folderKindSchema>;

export const folderNameSchema = z
    .string()
    .trim()
    .min(1, 'Folder name is required')
    .max(60, 'Folder name cannot exceed 60 characters');

export const createFolderSchema = z.object({
    workbookId: z.string().min(1),
    kind: folderKindSchema,
    name: folderNameSchema,
    parentId: z.string().nullable().optional(),
    position: z.number().int().optional(),
});

export const updateFolderSchema = z.object({
    name: folderNameSchema.optional(),
    position: z.number().int().optional(),
});

export const deleteFolderModeSchema = z.enum(['keep', 'delete']).default('keep');

export type CreateFolderInput = z.infer<typeof createFolderSchema>;
export type UpdateFolderInput = z.infer<typeof updateFolderSchema>;
export type DeleteFolderMode = z.infer<typeof deleteFolderModeSchema>;

// ---------------------------------------------------------------------------
// Query
// ---------------------------------------------------------------------------

const queryModeSchema = z.enum(['builder', 'sql', 'pipeline']);

export const createQuerySchema = z.object({
    workbookId: z.string().min(1),
    name: z.string().min(1).max(255),
    dataSourceId: z.string().min(1),
    mode: queryModeSchema.default('builder'),
    definition: z
        .union([z.string(), z.record(z.string(), z.unknown()), z.array(z.unknown())])
        .transform((val) => (typeof val === 'string' ? val : JSON.stringify(val)))
        .default('[]'),
    sql: z.string().default(''),
    folderId: z.string().nullable().optional(),
    position: z.number().int().optional(),
});

export const updateQuerySchema = createQuerySchema.partial();

export type QueryMode = z.infer<typeof queryModeSchema>;
export type CreateQueryInput = z.input<typeof createQuerySchema>;

// ---------------------------------------------------------------------------
// Chart
// ---------------------------------------------------------------------------

export const chartTypeSchema = z.enum(['bar', 'line', 'row', 'donut', 'pie', 'area', 'number', 'table']);

const dateGrainSchema = z.enum(['day', 'week', 'month', 'quarter', 'year']);
export type DateGrain = z.infer<typeof dateGrainSchema>;

const chartSeriesConfigSchema = z.object({
    column: z.string(),
    aggregation: z.enum(['sum', 'avg', 'count', 'min', 'max']).default('sum'),
    label: z.string().optional(),
    color: z.string().optional(),
    type: z.enum(['bar', 'line']).optional(),
});
export type ChartSeriesConfig = z.infer<typeof chartSeriesConfigSchema>;

const referenceLineSchema = z.object({
    label: z.string().default(''),
    value: z.number().default(0),
    color: z.string().default('#e11d48'),
});
export type ReferenceLine = z.infer<typeof referenceLineSchema>;

// ---------------------------------------------------------------------------
// Chart Text Styling
// ---------------------------------------------------------------------------

export const chartFontWeightSchema = z.enum(['normal', 'medium', 'semibold', 'bold']);
export type ChartFontWeight = z.infer<typeof chartFontWeightSchema>;

export const chartTextAlignSchema = z.enum(['left', 'center', 'right']);
export type ChartTextAlign = z.infer<typeof chartTextAlignSchema>;

export const chartTitleStyleSchema = z.object({
    fontFamily: z.string().default('inherit'),
    fontSize: z.number().min(12).max(48).default(14),
    fontWeight: chartFontWeightSchema.default('medium'),
    align: chartTextAlignSchema.default('left'),
    color: z.string().optional(),
    show: z.boolean().default(true),
});
export type ChartTitleStyle = z.infer<typeof chartTitleStyleSchema>;

export const chartSubtitleStyleSchema = z.object({
    text: z.string().optional(),
    fontFamily: z.string().default('inherit'),
    fontSize: z.number().min(8).max(36).default(12),
    color: z.string().optional(),
});
export type ChartSubtitleStyle = z.infer<typeof chartSubtitleStyleSchema>;

export const chartAxisLabelsStyleSchema = z.object({
    fontFamily: z.string().default('inherit'),
    fontSize: z.number().min(8).max(24).default(12),
    color: z.string().optional(),
});
export type ChartAxisLabelsStyle = z.infer<typeof chartAxisLabelsStyleSchema>;

export const chartLegendStyleSchema = z.object({
    fontFamily: z.string().default('inherit'),
    fontSize: z.number().min(8).max(24).default(12),
    color: z.string().optional(),
    show: z.boolean().default(true),
});
export type ChartLegendStyle = z.infer<typeof chartLegendStyleSchema>;

export const chartDataLabelsStyleSchema = z.object({
    fontFamily: z.string().default('inherit'),
    fontSize: z.number().min(8).max(24).default(11),
    fontWeight: chartFontWeightSchema.optional().default('normal'),
    color: z.string().optional(),
});
export type ChartDataLabelsStyle = z.infer<typeof chartDataLabelsStyleSchema>;

export const chartNumberValueStyleSchema = z.object({
    fontSize: z.number().min(20).max(96).default(36),
    fontWeight: chartFontWeightSchema.default('semibold'),
});
export type ChartNumberValueStyle = z.infer<typeof chartNumberValueStyleSchema>;

export const chartTextStyleSchema = z.object({
    title: chartTitleStyleSchema.partial().optional(),
    subtitle: chartSubtitleStyleSchema.partial().optional(),
    axisLabels: chartAxisLabelsStyleSchema.partial().optional(),
    legend: chartLegendStyleSchema.partial().optional(),
    dataLabels: chartDataLabelsStyleSchema.partial().optional(),
    numberValue: chartNumberValueStyleSchema.partial().optional(),
});
export type ChartTextStyle = z.infer<typeof chartTextStyleSchema>;

export interface NormalizedChartTextStyle {
    title: {
        fontFamily: string;
        fontSize: number;
        fontWeight: ChartFontWeight;
        align: ChartTextAlign;
        color?: string;
        show: boolean;
    };
    subtitle: {
        text?: string;
        fontFamily: string;
        fontSize: number;
        color?: string;
    };
    axisLabels: {
        fontFamily: string;
        fontSize: number;
        color?: string;
    };
    legend: {
        fontFamily: string;
        fontSize: number;
        color?: string;
        show: boolean;
    };
    dataLabels: {
        fontFamily: string;
        fontSize: number;
        fontWeight: ChartFontWeight;
        color?: string;
    };
    numberValue: {
        fontSize: number;
        fontWeight: ChartFontWeight;
    };
}

function clampNumber(val: unknown, min: number, max: number, fallback: number): number {
    if (typeof val !== 'number' || isNaN(val)) return fallback;
    return Math.min(Math.max(val, min), max);
}

const VALID_WEIGHTS = new Set<string>(['normal', 'medium', 'semibold', 'bold']);
const VALID_ALIGNS = new Set<string>(['left', 'center', 'right']);

export function normalizeTextStyle(
    config?: { textStyle?: unknown } | Partial<ChartConfigData> | null
): NormalizedChartTextStyle {
    const raw = (config && typeof config === 'object' && 'textStyle' in config
        ? (config as { textStyle?: unknown }).textStyle
        : config) as Record<string, unknown> | undefined;

    const rawTitle = (raw?.title as Record<string, unknown> | undefined) || {};
    const rawSubtitle = (raw?.subtitle as Record<string, unknown> | undefined) || {};
    const rawAxisLabels = (raw?.axisLabels as Record<string, unknown> | undefined) || {};
    const rawLegend = (raw?.legend as Record<string, unknown> | undefined) || {};
    const rawDataLabels = (raw?.dataLabels as Record<string, unknown> | undefined) || {};
    const rawNumberValue = (raw?.numberValue as Record<string, unknown> | undefined) || {};

    const titleWeight = typeof rawTitle.fontWeight === 'string' && VALID_WEIGHTS.has(rawTitle.fontWeight)
        ? (rawTitle.fontWeight as ChartFontWeight)
        : 'medium';
    const titleAlign = typeof rawTitle.align === 'string' && VALID_ALIGNS.has(rawTitle.align)
        ? (rawTitle.align as ChartTextAlign)
        : 'left';
    const dataLabelsWeight = typeof rawDataLabels.fontWeight === 'string' && VALID_WEIGHTS.has(rawDataLabels.fontWeight)
        ? (rawDataLabels.fontWeight as ChartFontWeight)
        : 'normal';
    const numberValueWeight = typeof rawNumberValue.fontWeight === 'string' && VALID_WEIGHTS.has(rawNumberValue.fontWeight)
        ? (rawNumberValue.fontWeight as ChartFontWeight)
        : 'semibold';

    const subtitleText = typeof rawSubtitle.text === 'string' ? rawSubtitle.text.trim() : undefined;

    return {
        title: {
            fontFamily: typeof rawTitle.fontFamily === 'string' && rawTitle.fontFamily.trim() ? rawTitle.fontFamily.trim() : 'inherit',
            fontSize: clampNumber(rawTitle.fontSize, 12, 48, 14),
            fontWeight: titleWeight,
            align: titleAlign,
            color: typeof rawTitle.color === 'string' && rawTitle.color.trim() ? rawTitle.color.trim() : undefined,
            show: rawTitle.show !== false,
        },
        subtitle: {
            text: subtitleText && subtitleText.length > 0 ? subtitleText : undefined,
            fontFamily: typeof rawSubtitle.fontFamily === 'string' && rawSubtitle.fontFamily.trim() ? rawSubtitle.fontFamily.trim() : 'inherit',
            fontSize: clampNumber(rawSubtitle.fontSize, 8, 36, 12),
            color: typeof rawSubtitle.color === 'string' && rawSubtitle.color.trim() ? rawSubtitle.color.trim() : undefined,
        },
        axisLabels: {
            fontFamily: typeof rawAxisLabels.fontFamily === 'string' && rawAxisLabels.fontFamily.trim() ? rawAxisLabels.fontFamily.trim() : 'inherit',
            fontSize: clampNumber(rawAxisLabels.fontSize, 8, 24, 12),
            color: typeof rawAxisLabels.color === 'string' && rawAxisLabels.color.trim() ? rawAxisLabels.color.trim() : undefined,
        },
        legend: {
            fontFamily: typeof rawLegend.fontFamily === 'string' && rawLegend.fontFamily.trim() ? rawLegend.fontFamily.trim() : 'inherit',
            fontSize: clampNumber(rawLegend.fontSize, 8, 24, 12),
            color: typeof rawLegend.color === 'string' && rawLegend.color.trim() ? rawLegend.color.trim() : undefined,
            show: rawLegend.show !== false,
        },
        dataLabels: {
            fontFamily: typeof rawDataLabels.fontFamily === 'string' && rawDataLabels.fontFamily.trim() ? rawDataLabels.fontFamily.trim() : 'inherit',
            fontSize: clampNumber(rawDataLabels.fontSize, 8, 24, 11),
            fontWeight: dataLabelsWeight,
            color: typeof rawDataLabels.color === 'string' && rawDataLabels.color.trim() ? rawDataLabels.color.trim() : undefined,
        },
        numberValue: {
            fontSize: clampNumber(rawNumberValue.fontSize, 20, 96, 36),
            fontWeight: numberValueWeight,
        },
    };
}

export const chartConfigSchema = z.object({
    title: z.string().optional(),
    description: z.string().optional(),
    xAxis: z.string().nullable().optional(),
    xDateGrain: dateGrainSchema.optional(),
    xFormat: z.string().optional(),
    xRotateValues: z.union([z.literal(0), z.literal(45), z.literal(90), z.literal('0'), z.literal('45'), z.literal('90')]).default(0),
    yAxis: z.array(z.string()).default([]),
    seriesConfig: z.array(chartSeriesConfigSchema).default([]),
    series: z.string().optional(),
    splitBy: z.string().nullable().optional(),
    stacked: z.boolean().default(false),
    overlap: z.boolean().default(false),
    normalize: z.boolean().default(false),
    showDataLabels: z.boolean().default(false),
    showAxisLabel: z.boolean().default(true),
    showScrollbar: z.boolean().default(false),
    yMin: z.number().nullable().optional(),
    yMax: z.number().nullable().optional(),
    referenceLines: z.array(referenceLineSchema).default([]),
    colorPalette: z.string().default('default'),
    showLegend: z.boolean().default(true),
    showGrid: z.boolean().default(true),
    numberValueColumn: z.string().nullable().optional(),
    numberAggregation: z.enum(['first', 'sum', 'avg', 'count', 'min', 'max']).default('first'),
    numberPrefix: z.string().default(''),
    numberSuffix: z.string().default(''),
    numberDecimals: z.number().int().min(0).max(10).nullable().optional(),
    numberComparisonColumn: z.string().nullable().optional(),
    numberFormat: z.enum(['none', 'number', 'currency', 'percent', 'compact']).default('none'),
    donutLabelColumn: z.string().nullable().optional(),
    donutValueColumn: z.string().nullable().optional(),
    visibleColumns: z.array(z.string()).optional(),
    sortX: z.enum(['none', 'asc', 'desc']).default('none'),
    textStyle: chartTextStyleSchema.optional(),
});

export type ChartConfigData = z.infer<typeof chartConfigSchema>;

export const defaultChartConfig: ChartConfigData = {
    yAxis: [],
    seriesConfig: [],
    stacked: false,
    overlap: false,
    normalize: false,
    showDataLabels: false,
    showAxisLabel: true,
    showScrollbar: false,
    referenceLines: [],
    xRotateValues: 0,
    colorPalette: 'default',
    showLegend: true,
    showGrid: true,
    numberAggregation: 'first',
    numberPrefix: '',
    numberSuffix: '',
    numberFormat: 'none',
    sortX: 'none',
};

export const createChartSchema = z.object({
    name: z.string().min(1).max(255),
    queryId: z.string().min(1),
    type: chartTypeSchema,
    config: chartConfigSchema.passthrough().default(defaultChartConfig),
    folderId: z.string().nullable().optional(),
    position: z.number().int().optional(),
});

export const updateChartSchema = createChartSchema.partial();

export type ChartType = z.infer<typeof chartTypeSchema>;
export type CreateChartInput = z.input<typeof createChartSchema>;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const layoutItemSchema = z.object({
    i: z.string(),
    chartId: z.string().optional(),
    widgetType: z.enum(['chart', 'text', 'filter']).optional(),
    title: z.string().optional(),
    text: z.string().optional(),
    filterId: z.string().optional(),
    chartType: z.string().optional(),
    x: z.number().int().nonnegative(),
    y: z.number().int().nonnegative(),
    w: z.number().int().positive(),
    h: z.number().int().positive(),
});

const dashboardFilterTypeSchema = z.enum(['date_range', 'select']);

export const dashboardFilterSchema = z.object({
    id: z.string(),
    name: z.string().min(1).max(255),
    column: z.string().min(1).max(255),
    type: dashboardFilterTypeSchema,
    defaultValue: z.unknown().optional(),
});

export type DashboardFilterType = z.infer<typeof dashboardFilterTypeSchema>;
export type DashboardFilter = z.infer<typeof dashboardFilterSchema>;

export const createDashboardSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    title: z.string().min(1).max(255).optional(),
    isFavorite: z.boolean().optional(),
    autoRefresh: z.enum(['off', '30s', '1m', '5m']).optional(),
    layout: z.array(layoutItemSchema).default([]),
    filters: z.array(dashboardFilterSchema).default([]),
    folderId: z.string().nullable().optional(),
    position: z.number().int().optional(),
});

export const updateDashboardSchema = createDashboardSchema.partial();

export const duplicateDashboardSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    title: z.string().min(1).max(255).optional(),
}).optional();

export const bulkDeleteDashboardsSchema = z.object({
    ids: z.array(z.string().min(1)).min(1, 'At least one dashboard ID is required'),
});

export type LayoutItem = z.infer<typeof layoutItemSchema>;
export type CreateDashboardInput = z.input<typeof createDashboardSchema>;
export type DuplicateDashboardInput = z.infer<typeof duplicateDashboardSchema>;
export type BulkDeleteDashboardsInput = z.infer<typeof bulkDeleteDashboardsSchema>;
