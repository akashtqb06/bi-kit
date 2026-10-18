import { NextResponse } from "next/server";
import { updateChartSchema } from "@src/lib/schemas";
import {
  getChartPublic,
  updateChart,
  deleteChart,
} from "@src/lib/charts/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    return NextResponse.json({ data: getChartPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    const input = updateChartSchema.parse(body);
    return NextResponse.json({ data: updateChart(id, input) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    deleteChart(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}

