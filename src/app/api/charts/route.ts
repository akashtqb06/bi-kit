import { NextResponse } from "next/server";
import { createChartSchema } from "@src/lib/schemas";
import { listCharts, createChart } from "@src/lib/charts/service";
import { handleApiError } from "@src/app/api/utils";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const workbookId = searchParams.get("workbookId") ?? undefined;
    return NextResponse.json({ data: listCharts(workbookId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const input = createChartSchema.parse(body);
    return NextResponse.json({ data: createChart(input) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

