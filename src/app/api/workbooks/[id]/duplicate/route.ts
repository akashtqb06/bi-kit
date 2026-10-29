import { NextResponse } from "next/server";
import { duplicateWorkbookSchema } from "@src/lib/schemas";
import { getWorkbook, duplicateWorkbook } from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const source = await getWorkbook(id);
    assertCan(user, "view", { type: "workbook", id, ownerId: source.ownerId });

    let name: string | undefined;
    try {
      const body: unknown = await req.json();
      const input = duplicateWorkbookSchema.parse(body);
      name = input?.name;
    } catch {
      // Body is optional
    }
    const data = await duplicateWorkbook(id, name, user.id);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
