import { NextResponse } from "next/server";
import { recordDashboardView } from "@src/lib/dashboards/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    return NextResponse.json({ data: recordDashboardView(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

