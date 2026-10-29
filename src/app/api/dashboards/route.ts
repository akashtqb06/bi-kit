import { NextResponse } from "next/server";
import { z } from "zod";
import {
  createDashboardSchema,
  bulkDeleteDashboardsSchema,
} from "@src/lib/schemas";
import {
  listAllDashboards,
  createDashboard,
  bulkDeleteDashboards,
} from "@src/lib/dashboards/service";
import { getWorkbook } from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

const createDashboardApiSchema = z
  .object({
    workbookId: z.string().min(1, "Workbook is required"),
  })
  .merge(createDashboardSchema)
  .refine((data) => Boolean(data.title?.trim() || data.name?.trim()), {
    message: "Title is required",
    path: ["title"],
  });

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? undefined;
    const workbookId = searchParams.get("workbookId") ?? undefined;
    const filter = searchParams.get("filter") ?? undefined;
    return NextResponse.json({
      data: await listAllDashboards(
        q,
        workbookId,
        filter,
        { id: user.id, role: user.role }
      ),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const body: unknown = await req.json();
    const parsed = createDashboardApiSchema.parse(body);
    const { workbookId, ...dashboardInput } = parsed;
    const title = (dashboardInput.title ?? dashboardInput.name)!.trim();
    const wb = await getWorkbook(workbookId);
    assertCan(user, 'edit', { type: 'workbook', id: workbookId, ownerId: wb.ownerId });
    return NextResponse.json(
      {
        data: await createDashboard(workbookId, {
          ...dashboardInput,
          name: title,
          ownerId: user.id,
        }),
      },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const body: unknown = await req.json();
    const { ids } = bulkDeleteDashboardsSchema.parse(body);
    await bulkDeleteDashboards(ids, { id: user.id, role: user.role });
    return NextResponse.json({ data: { ok: true, count: ids.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
