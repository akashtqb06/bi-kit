import { NextResponse } from "next/server";
import { updateChartSchema } from "@src/lib/schemas";
import {
  getChart,
  getChartPublic,
  updateChart,
  deleteChart,
} from "@src/lib/charts/service";
import { getWorkbook } from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const chart = getChart(id);
    const wb = getWorkbook(chart.workbookId);
    assertCan(user, 'view', { type: 'chart', id, ownerId: wb.ownerId, workbookId: chart.workbookId });
    return NextResponse.json({ data: getChartPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const chart = getChart(id);
    const wb = getWorkbook(chart.workbookId);
    assertCan(user, 'edit', { type: 'chart', id, ownerId: wb.ownerId, workbookId: chart.workbookId });
    const body: unknown = await req.json();
    const input = updateChartSchema.parse(body);
    return NextResponse.json({ data: updateChart(id, input) });
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
    const chart = getChart(id);
    const wb = getWorkbook(chart.workbookId);
    assertCan(user, 'delete', { type: 'chart', id, ownerId: wb.ownerId, workbookId: chart.workbookId });
    deleteChart(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}


