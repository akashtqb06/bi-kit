import 'server-only';
import { and, eq, inArray, sql } from "drizzle-orm";
import { db } from "@src/lib/db";
import { newId } from "@src/lib/db/id";
import { workbooks, queries, charts, dashboards, folders, users, type Workbook } from "@src/lib/db/schema";
import { ConflictError, NotFoundError } from "@src/lib/connectors/types";
import { listFolders, type FolderPublic } from "@src/lib/folders/service";
import type { CreateWorkbookInput } from "@src/lib/schemas";
import type { PolicyUser } from "@src/lib/auth/policy";

// ---------------------------------------------------------------------------
// Public shape
// ---------------------------------------------------------------------------

export interface WorkbookPublic {
  id: string;
  name: string;
  description: string;
  folders?: FolderPublic[];
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface WorkbookWithCounts extends WorkbookPublic {
  ownerId?: string;
  owner?: { id: string; name: string | null; email: string; avatarUrl?: string | null };
  queriesCount: number;
  chartsCount: number;
  dashboardsCount: number;
  queryCount: number;
  chartCount: number;
  dashboardCount: number;
}

async function getDefaultOwnerId(): Promise<string | null> {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (admin) return admin.id;
  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (anyUser) return anyUser.id;
  return null;
}

function toPublic(row: Workbook, foldersList?: FolderPublic[]): WorkbookPublic {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    folders: foldersList,
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
    ownerId: row.ownerId,
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

export async function listWorkbooks(user?: PolicyUser): Promise<WorkbookWithCounts[]> {
  let queryBuilder = db
    .select({
      id: workbooks.id,
      ownerId: workbooks.ownerId,
      name: workbooks.name,
      description: workbooks.description,
      createdAt: workbooks.createdAt,
      updatedAt: workbooks.updatedAt,
      ownerName: users.name,
      ownerEmail: users.email,
      ownerAvatarUrl: users.avatarUrl,
      queriesCount: sql<number>`count(distinct ${queries.id})`.mapWith(Number),
      chartsCount: sql<number>`count(distinct ${charts.id})`.mapWith(Number),
      dashboardsCount: sql<number>`count(distinct ${dashboards.id})`.mapWith(Number),
    })
    .from(workbooks)
    .leftJoin(users, eq(workbooks.ownerId, users.id))
    .leftJoin(queries, eq(queries.workbookId, workbooks.id))
    .leftJoin(charts, eq(charts.workbookId, workbooks.id))
    .leftJoin(dashboards, eq(dashboards.workbookId, workbooks.id));

  if (user && user.role !== "admin") {
    queryBuilder = queryBuilder.where(eq(workbooks.ownerId, user.id)) as typeof queryBuilder;
  }

  const rows = await queryBuilder
    .groupBy(workbooks.id, users.id)
    .orderBy(workbooks.createdAt);

  return rows.map((row) => ({
    id: row.id,
    ownerId: row.ownerId,
    owner: row.ownerId
      ? {
          id: row.ownerId,
          name: row.ownerName,
          email: row.ownerEmail ?? "",
          avatarUrl: row.ownerAvatarUrl,
        }
      : undefined,
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

export async function getWorkbook(id: string): Promise<Workbook> {
  const [row] = await db.select().from(workbooks).where(eq(workbooks.id, id)).limit(1);
  if (!row) throw new NotFoundError(`Workbook "${id}" not found.`);
  return row;
}

export async function getWorkbookPublic(id: string): Promise<WorkbookPublic> {
  const wb = await getWorkbook(id);
  const fList = await listFolders(id);
  return toPublic(wb, fList);
}

export async function createWorkbook(
  input: CreateWorkbookInput & { ownerId?: string | null; slug?: string },
  ownerId?: string | null
): Promise<WorkbookPublic> {
  const finalOwnerId = ownerId ?? input.ownerId ?? (await getDefaultOwnerId());
  const insertedId = newId();

  await db.insert(workbooks).values({
    id: insertedId,
    ownerId: finalOwnerId!,
    name: input.name,
    slug: input.slug,
    description: input.description ?? "",
  });

  const row = await getWorkbook(insertedId);
  return toPublic(row);
}

export async function updateWorkbook(
  id: string,
  input: Partial<CreateWorkbookInput>
): Promise<WorkbookPublic> {
  await getWorkbook(id); // throws if missing
  const updates: Partial<typeof workbooks.$inferInsert> = { updatedAt: new Date() };
  if (input.name !== undefined) updates.name = input.name;
  if (input.description !== undefined) updates.description = input.description;
  await db.update(workbooks).set(updates).where(eq(workbooks.id, id));
  return await getWorkbookPublic(id);
}

export async function duplicateWorkbook(id: string, customName?: string, ownerId?: string): Promise<WorkbookWithCounts> {
  const source = await getWorkbook(id);
  const sourceFolders = await db.select().from(folders).where(eq(folders.workbookId, id));
  const sourceQueries = await db.select().from(queries).where(eq(queries.workbookId, id));
  const sourceCharts = await db.select().from(charts).where(eq(charts.workbookId, id));
  const sourceDashboards = await db.select().from(dashboards).where(eq(dashboards.workbookId, id));

  const newWorkbookId = newId();
  const newName = customName?.trim() || `${source.name} (Copy)`;
  const finalOwnerId = ownerId ?? source.ownerId;

  await db.transaction(async (tx) => {
    await tx.insert(workbooks).values({
      id: newWorkbookId,
      ownerId: finalOwnerId,
      name: newName,
      description: source.description,
    });

    const folderIdMap = new Map<string, string>();
    for (const f of sourceFolders) {
      const newFolderId = newId();
      folderIdMap.set(f.id, newFolderId);
      await tx.insert(folders).values({
        id: newFolderId,
        workbookId: newWorkbookId,
        kind: f.kind,
        name: f.name,
        parentId: f.parentId ? (folderIdMap.get(f.parentId) ?? null) : null,
        position: f.position,
      });
    }

    const queryIdMap = new Map<string, string>();
    for (const q of sourceQueries) {
      const newQueryId = newId();
      queryIdMap.set(q.id, newQueryId);
      await tx.insert(queries).values({
        id: newQueryId,
        workbookId: newWorkbookId,
        name: q.name,
        dataSourceId: q.dataSourceId,
        mode: q.mode,
        definition: q.definition,
        sql: q.sql,
        folderId: q.folderId ? (folderIdMap.get(q.folderId) ?? null) : null,
        position: q.position,
        createdBy: finalOwnerId,
      });
    }

    const chartIdMap = new Map<string, string>();
    for (const c of sourceCharts) {
      const newChartId = newId();
      chartIdMap.set(c.id, newChartId);
      const mappedQueryId = queryIdMap.get(c.queryId) ?? c.queryId;
      await tx.insert(charts).values({
        id: newChartId,
        workbookId: newWorkbookId,
        queryId: mappedQueryId,
        name: c.name,
        type: c.type,
        config: c.config,
        folderId: c.folderId ? (folderIdMap.get(c.folderId) ?? null) : null,
        position: c.position,
        createdBy: finalOwnerId,
      });
    }

    for (const d of sourceDashboards) {
      const newDashboardId = newId();
      let updatedLayout = d.layout;
      if (Array.isArray(d.layout)) {
        updatedLayout = d.layout.map((item: Record<string, unknown>) => {
          if (item && typeof item.chartId === "string" && chartIdMap.has(item.chartId)) {
            return { ...item, chartId: chartIdMap.get(item.chartId) };
          }
          return item;
        });
      } else if (typeof d.layout === 'string') {
        try {
          const layoutItems = JSON.parse(d.layout);
          if (Array.isArray(layoutItems)) {
            const remapped = layoutItems.map((item: Record<string, unknown>) => {
              if (item && typeof item.chartId === "string" && chartIdMap.has(item.chartId)) {
                return { ...item, chartId: chartIdMap.get(item.chartId) };
              }
              return item;
            });
            updatedLayout = remapped;
          }
        } catch {
          // preserve layout
        }
      }

      await tx.insert(dashboards).values({
        id: newDashboardId,
        workbookId: newWorkbookId,
        ownerId: finalOwnerId,
        name: d.name,
        layout: updatedLayout,
        filters: d.filters,
        autoRefresh: d.autoRefresh,
        folderId: d.folderId ? (folderIdMap.get(d.folderId) ?? null) : null,
        position: d.position,
        createdBy: finalOwnerId,
      });
    }
  });

  const created = await getWorkbook(newWorkbookId);
  return toPublicWithCounts(created, {
    queriesCount: sourceQueries.length,
    chartsCount: sourceCharts.length,
    dashboardsCount: sourceDashboards.length,
  });
}

export async function bulkDeleteWorkbooks(ids: string[], user?: PolicyUser): Promise<void> {
  if (ids.length === 0) return;

  const targetIds = user && user.role !== "admin"
    ? (await db.select({ id: workbooks.id }).from(workbooks).where(and(inArray(workbooks.id, ids), eq(workbooks.ownerId, user.id)))).map(r => r.id)
    : ids;
  if (targetIds.length === 0) return;

  await db.transaction(async (tx) => {
    await tx.delete(dashboards).where(inArray(dashboards.workbookId, targetIds));
    await tx.delete(charts).where(inArray(charts.workbookId, targetIds));
    await tx.delete(queries).where(inArray(queries.workbookId, targetIds));
    await tx.delete(folders).where(inArray(folders.workbookId, targetIds));
    await tx.delete(workbooks).where(inArray(workbooks.id, targetIds));
  });
}

export async function deleteWorkbook(id: string): Promise<void> {
  await getWorkbook(id); // throws if missing

  // Reject if child records exist
  const [hasQueries] = await db.select().from(queries).where(eq(queries.workbookId, id)).limit(1);
  if (hasQueries) {
    throw new ConflictError("Cannot delete: workbook has queries. Delete them first.");
  }
  const [hasCharts] = await db.select().from(charts).where(eq(charts.workbookId, id)).limit(1);
  if (hasCharts) {
    throw new ConflictError("Cannot delete: workbook has charts. Delete them first.");
  }
  const [hasDashboards] = await db.select().from(dashboards).where(eq(dashboards.workbookId, id)).limit(1);
  if (hasDashboards) {
    throw new ConflictError("Cannot delete: workbook has dashboards. Delete them first.");
  }

  await db.delete(folders).where(eq(folders.workbookId, id));
  await db.delete(workbooks).where(eq(workbooks.id, id));
}
