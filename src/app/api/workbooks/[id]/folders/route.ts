import { NextResponse } from "next/server";
import { getWorkbook } from "@src/lib/workbooks/service";
import { listFolders } from "@src/lib/folders/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const wb = await getWorkbook(id);
    assertCan(user, "view", { type: "workbook", id, ownerId: wb.ownerId });
    return NextResponse.json({ data: await listFolders(id) });
  } catch (err) {
    return handleApiError(err);
  }
}
