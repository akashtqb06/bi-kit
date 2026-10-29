import { z } from "zod";
import {
  sqliteSourceConfigSchema,
  csvSourceConfigSchema,
  chartConfigSchema,
  layoutItemSchema,
  dashboardFilterSchema,
  type DataSourceType,
  type SqliteSourceConfig,
  type CsvSourceConfig,
  type LayoutItem,
  type DashboardFilter,
} from "../schemas";
import { queryDefinitionSchema, type QueryDefinition } from "@src/lib/query-engine/definition";

// ---------------------------------------------------------------------------
// DataSource config — validated per source type
// ---------------------------------------------------------------------------

export function parseDataSourceConfig(
  raw: unknown,
  type: DataSourceType
): SqliteSourceConfig | CsvSourceConfig {
  let json: unknown;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`DataSource config is not valid JSON`);
    }
  } else {
    json = raw;
  }
  const schema =
    type === "sqlite" ? sqliteSourceConfigSchema : csvSourceConfigSchema;
  return schema.parse(json);
}

export function serializeDataSourceConfig(
  config: unknown
): string {
  return typeof config === "string" ? config : JSON.stringify(config);
}

// ---------------------------------------------------------------------------
// Query definition
// ---------------------------------------------------------------------------

export function parseQueryDefinition(raw: unknown): QueryDefinition {
  let json: unknown;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Query definition is not valid JSON`);
    }
  } else {
    json = raw;
  }
  return queryDefinitionSchema.parse(json);
}

export function serializeQueryDefinition(def: QueryDefinition): string {
  return JSON.stringify(def);
}

// ---------------------------------------------------------------------------
// Chart config — validated against chartConfigSchema
// ---------------------------------------------------------------------------

export type ChartConfig = z.infer<typeof chartConfigSchema>;

export function parseChartConfig(raw: unknown): ChartConfig {
  let json: unknown;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Chart config is not valid JSON`);
    }
  } else {
    json = raw ?? {};
  }
  return chartConfigSchema.passthrough().parse(json);
}

export function serializeChartConfig(config: ChartConfig | Record<string, unknown>): string {
  return JSON.stringify(config);
}

// ---------------------------------------------------------------------------
// Dashboard layout — array of react-grid-layout items
// ---------------------------------------------------------------------------

export type { LayoutItem };

export function parseDashboardLayout(raw: unknown): LayoutItem[] {
  let json: unknown;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      throw new Error(`Dashboard layout is not valid JSON`);
    }
  } else {
    json = raw;
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

export function parseDashboardFilters(raw?: unknown): DashboardFilter[] {
  if (!raw) return [];
  let json: unknown;
  if (typeof raw === "string") {
    try {
      json = JSON.parse(raw);
    } catch {
      return [];
    }
  } else {
    json = raw;
  }
  return z.array(dashboardFilterSchema).catch([]).parse(json);
}

export function serializeDashboardFilters(filters: DashboardFilter[]): string {
  return JSON.stringify(filters);
}
