import { NextResponse } from "next/server";
import { updateWorkbookSchema } from "@src/lib/schemas";
import {
  getWorkbookPublic,
  updateWorkbook,
  deleteWorkbook,
} from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    return NextResponse.json({ data: getWorkbookPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    const body: unknown = await req.json();
    const input = updateWorkbookSchema.parse(body);
    return NextResponse.json({ data: updateWorkbook(id, input) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    deleteWorkbook(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}

