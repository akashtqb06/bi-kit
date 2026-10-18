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
import { handleApiError } from "@src/app/api/utils";

import { getCurrentUser } from "@src/lib/auth/dal";

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
    const user = await getCurrentUser();
    const { searchParams } = new URL(req.url);
    const q = searchParams.get("q") ?? undefined;
    const workbookId = searchParams.get("workbookId") ?? undefined;
    const filter = searchParams.get("filter") ?? undefined;
    return NextResponse.json({
      data: listAllDashboards(
        q,
        workbookId,
        filter,
        user ? { id: user.id, role: user.role } : undefined
      ),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const parsed = createDashboardApiSchema.parse(body);
    const { workbookId, ...dashboardInput } = parsed;
    const title = (dashboardInput.title ?? dashboardInput.name)!.trim();
    const user = await getCurrentUser();
    return NextResponse.json(
      {
        data: createDashboard(workbookId, {
          ...dashboardInput,
          name: title,
          ownerId: user?.id,
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
    const body: unknown = await req.json();
    const { ids } = bulkDeleteDashboardsSchema.parse(body);
    bulkDeleteDashboards(ids);
    return NextResponse.json({ data: { ok: true, count: ids.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
