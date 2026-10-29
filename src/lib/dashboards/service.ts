import 'server-only';
import { eq, inArray, and, desc, gte, isNotNull, sql } from "drizzle-orm";
import { db } from "@src/lib/db";
import { newId } from "@src/lib/db/id";
import {
  dashboards,
  workbooks,
  charts,
  dashboardFavorites,
  dashboardViews,
  users,
  type Dashboard,
} from "@src/lib/db/schema";
import { NotFoundError } from "@src/lib/connectors/types";
import { getWorkbook } from "@src/lib/workbooks/service";
import {
  parseDashboardLayout,
  parseDashboardFilters,
  type LayoutItem,
  type DashboardFilter,
} from "@src/lib/db/json-helpers";
import { validateFolderAssignment } from "@src/lib/folders/service";
import type { CreateDashboardInput } from "@src/lib/schemas";
import type { PolicyUser } from "@src/lib/auth/policy";

// ---------------------------------------------------------------------------
// Public shapes
// ---------------------------------------------------------------------------

export interface DashboardPublic {
  id: string;
  workbookId: string;
  name: string;
  title: string;
  workbookTitle?: string;
  workbookName?: string;
  chartCount?: number;
  chartsCount?: number;
  layout: LayoutItem[];
  filters: DashboardFilter[];
  autoRefresh?: "off" | "30s" | "1m" | "5m";
  isFavorite: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  folderId?: string | null;
  position?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

export interface DashboardSummary {
  id: string;
  title: string;
  name: string;
  ownerId?: string;
  owner?: { id: string; name: string | null; email: string; avatarUrl?: string | null };
  workbookId: string;
  workbookTitle: string;
  workbookName: string;
  chartCount: number;
  chartsCount: number;
  layout: LayoutItem[];
  filters: DashboardFilter[];
  autoRefresh?: "off" | "30s" | "1m" | "5m";
  isFavorite: boolean;
  viewCount: number;
  lastViewedAt: Date | null;
  folderId?: string | null;
  position?: number;
  createdAt: Date | null;
  updatedAt: Date | null;
}

async function getDefaultUserId(): Promise<string | null> {
  const [admin] = await db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1);
  if (admin) return admin.id;
  const [anyUser] = await db.select({ id: users.id }).from(users).limit(1);
  if (anyUser) return anyUser.id;
  return null;
}

