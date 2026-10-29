import 'server-only';
import { eq } from "drizzle-orm";
import { db } from "@src/lib/db";
import { charts, workbooks, type Chart } from "@src/lib/db/schema";
import { NotFoundError } from "@src/lib/connectors/types";
import { getQuery } from "@src/lib/queries/service";
import { parseChartConfig } from "@src/lib/db/json-helpers";
import { validateFolderAssignment } from "@src/lib/folders/service";
import { newId } from "@src/lib/db/id";
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
  folderId?: string | null;
  position?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
  createdBy?: string | null;
}

function toPublic(row: Chart): ChartPublic {
  return {
    id: row.id,
    workbookId: row.workbookId,
    queryId: row.queryId,
    name: row.name,
    type: row.type,
    config: parseChartConfig(row.config),
    folderId: row.folderId,
    position: row.position,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    createdBy: row.createdBy,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listCharts(
  workbookId?: string,
  user?: { id: string; role: string }
): Promise<ChartPublic[]> {
  if (workbookId) {
    if (user && user.role !== "admin") {
      const [wb] = await db.select().from(workbooks).where(eq(workbooks.id, workbookId)).limit(1);
      if (!wb || wb.ownerId !== user.id) return [];
    }
    const rows = await db.select().from(charts).where(eq(charts.workbookId, workbookId));
    return rows.map(toPublic);
  }

  if (user && user.role !== "admin") {
    const rows = await db
      .select({ chart: charts })
      .from(charts)
      .innerJoin(workbooks, eq(charts.workbookId, workbooks.id))
      .where(eq(workbooks.ownerId, user.id));
    return rows.map((r) => toPublic(r.chart));
  }

  const rows = await db.select().from(charts);
  return rows.map(toPublic);
}

export async function getChart(id: string): Promise<Chart> {
  const [row] = await db.select().from(charts).where(eq(charts.id, id)).limit(1);
  if (!row) throw new NotFoundError(`Chart "${id}" not found.`);
  return row;
}

export async function getChartPublic(id: string): Promise<ChartPublic> {
  return toPublic(await getChart(id));
}

export async function createChart(input: CreateChartInput, createdBy?: string): Promise<ChartPublic> {
  // Derive workbookId from query (enforces same-workbook relationship)
  const query = await getQuery(input.queryId);
  if (input.folderId) {
    await validateFolderAssignment(input.folderId, query.workbookId, 'chart');
  }

  const id = newId();
  await db.insert(charts).values({
    id,
    workbookId: query.workbookId,
    queryId: input.queryId,
    name: input.name,
    type: input.type,
    config: input.config ?? {},
    folderId: input.folderId ?? null,
    position: input.position ?? 0,
    createdBy: createdBy ?? null,
  });

  return await getChartPublic(id);
}

export async function updateChart(
  id: string,
  input: Partial<CreateChartInput>
): Promise<ChartPublic> {
  const existing = await getChart(id); // throws if missing
  const updates: Partial<typeof charts.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.type !== undefined) updates.type = input.type;
  if (input.config !== undefined) updates.config = input.config;
  if (input.folderId !== undefined) {
    if (input.folderId !== null) {
      await validateFolderAssignment(input.folderId, existing.workbookId, 'chart');
    }
    updates.folderId = input.folderId ?? null;
  }
  if (input.position !== undefined) updates.position = input.position;
  if (input.queryId !== undefined) {
    const q = await getQuery(input.queryId);
    if (q.workbookId !== existing.workbookId) {
      throw new Error("Chart query must belong to the same workbook.");
    }
    updates.queryId = input.queryId;
  }
  await db.update(charts).set(updates).where(eq(charts.id, id));
  return await getChartPublic(id);
}

export async function deleteChart(id: string): Promise<void> {
  await getChart(id); // throws if missing
  // Dashboards reference chartId in layout JSON (not a DB FK) — safe to delete
  await db.delete(charts).where(eq(charts.id, id));
}
