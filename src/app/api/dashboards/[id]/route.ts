import { NextResponse } from "next/server";
import { updateDashboardSchema } from "@src/lib/schemas";
import {
  getDashboardPublic,
  updateDashboard,
  deleteDashboard,
} from "@src/lib/dashboards/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    return NextResponse.json({ data: getDashboardPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    const input = updateDashboardSchema.parse(body);
    const resolved = {
      ...input,
      name: input.name ?? input.title,
    };
    return NextResponse.json({ data: updateDashboard(id, resolved) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    const input = updateDashboardSchema.parse(body);
    const resolved = {
      ...input,
      name: input.name ?? input.title,
    };
    return NextResponse.json({ data: updateDashboard(id, resolved) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    deleteDashboard(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
