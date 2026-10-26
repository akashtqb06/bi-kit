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
  serializeDashboardLayout,
  parseDashboardFilters,
  serializeDashboardFilters,
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

function getDefaultUserId(): string | null {
  const admin = db.select({ id: users.id }).from(users).where(eq(users.role, "admin")).limit(1).get();
  if (admin) return admin.id;
  const anyUser = db.select({ id: users.id }).from(users).limit(1).get();
  if (anyUser) return anyUser.id;
  return null;
}

function toPublic(row: Dashboard, workbookName?: string, userId?: string): DashboardPublic {
  const layout = parseDashboardLayout(row.layout);
  const targetUserId = userId ?? getDefaultUserId();

  const fav = targetUserId
    ? db
        .select({ dashboardId: dashboardFavorites.dashboardId })
        .from(dashboardFavorites)
        .where(and(eq(dashboardFavorites.dashboardId, row.id), eq(dashboardFavorites.userId, targetUserId)))
        .get()
    : null;

  const view = targetUserId
    ? db
        .select({ viewCount: dashboardViews.viewCount, lastViewedAt: dashboardViews.lastViewedAt })
        .from(dashboardViews)
        .where(and(eq(dashboardViews.dashboardId, row.id), eq(dashboardViews.userId, targetUserId)))
        .get()
    : null;

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

export function listDashboards(workbookId?: string): DashboardSummary[] {
  return listAllDashboards(undefined, workbookId);
}

export function listAllDashboards(
  query?: string,
  workbookId?: string,
  filter?: string,
  user?: PolicyUser
): DashboardSummary[] {
  const allCharts = db.select({ id: charts.id, type: charts.type }).from(charts).all();
  const chartTypeMap = new Map(allCharts.map((c) => [c.id, c.type]));

  const targetUserId = user?.id ?? getDefaultUserId();

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

  const rows = queryBuilder.all();

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

export function getDashboard(id: string): Dashboard {
  const row = db.select().from(dashboards).where(eq(dashboards.id, id)).get();
  if (!row) throw new NotFoundError(`Dashboard "${id}" not found.`);
  return row;
}

export function getDashboardPublic(id: string, userId?: string): DashboardPublic {
  const row = getDashboard(id);
  const wb = db
    .select({ name: workbooks.name })
    .from(workbooks)
    .where(eq(workbooks.id, row.workbookId))
    .get();
  return toPublic(row, wb?.name, userId);
}

export function createDashboard(
  workbookId: string,
  input: CreateDashboardInput & { ownerId?: string | null; slug?: string }
): DashboardSummary {
  getWorkbook(workbookId); // validates FK
  if (input.folderId) {
    validateFolderAssignment(input.folderId, workbookId, 'dashboard');
  }

  const insertedId = newId();
  const name = (input.name ?? input.title ?? "Untitled Dashboard").trim();
  const ownerId = input.ownerId ?? getDefaultUserId();

  db.insert(dashboards)
    .values({
      id: insertedId,
      workbookId,
      ownerId: ownerId!,
      name,
      slug: input.slug,
      layout: serializeDashboardLayout(input.layout ?? []),
      filters: serializeDashboardFilters(input.filters ?? []),
      autoRefresh: input.autoRefresh ?? "off",
      folderId: input.folderId ?? null,
      position: input.position ?? 0,
    })
    .run();

  if (input.isFavorite && ownerId) {
    db.insert(dashboardFavorites)
      .values({ userId: ownerId, dashboardId: insertedId })
      .run();
  }

  const row = getDashboard(insertedId);
  const wb = db
    .select({ name: workbooks.name })
    .from(workbooks)
    .where(eq(workbooks.id, workbookId))
    .get();
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

export function updateDashboard(
  id: string,
  input: Partial<CreateDashboardInput>,
  userId?: string
): DashboardPublic {
  const current = getDashboard(id); // throws if missing
  const targetUserId = userId ?? getDefaultUserId();
  const updates: Partial<Dashboard> = { updatedAt: new Date() };
  const targetName = input.title ?? input.name;
  if (targetName !== undefined) updates.name = targetName.trim();
  if (input.layout !== undefined)
    updates.layout = serializeDashboardLayout(input.layout);
  if (input.filters !== undefined)
    updates.filters = serializeDashboardFilters(input.filters);
  if (input.autoRefresh !== undefined)
    updates.autoRefresh = input.autoRefresh;
  if (input.folderId !== undefined) {
    if (input.folderId !== null) {
      validateFolderAssignment(input.folderId, current.workbookId, 'dashboard');
    }
    updates.folderId = input.folderId ?? null;
  }
  if (input.position !== undefined) updates.position = input.position;

  db.update(dashboards).set(updates).where(eq(dashboards.id, id)).run();

  if (input.isFavorite !== undefined && targetUserId) {
    if (input.isFavorite) {
      const existing = db
        .select()
        .from(dashboardFavorites)
        .where(and(eq(dashboardFavorites.dashboardId, id), eq(dashboardFavorites.userId, targetUserId)))
        .get();
      if (!existing) {
        db.insert(dashboardFavorites)
          .values({ userId: targetUserId, dashboardId: id })
          .run();
      }
    } else {
      db.delete(dashboardFavorites)
        .where(and(eq(dashboardFavorites.dashboardId, id), eq(dashboardFavorites.userId, targetUserId)))
        .run();
    }
  }

  return getDashboardPublic(id, targetUserId ?? undefined);
}

export function recordDashboardView(id: string, userId?: string): DashboardPublic {
  getDashboard(id); // throws if missing
  const now = new Date();
  const targetUserId = userId ?? getDefaultUserId();

  if (targetUserId) {
    const existing = db
      .select()
      .from(dashboardViews)
      .where(and(eq(dashboardViews.dashboardId, id), eq(dashboardViews.userId, targetUserId)))
      .get();

    if (existing) {
      db.update(dashboardViews)
        .set({
          viewCount: existing.viewCount + 1,
          lastViewedAt: now,
        })
        .where(and(eq(dashboardViews.dashboardId, id), eq(dashboardViews.userId, targetUserId)))
        .run();
    } else {
      db.insert(dashboardViews)
        .values({
          userId: targetUserId,
          dashboardId: id,
          viewCount: 1,
          lastViewedAt: now,
        })
        .run();
    }
  }

  return getDashboardPublic(id, targetUserId ?? undefined);
}

export function duplicateDashboard(
  id: string,
  newName?: string,
  userId?: string
): DashboardSummary {
  const original = getDashboard(id);
  const targetName = (newName ?? `${original.name} (Copy)`).trim();
  const insertedId = newId();
  const ownerId = userId ?? original.ownerId;

  db.insert(dashboards)
    .values({
      id: insertedId,
      workbookId: original.workbookId,
      ownerId,
      name: targetName,
      layout: original.layout,
      filters: original.filters,
      autoRefresh: original.autoRefresh,
    })
    .run();

  const created = getDashboard(insertedId);
  const wb = db
    .select({ name: workbooks.name })
    .from(workbooks)
    .where(eq(workbooks.id, original.workbookId))
    .get();
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

export function deleteDashboard(id: string): void {
  getDashboard(id); // throws if missing
  db.delete(dashboards).where(eq(dashboards.id, id)).run();
}

export function bulkDeleteDashboards(ids: string[], user?: { id: string; role: string }): void {
  if (ids.length === 0) return;
  if (user && user.role !== "admin") {
    db.delete(dashboards)
      .where(and(inArray(dashboards.id, ids), eq(dashboards.ownerId, user.id)))
      .run();
    return;
  }
  db.delete(dashboards).where(inArray(dashboards.id, ids)).run();
}
