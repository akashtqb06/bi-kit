import { eq } from "drizzle-orm";
import { db } from "@src/lib/db";
import { charts, type Chart } from "@src/lib/db/schema";
import { NotFoundError } from "@src/lib/connectors/types";
import { getQuery } from "@src/lib/queries/service";
import { parseChartConfig, serializeChartConfig } from "@src/lib/db/json-helpers";
import type { CreateChartInput } from "@src/lib/schemas";

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface ChartPublic {
  id: string;
  workbookId: string;
  queryId: string;
  name: string;
  type: string;
  config: Record<string, unknown>;
  createdAt: Date | null;
  updatedAt: Date | null;
}

function toPublic(row: Chart): ChartPublic {
  return {
    id: row.id,
    workbookId: row.workbookId,
    queryId: row.queryId,
    name: row.name,
    type: row.type,
    config: parseChartConfig(row.config),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export function listCharts(workbookId?: string): ChartPublic[] {
  const rows = workbookId
    ? db.select().from(charts).where(eq(charts.workbookId, workbookId)).all()
    : db.select().from(charts).all();
  return rows.map(toPublic);
}

export function getChart(id: string): Chart {
  const row = db.select().from(charts).where(eq(charts.id, id)).get();
  if (!row) throw new NotFoundError(`Chart "${id}" not found.`);
  return row;
}

export function getChartPublic(id: string): ChartPublic {
  return toPublic(getChart(id));
}

export function createChart(input: CreateChartInput): ChartPublic {
  // Derive workbookId from query (enforces same-workbook relationship)
  const query = getQuery(input.queryId);

  db.insert(charts)
    .values({
      workbookId: query.workbookId,
      queryId: input.queryId,
      name: input.name,
      type: input.type,
      config: serializeChartConfig(input.config ?? {}),
    })
    .run();

  const rows = db.select().from(charts).orderBy(charts.createdAt).all();
  const row = rows.at(-1);
  if (!row) throw new Error("Insert succeeded but row not found");
  return toPublic(row);
}

export function updateChart(
  id: string,
  input: Partial<CreateChartInput>
): ChartPublic {
  getChart(id); // throws if missing
  const updates: Partial<Chart> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.type !== undefined) updates.type = input.type;
  if (input.config !== undefined) updates.config = serializeChartConfig(input.config);
  if (input.queryId !== undefined) {
    getQuery(input.queryId);
    updates.queryId = input.queryId;
  }
  db.update(charts).set(updates).where(eq(charts.id, id)).run();
  return getChartPublic(id);
}

export function deleteChart(id: string): void {
  getChart(id); // throws if missing
  // Dashboards reference chartId in layout JSON (not a DB FK) — safe to delete
  db.delete(charts).where(eq(charts.id, id)).run();
}

