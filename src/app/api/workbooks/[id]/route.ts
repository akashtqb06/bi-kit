import { NextResponse } from "next/server";
import { updateWorkbookSchema } from "@src/lib/schemas";
import {
  getWorkbook,
  getWorkbookPublic,
  updateWorkbook,
  deleteWorkbook,
} from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const wb = await getWorkbook(id);
    assertCan(user, "view", { type: "workbook", id, ownerId: wb.ownerId });
    return NextResponse.json({ data: await getWorkbookPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const wb = await getWorkbook(id);
    assertCan(user, "edit", { type: "workbook", id, ownerId: wb.ownerId });
    const body: unknown = await req.json();
    const input = updateWorkbookSchema.parse(body);
    return NextResponse.json({ data: await updateWorkbook(id, input) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const wb = await getWorkbook(id);
    assertCan(user, "delete", { type: "workbook", id, ownerId: wb.ownerId });
    await deleteWorkbook(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
