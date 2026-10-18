import { NextResponse } from "next/server";
import { updateQuerySchema } from "@src/lib/schemas";
import {
  getQueryPublic,
  updateQuery,
  deleteQuery,
} from "@src/lib/queries/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    return NextResponse.json({ data: getQueryPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    const input = updateQuerySchema.parse(body);
    return NextResponse.json({ data: updateQuery(id, input) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    deleteQuery(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}

