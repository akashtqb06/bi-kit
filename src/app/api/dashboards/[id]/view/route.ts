import { NextResponse } from "next/server";
import { recordDashboardView, getDashboard } from "@src/lib/dashboards/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const dashboard = await getDashboard(id);
    assertCan(user, 'view', { type: 'dashboard', id, ownerId: dashboard.ownerId, workbookId: dashboard.workbookId });
    return NextResponse.json({ data: await recordDashboardView(id, user.id) });
  } catch (err) {
    return handleApiError(err);
  }
}
