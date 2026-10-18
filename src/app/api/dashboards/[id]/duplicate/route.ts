import { NextResponse } from "next/server";
import { duplicateDashboardSchema } from "@src/lib/schemas";
import { duplicateDashboard } from "@src/lib/dashboards/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
  req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    let name: string | undefined;
    try {
      const body: unknown = await req.json();
      const input = duplicateDashboardSchema.parse(body);
      name = input?.name ?? input?.title;
    } catch {
      // Body is optional
    }
    const data = duplicateDashboard(id, name);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

