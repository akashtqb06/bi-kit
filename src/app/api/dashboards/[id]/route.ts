import { NextResponse } from "next/server";
import { updateDashboardSchema } from "@src/lib/schemas";
import {
  getDashboard,
  getDashboardPublic,
  updateDashboard,
  deleteDashboard,
} from "@src/lib/dashboards/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const dashboard = await getDashboard(id);
    assertCan(user, 'view', { type: 'dashboard', id, ownerId: dashboard.ownerId, workbookId: dashboard.workbookId });
    return NextResponse.json({ data: await getDashboardPublic(id, user.id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const dashboard = await getDashboard(id);
    const body: unknown = await req.json();
    const input = updateDashboardSchema.parse(body);
    const isOnlyFavorite =
      input.isFavorite !== undefined &&
      input.name === undefined &&
      input.title === undefined &&
      input.layout === undefined &&
      input.filters === undefined &&
      input.autoRefresh === undefined;

    if (isOnlyFavorite) {
      assertCan(user, 'view', { type: 'dashboard', id, ownerId: dashboard.ownerId, workbookId: dashboard.workbookId });
    } else {
      assertCan(user, 'edit', { type: 'dashboard', id, ownerId: dashboard.ownerId, workbookId: dashboard.workbookId });
    }

    const resolved = {
      ...input,
      name: input.name ?? input.title,
    };
    return NextResponse.json({ data: await updateDashboard(id, resolved, user.id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: RouteParams): Promise<NextResponse> {
  return PUT(req, { params });
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const dashboard = await getDashboard(id);
    assertCan(user, 'delete', { type: 'dashboard', id, ownerId: dashboard.ownerId, workbookId: dashboard.workbookId });
    await deleteDashboard(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
