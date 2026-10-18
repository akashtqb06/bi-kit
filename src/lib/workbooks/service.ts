import { eq, inArray, sql } from "drizzle-orm";
import { db } from "@src/lib/db";
import { newId } from "@src/lib/db/id";
import { workbooks, queries, charts, dashboards, users, type Workbook } from "@src/lib/db/schema";
import { ConflictError, NotFoundError } from "@src/lib/connectors/types";
import type { CreateWorkbookInput } from "@src/lib/schemas";
import type { PolicyUser } from "@src/lib/auth/policy";

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface WorkbookPublic {
  id: string;
  name: string;
  description: string;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface WorkbookWithCounts extends WorkbookPublic {
  queriesCount: number;
  chartsCount: number;
  dashboardsCount: number;
  queryCount: number;
  chartCount: number;
  dashboardCount: number;
}

function getDefaultOwnerId(): string | null {
  const admin = db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1).get();
  if (admin) return admin.id;
  const anyUser = db.select({ id: users.id }).from(users).limit(1).get();
  if (anyUser) return anyUser.id;
  return null;
}

function toPublic(row: Workbook): WorkbookPublic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function toPublicWithCounts(
  row: Workbook,
  counts?: { queriesCount: number; chartsCount: number; dashboardsCount: number }
): WorkbookWithCounts {
  const q = counts?.queriesCount ?? 0;
  const c = counts?.chartsCount ?? 0;
  const d = counts?.dashboardsCount ?? 0;
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    queriesCount: q,
    chartsCount: c,
    dashboardsCount: d,
    queryCount: q,
    chartCount: c,
    dashboardCount: d,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export function listWorkbooks(user?: PolicyUser): WorkbookWithCounts[] {
  let queryBuilder = db
    .select({
      id: workbooks.id,
      ownerId: workbooks.ownerId,
      name: workbooks.name,
      description: workbooks.description,
      createdAt: workbooks.createdAt,
      updatedAt: workbooks.updatedAt,
      queriesCount: sql<number>`count(distinct ${queries.id})`.mapWith(Number),
      chartsCount: sql<number>`count(distinct ${charts.id})`.mapWith(Number),
      dashboardsCount: sql<number>`count(distinct ${dashboards.id})`.mapWith(Number),
    })
    .from(workbooks)
    .leftJoin(queries, eq(queries.workbookId, workbooks.id))
    .leftJoin(charts, eq(charts.workbookId, workbooks.id))
    .leftJoin(dashboards, eq(dashboards.workbookId, workbooks.id));

  if (user && user.role !== "admin") {
    queryBuilder = queryBuilder.where(eq(workbooks.ownerId, user.id)) as typeof queryBuilder;
  }

  const rows = queryBuilder
    .groupBy(workbooks.id)
    .orderBy(workbooks.createdAt)
    .all();

  return rows.map((row) => ({
    id: row.id,
    name: row.name,
    description: row.description,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    queriesCount: row.queriesCount,
    chartsCount: row.chartsCount,
    dashboardsCount: row.dashboardsCount,
    queryCount: row.queriesCount,
    chartCount: row.chartsCount,
    dashboardCount: row.dashboardsCount,
  }));
}

export function getWorkbook(id: string): Workbook {
  const row = db.select().from(workbooks).where(eq(workbooks.id, id)).get();
  if (!row) throw new NotFoundError(`Workbook "${id}" not found.`);
  return row;
}

export function getWorkbookPublic(id: string): WorkbookPublic {
  return toPublic(getWorkbook(id));
}

export function createWorkbook(
  input: CreateWorkbookInput & { ownerId?: string | null; slug?: string },
  ownerId?: string | null
): WorkbookPublic {
  const finalOwnerId = ownerId ?? input.ownerId ?? getDefaultOwnerId();
  const insertedId = newId();

  db.insert(workbooks)
    .values({
      id: insertedId,
      ownerId: finalOwnerId,
      name: input.name,
      slug: input.slug,
      description: input.description ?? "",
    })
    .run();

  const row = getWorkbook(insertedId);
  return toPublic(row);
}

export function updateWorkbook(
  id: string,
  input: Partial<CreateWorkbookInput>
): WorkbookPublic {
  getWorkbook(id); // throws if missing
  const updates: Partial<Workbook> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  db.update(workbooks).set(updates).where(eq(workbooks.id, id)).run();
  return getWorkbookPublic(id);
}

export function duplicateWorkbook(id: string, customName?: string): WorkbookWithCounts {
  const source = getWorkbook(id);
  const sourceQueries = db.select().from(queries).where(eq(queries.workbookId, id)).all();
  const sourceCharts = db.select().from(charts).where(eq(charts.workbookId, id)).all();
  const sourceDashboards = db.select().from(dashboards).where(eq(dashboards.workbookId, id)).all();

  const newWorkbookId = newId();
  const newName = customName?.trim() || `${source.name} (Copy)`;

  db.transaction((tx) => {
    tx.insert(workbooks)
      .values({
        id: newWorkbookId,
        ownerId: source.ownerId,
        name: newName,
        description: source.description,
      })
      .run();

    const queryIdMap = new Map<string, string>();
    for (const q of sourceQueries) {
      const newQueryId = newId();
      queryIdMap.set(q.id, newQueryId);
      tx.insert(queries)
        .values({
          id: newQueryId,
          workbookId: newWorkbookId,
          name: q.name,
          dataSourceId: q.dataSourceId,
          mode: q.mode,
          definition: q.definition,
          sql: q.sql,
          createdBy: q.createdBy,
        })
        .run();
    }

    const chartIdMap = new Map<string, string>();
    for (const c of sourceCharts) {
      const newChartId = newId();
      chartIdMap.set(c.id, newChartId);
      const mappedQueryId = queryIdMap.get(c.queryId) ?? c.queryId;
      tx.insert(charts)
        .values({
          id: newChartId,
          workbookId: newWorkbookId,
          queryId: mappedQueryId,
          name: c.name,
          type: c.type,
          config: c.config,
          createdBy: c.createdBy,
        })
        .run();
    }

    for (const d of sourceDashboards) {
      const newDashboardId = newId();
      let updatedLayout = d.layout;
      try {
        const layoutItems = JSON.parse(d.layout);
        if (Array.isArray(layoutItems)) {
          const remapped = layoutItems.map((item: Record<string, unknown>) => {
            if (item && typeof item.chartId === "string" && chartIdMap.has(item.chartId)) {
              return { ...item, chartId: chartIdMap.get(item.chartId) };
            }
            return item;
          });
          updatedLayout = JSON.stringify(remapped);
        }
      } catch {
        // preserve layout string if parse fails
      }

      tx.insert(dashboards)
        .values({
          id: newDashboardId,
          workbookId: newWorkbookId,
          ownerId: d.ownerId,
          name: d.name,
          layout: updatedLayout,
          filters: d.filters,
          autoRefresh: d.autoRefresh,
          createdBy: d.createdBy,
        })
        .run();
    }
  });

  const created = getWorkbook(newWorkbookId);
  return toPublicWithCounts(created, {
    queriesCount: sourceQueries.length,
    chartsCount: sourceCharts.length,
    dashboardsCount: sourceDashboards.length,
  });
}

export function bulkDeleteWorkbooks(ids: string[]): void {
  if (ids.length === 0) return;

  db.transaction((tx) => {
    tx.delete(dashboards).where(inArray(dashboards.workbookId, ids)).run();
    tx.delete(charts).where(inArray(charts.workbookId, ids)).run();
    tx.delete(queries).where(inArray(queries.workbookId, ids)).run();
    tx.delete(workbooks).where(inArray(workbooks.id, ids)).run();
  });
}

export function deleteWorkbook(id: string): void {
  getWorkbook(id); // throws if missing

  // Reject if child records exist
  if (db.select().from(queries).where(eq(queries.workbookId, id)).get()) {
    throw new ConflictError("Cannot delete: workbook has queries. Delete them first.");
  }
  if (db.select().from(charts).where(eq(charts.workbookId, id)).get()) {
    throw new ConflictError("Cannot delete: workbook has charts. Delete them first.");
  }
  if (db.select().from(dashboards).where(eq(dashboards.workbookId, id)).get()) {
    throw new ConflictError("Cannot delete: workbook has dashboards. Delete them first.");
  }

  db.delete(workbooks).where(eq(workbooks.id, id)).run();
}
