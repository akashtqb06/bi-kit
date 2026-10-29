import { NextResponse } from "next/server";
import { createFolderSchema } from "@src/lib/schemas";
import { getWorkbook } from "@src/lib/workbooks/service";
import { createFolder } from "@src/lib/folders/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const body: unknown = await req.json();
    const input = createFolderSchema.parse(body);
    const wb = await getWorkbook(input.workbookId);
    assertCan(user, "edit", { type: "workbook", id: input.workbookId, ownerId: wb.ownerId });
    const folder = await createFolder(input);
    return NextResponse.json({ data: folder }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
