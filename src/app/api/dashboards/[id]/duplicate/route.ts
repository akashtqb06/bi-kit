import { NextResponse } from "next/server";
import { duplicateDashboardSchema } from "@src/lib/schemas";
import { duplicateDashboard, getDashboard } from "@src/lib/dashboards/service";
import { getWorkbook } from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
  req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const original = await getDashboard(id);
    assertCan(user, 'view', { type: 'dashboard', id, ownerId: original.ownerId, workbookId: original.workbookId });
    const wb = await getWorkbook(original.workbookId);
    assertCan(user, 'edit', { type: 'workbook', id: original.workbookId, ownerId: wb.ownerId });

    let name: string | undefined;
    try {
      const body: unknown = await req.json();
      const input = duplicateDashboardSchema.parse(body);
      name = input?.name ?? input?.title;
    } catch {
      // Body is optional
    }
    const data = await duplicateDashboard(id, name, user.id);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
