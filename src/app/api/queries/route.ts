import { NextResponse } from "next/server";
import { createQuerySchema } from "@src/lib/schemas";
import { listQueries, createQuery } from "@src/lib/queries/service";
import { getWorkbook } from "@src/lib/workbooks/service";
import { getDataSource } from "@src/lib/data-sources/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(req.url);
    const workbookId = searchParams.get("workbookId") ?? undefined;
    if (workbookId) {
      const wb = await getWorkbook(workbookId);
      assertCan(user, 'view', { type: 'workbook', id: workbookId, ownerId: wb.ownerId });
    }
    return NextResponse.json({
      data: await listQueries(workbookId, { id: user.id, role: user.role }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const body: unknown = await req.json();
    const input = createQuerySchema.parse(body);
    const wb = await getWorkbook(input.workbookId);
    assertCan(user, 'edit', { type: 'workbook', id: input.workbookId, ownerId: wb.ownerId });
    const ds = await getDataSource(input.dataSourceId);
    assertCan(user, 'view', { type: 'data_source', id: input.dataSourceId, ownerId: ds.ownerId });
    return NextResponse.json({ data: await createQuery(input, user.id) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
