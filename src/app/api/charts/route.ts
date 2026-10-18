import { NextResponse } from "next/server";
import { createChartSchema } from "@src/lib/schemas";
import { listCharts, createChart } from "@src/lib/charts/service";
import { getWorkbook } from "@src/lib/workbooks/service";
import { getQuery } from "@src/lib/queries/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(req.url);
    const workbookId = searchParams.get("workbookId") ?? undefined;
    if (workbookId) {
      const wb = getWorkbook(workbookId);
      assertCan(user, 'view', { type: 'workbook', id: workbookId, ownerId: wb.ownerId });
    }
    return NextResponse.json({
      data: listCharts(workbookId, { id: user.id, role: user.role }),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const body: unknown = await req.json();
    const input = createChartSchema.parse(body);
    const query = getQuery(input.queryId);
    const wb = getWorkbook(query.workbookId);
    assertCan(user, 'edit', { type: 'workbook', id: query.workbookId, ownerId: wb.ownerId });
    return NextResponse.json({ data: createChart(input, user.id) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}


