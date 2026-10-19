import { z } from 'zod';

// ---------------------------------------------------------------------------
// DataSource
// ---------------------------------------------------------------------------

export const sqliteSourceConfigSchema = z.object({
    path: z.string().min(1, 'File path is required'),
});

export const csvSourceConfigSchema = z.object({
    dbPath: z.string().min(1),
    tableName: z.string().min(1),
    originalFileName: z.string().min(1),
    rowCount: z.number().int().nonnegative(),
});

export const dataSourceTypeSchema = z.enum(['sqlite', 'csv']);

export const createDataSourceSchema = z.discriminatedUnion('type', [
    z.object({
        name: z.string().min(1).max(255),
        type: z.literal('sqlite'),
        config: sqliteSourceConfigSchema,
    }),
    z.object({
        name: z.string().min(1).max(255),
        type: z.literal('csv'),
        config: csvSourceConfigSchema,
    }),
]);

export const updateDataSourceSchema = z.object({
    name: z.string().min(1).max(255).optional(),
    config: sqliteSourceConfigSchema.optional(),
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
// Query
// ---------------------------------------------------------------------------

const queryModeSchema = z.enum(['builder', 'sql']);

export const createQuerySchema = z.object({
    workbookId: z.string().min(1),
    name: z.string().min(1).max(255),
    dataSourceId: z.string().min(1),
    mode: queryModeSchema.default('builder'),
    definition: z.string().default('[]'),
    sql: z.string().default(''),
});

export const updateQuerySchema = createQuerySchema.partial();

export type QueryMode = z.infer<typeof queryModeSchema>;
export type CreateQueryInput = z.infer<typeof createQuerySchema>;

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
});

export const updateChartSchema = createChartSchema.partial();

export type ChartType = z.infer<typeof chartTypeSchema>;
export type CreateChartInput = z.infer<typeof createChartSchema>;

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