async function toPublic(row: Dashboard, workbookName?: string, userId?: string): Promise<DashboardPublic> {
  const layout = parseDashboardLayout(row.layout);
  const targetUserId = userId ?? (await getDefaultUserId());

  let fav = null;
  if (targetUserId) {
    const [foundFav] = await db
      .select({ dashboardId: dashboardFavorites.dashboardId })
      .from(dashboardFavorites)
      .where(and(eq(dashboardFavorites.dashboardId, row.id), eq(dashboardFavorites.userId, targetUserId)))
      .limit(1);
    fav = foundFav;
  }

  let view = null;
  if (targetUserId) {
    const [foundView] = await db
      .select({ viewCount: dashboardViews.viewCount, lastViewedAt: dashboardViews.lastViewedAt })
      .from(dashboardViews)
      .where(and(eq(dashboardViews.dashboardId, row.id), eq(dashboardViews.userId, targetUserId)))
      .limit(1);
    view = foundView;
  }

  return {
    id: row.id,
    workbookId: row.workbookId,
    name: row.name,
    title: row.name,
    workbookTitle: workbookName,
    workbookName: workbookName,
    chartCount: layout.length,
    chartsCount: layout.length,
    layout,
    filters: parseDashboardFilters(row.filters),
    autoRefresh: (row.autoRefresh as "off" | "30s" | "1m" | "5m") ?? "off",
    isFavorite: Boolean(fav),
    viewCount: view?.viewCount ?? 0,
    lastViewedAt: view?.lastViewedAt ?? null,
    folderId: row.folderId ?? null,
    position: row.position ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// ---------------------------------------------------------------------------
// Service functions
// ---------------------------------------------------------------------------

export async function listDashboards(workbookId?: string): Promise<DashboardSummary[]> {
  return await listAllDashboards(undefined, workbookId);
}

export async function listAllDashboards(
  query?: string,
  workbookId?: string,
  filter?: string,
  user?: PolicyUser
): Promise<DashboardSummary[]> {
  const allCharts = await db.select({ id: charts.id, type: charts.type }).from(charts);
  const chartTypeMap = new Map(allCharts.map((c) => [c.id, c.type]));

  const targetUserId = user?.id ?? (await getDefaultUserId());

  let queryBuilder = db
    .select({
      id: dashboards.id,
      name: dashboards.name,
      ownerId: dashboards.ownerId,
      workbookId: dashboards.workbookId,
      layout: dashboards.layout,
      filters: dashboards.filters,
      autoRefresh: dashboards.autoRefresh,
      favoriteId: dashboardFavorites.dashboardId,
      viewCount: dashboardViews.viewCount,
      lastViewedAt: dashboardViews.lastViewedAt,
      folderId: dashboards.folderId,
      position: dashboards.position,
      createdAt: dashboards.createdAt,
      updatedAt: dashboards.updatedAt,
      workbookName: workbooks.name,
      ownerName: users.name,
      ownerEmail: users.email,
      ownerAvatarUrl: users.avatarUrl,
    })
    .from(dashboards)
    .leftJoin(users, eq(dashboards.ownerId, users.id))
    .leftJoin(workbooks, eq(dashboards.workbookId, workbooks.id))
    .leftJoin(
      dashboardFavorites,
      targetUserId
        ? and(eq(dashboardFavorites.dashboardId, dashboards.id), eq(dashboardFavorites.userId, targetUserId))
        : sql`0=1`
    )
    .leftJoin(
      dashboardViews,
      targetUserId
        ? and(eq(dashboardViews.dashboardId, dashboards.id), eq(dashboardViews.userId, targetUserId))
        : sql`0=1`
    );

  const conditions = [];

  if (user && user.role !== "admin") {
    conditions.push(eq(dashboards.ownerId, user.id));
  }

  if (workbookId) {
    conditions.push(eq(dashboards.workbookId, workbookId));
  }

  if (filter === "favorites") {
    conditions.push(isNotNull(dashboardFavorites.dashboardId));
  } else if (filter === "recents") {
    const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    conditions.push(isNotNull(dashboardViews.lastViewedAt));
    conditions.push(gte(dashboardViews.lastViewedAt, thirtyDaysAgo));
  }

  if (conditions.length > 0) {
    queryBuilder = queryBuilder.where(and(...conditions)) as typeof queryBuilder;
  }

  if (filter === "recents") {
    queryBuilder = queryBuilder.orderBy(desc(dashboardViews.lastViewedAt)).limit(12) as typeof queryBuilder;
  } else {
    queryBuilder = queryBuilder.orderBy(desc(dashboards.updatedAt)) as typeof queryBuilder;
  }

  const rows = await queryBuilder;

  const results: DashboardSummary[] = rows.map((row) => {
    const layout = parseDashboardLayout(row.layout);
    const layoutWithTypes: LayoutItem[] = layout.map((item) => ({
      ...item,
      chartType: item.chartType ?? (item.chartId ? chartTypeMap.get(item.chartId) : undefined),
    }));
    const filters = parseDashboardFilters(row.filters);
    const workbookTitle = row.workbookName ?? "Untitled Workbook";
    return {
      id: row.id,
      title: row.name,
      name: row.name,
      ownerId: row.ownerId,
      owner: row.ownerId
        ? {
            id: row.ownerId,
            name: row.ownerName,
            email: row.ownerEmail ?? "",
            avatarUrl: row.ownerAvatarUrl,
          }
        : undefined,
      workbookId: row.workbookId,
      workbookTitle,
      workbookName: workbookTitle,
      chartCount: layout.length,
      chartsCount: layout.length,
      layout: layoutWithTypes,
      filters,
      autoRefresh: (row.autoRefresh as "off" | "30s" | "1m" | "5m") ?? "off",
      isFavorite: Boolean(row.favoriteId),
      viewCount: row.viewCount ?? 0,
      lastViewedAt: row.lastViewedAt ?? null,
      folderId: row.folderId ?? null,
      position: row.position ?? 0,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
    };
  });

  if (query && query.trim()) {
    const q = query.trim().toLowerCase();
    return results.filter(
      (d) =>
        d.title.toLowerCase().includes(q) ||
        d.workbookTitle.toLowerCase().includes(q)
    );
  }

  return results;
}

export async function getDashboard(id: string): Promise<Dashboard> {
  const [row] = await db.select().from(dashboards).where(eq(dashboards.id, id)).limit(1);
  if (!row) throw new NotFoundError(`Dashboard "${id}" not found.`);
  return row;
}

export async function getDashboardPublic(id: string, userId?: string): Promise<DashboardPublic> {
  const row = await getDashboard(id);
  const [wb] = await db
    .select({ name: workbooks.name })
    .from(workbooks)
    .where(eq(workbooks.id, row.workbookId))
    .limit(1);
  return await toPublic(row, wb?.name, userId);
}

export async function createDashboard(
  workbookId: string,
  input: CreateDashboardInput & { ownerId?: string | null; slug?: string }
): Promise<DashboardSummary> {
  await getWorkbook(workbookId); // validates FK
  if (input.folderId) {
    await validateFolderAssignment(input.folderId, workbookId, 'dashboard');
  }

  const insertedId = newId();
  const name = (input.name ?? input.title ?? "Untitled Dashboard").trim();
  const ownerId = input.ownerId ?? (await getDefaultUserId());

  await db.insert(dashboards).values({
    id: insertedId,
    workbookId,
    ownerId: ownerId!,
    name,
    slug: input.slug,
    layout: input.layout ?? [],
    filters: input.filters ?? [],
    autoRefresh: input.autoRefresh ?? "off",
    folderId: input.folderId ?? null,
    position: input.position ?? 0,
  });

  if (input.isFavorite && ownerId) {
    await db.insert(dashboardFavorites).values({ userId: ownerId, dashboardId: insertedId });
  }

  const row = await getDashboard(insertedId);
  const [wb] = await db
    .select({ name: workbooks.name })
    .from(workbooks)
    .where(eq(workbooks.id, workbookId))
    .limit(1);
  const layout = parseDashboardLayout(row.layout);
  const filters = parseDashboardFilters(row.filters);
  const workbookTitle = wb?.name ?? "Untitled Workbook";

  return {
    id: row.id,
    title: row.name,
    name: row.name,
    workbookId: row.workbookId,
    workbookTitle,
    workbookName: workbookTitle,
    chartCount: layout.length,
    chartsCount: layout.length,
    layout,
    filters,
    autoRefresh: (row.autoRefresh as "off" | "30s" | "1m" | "5m") ?? "off",
    isFavorite: Boolean(input.isFavorite),
    viewCount: 0,
    lastViewedAt: null,
    folderId: row.folderId ?? null,
    position: row.position ?? 0,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

export async function updateDashboard(
  id: string,
  input: Partial<CreateDashboardInput>,
  userId?: string
): Promise<DashboardPublic> {
  const current = await getDashboard(id); // throws if missing
  const targetUserId = userId ?? (await getDefaultUserId());
  const updates: Partial<typeof dashboards.$inferInsert> = { updatedAt: new Date() };
  const targetName = input.title ?? input.name;
  if (targetName !== undefined) updates.name = targetName.trim();
  if (input.layout !== undefined)
    updates.layout = input.layout;
  if (input.filters !== undefined)
    updates.filters = input.filters;
  if (input.autoRefresh !== undefined)
    updates.autoRefresh = input.autoRefresh;
  if (input.folderId !== undefined) {
    if (input.folderId !== null) {
      await validateFolderAssignment(input.folderId, current.workbookId, 'dashboard');
    }
    updates.folderId = input.folderId ?? null;
  }
  if (input.position !== undefined) updates.position = input.position;

  await db.update(dashboards).set(updates).where(eq(dashboards.id, id));

  if (input.isFavorite !== undefined && targetUserId) {
    if (input.isFavorite) {
      const [existing] = await db
        .select()
        .from(dashboardFavorites)
        .where(and(eq(dashboardFavorites.dashboardId, id), eq(dashboardFavorites.userId, targetUserId)))
        .limit(1);
      if (!existing) {
        await db.insert(dashboardFavorites)
          .values({ userId: targetUserId, dashboardId: id });
      }
    } else {
      await db.delete(dashboardFavorites)
        .where(and(eq(dashboardFavorites.dashboardId, id), eq(dashboardFavorites.userId, targetUserId)));
    }
  }

  return await getDashboardPublic(id, targetUserId ?? undefined);
}

export async function recordDashboardView(id: string, userId?: string): Promise<DashboardPublic> {
  await getDashboard(id); // throws if missing
  const now = new Date();
  const targetUserId = userId ?? (await getDefaultUserId());

  if (targetUserId) {
    const [existing] = await db
      .select()
      .from(dashboardViews)
      .where(and(eq(dashboardViews.dashboardId, id), eq(dashboardViews.userId, targetUserId)))
      .limit(1);

    if (existing) {
      await db.update(dashboardViews)
        .set({
          viewCount: existing.viewCount + 1,
          lastViewedAt: now,
        })
        .where(and(eq(dashboardViews.dashboardId, id), eq(dashboardViews.userId, targetUserId)));
    } else {
      await db.insert(dashboardViews)
        .values({
          userId: targetUserId,
          dashboardId: id,
          viewCount: 1,
          lastViewedAt: now,
        });
    }
  }

  return await getDashboardPublic(id, targetUserId ?? undefined);
}

export async function duplicateDashboard(
  id: string,
  newName?: string,
  userId?: string
): Promise<DashboardSummary> {
  const original = await getDashboard(id);
  const targetName = (newName ?? `${original.name} (Copy)`).trim();
  const insertedId = newId();
  const ownerId = userId ?? original.ownerId;

  await db.insert(dashboards).values({
    id: insertedId,
    workbookId: original.workbookId,
    ownerId,
    name: targetName,
    layout: original.layout,
    filters: original.filters,
    autoRefresh: original.autoRefresh,
  });

  const created = await getDashboard(insertedId);
  const [wb] = await db
    .select({ name: workbooks.name })
    .from(workbooks)
    .where(eq(workbooks.id, original.workbookId))
    .limit(1);
  const layout = parseDashboardLayout(created.layout);
  const filters = parseDashboardFilters(created.filters);
  const workbookTitle = wb?.name ?? "Untitled Workbook";

  return {
    id: created.id,
    title: created.name,
    name: created.name,
    workbookId: created.workbookId,
    workbookTitle,
    workbookName: workbookTitle,
    chartCount: layout.length,
    chartsCount: layout.length,
    layout,
    filters,
    autoRefresh: (created.autoRefresh as "off" | "30s" | "1m" | "5m") ?? "off",
    isFavorite: false,
    viewCount: 0,
    lastViewedAt: null,
    createdAt: created.createdAt,
    updatedAt: created.updatedAt,
  };
}

export async function deleteDashboard(id: string): Promise<void> {
  await getDashboard(id); // throws if missing
  await db.delete(dashboards).where(eq(dashboards.id, id));
}

export async function bulkDeleteDashboards(ids: string[], user?: { id: string; role: string }): Promise<void> {
  if (ids.length === 0) return;
  if (user && user.role !== "admin") {
    await db.delete(dashboards)
      .where(and(inArray(dashboards.id, ids), eq(dashboards.ownerId, user.id)));
    return;
  }
  await db.delete(dashboards).where(inArray(dashboards.id, ids));
}
