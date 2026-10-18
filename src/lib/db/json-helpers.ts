import { z } from "zod";
import {
  sqliteSourceConfigSchema,
  csvSourceConfigSchema,
  layoutItemSchema,
  dashboardFilterSchema,
  type DataSourceType,
  type SqliteSourceConfig,
  type CsvSourceConfig,
  type LayoutItem,
  type DashboardFilter,
} from "../schemas";

// ---------------------------------------------------------------------------
// DataSource config — validated per source type
// ---------------------------------------------------------------------------

export function parseDataSourceConfig(
  raw: string,
  type: DataSourceType
): SqliteSourceConfig | CsvSourceConfig {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`DataSource config is not valid JSON`);
  }
  const schema =
    type === "sqlite" ? sqliteSourceConfigSchema : csvSourceConfigSchema;
  return schema.parse(json);
}

export function serializeDataSourceConfig(
  config: SqliteSourceConfig | CsvSourceConfig
): string {
  return JSON.stringify(config);
}

// ---------------------------------------------------------------------------
// Query builder definition
// Placeholder: refined schema lives here once the builder is implemented.
// ---------------------------------------------------------------------------

const builderStepSchema = z.object({
  op: z.string(),
  args: z.record(z.string(), z.unknown()).default({}),
});

const builderDefinitionSchema = z.array(builderStepSchema);

export type BuilderStep = z.infer<typeof builderStepSchema>;

export function parseQueryDefinition(raw: string): BuilderStep[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Query definition is not valid JSON`);
  }
  return builderDefinitionSchema.parse(json);
}

export function serializeQueryDefinition(steps: BuilderStep[]): string {
  return JSON.stringify(steps);
}

// ---------------------------------------------------------------------------
// Chart config — keyed by chart type; refined per-type as chart types are built
// ---------------------------------------------------------------------------

const chartConfigSchema = z.record(z.string(), z.unknown());

export type ChartConfig = z.infer<typeof chartConfigSchema>;

export function parseChartConfig(raw: string): ChartConfig {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Chart config is not valid JSON`);
  }
  return chartConfigSchema.parse(json);
}

export function serializeChartConfig(config: ChartConfig): string {
  return JSON.stringify(config);
}

// ---------------------------------------------------------------------------
// Dashboard layout — array of react-grid-layout items
// ---------------------------------------------------------------------------

export type { LayoutItem };

export function parseDashboardLayout(raw: string): LayoutItem[] {
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    throw new Error(`Dashboard layout is not valid JSON`);
  }
  return z.array(layoutItemSchema).parse(json);
}

export function serializeDashboardLayout(layout: LayoutItem[]): string {
  return JSON.stringify(layout);
}

// ---------------------------------------------------------------------------
// Dashboard filters — array of filter definitions
// ---------------------------------------------------------------------------

export type { DashboardFilter };

export function parseDashboardFilters(raw?: string | null): DashboardFilter[] {
  if (!raw) return [];
  let json: unknown;
  try {
    json = JSON.parse(raw);
  } catch {
    return [];
  }
  return z.array(dashboardFilterSchema).catch([]).parse(json);
}

export function serializeDashboardFilters(filters: DashboardFilter[]): string {
  return JSON.stringify(filters);
}


