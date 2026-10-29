import { NextResponse } from "next/server";
import { updateFolderSchema, deleteFolderModeSchema } from "@src/lib/schemas";
import { getWorkbook } from "@src/lib/workbooks/service";
import { getFolder, getFolderPublic, updateFolder, deleteFolder } from "@src/lib/folders/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const folder = await getFolder(id);
    const wb = await getWorkbook(folder.workbookId);
    assertCan(user, "view", { type: "workbook", id: folder.workbookId, ownerId: wb.ownerId });
    return NextResponse.json({ data: await getFolderPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const folder = await getFolder(id);
    const wb = await getWorkbook(folder.workbookId);
    assertCan(user, "edit", { type: "workbook", id: folder.workbookId, ownerId: wb.ownerId });
    const body: unknown = await req.json();
    const input = updateFolderSchema.parse(body);
    const updated = await updateFolder(id, input);
    return NextResponse.json({ data: updated });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const folder = await getFolder(id);
    const wb = await getWorkbook(folder.workbookId);
    assertCan(user, "edit", { type: "workbook", id: folder.workbookId, ownerId: wb.ownerId });
    const url = new URL(req.url);
    const rawMode = url.searchParams.get("mode") ?? "keep";
    const mode = deleteFolderModeSchema.parse(rawMode);
    await deleteFolder(id, mode);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
