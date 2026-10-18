import { NextResponse } from "next/server";
import { duplicateWorkbookSchema } from "@src/lib/schemas";
import { duplicateWorkbook } from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const { id } = await params;
    let name: string | undefined;
    try {
      const body: unknown = await req.json();
      const input = duplicateWorkbookSchema.parse(body);
      name = input?.name;
    } catch {
      // Body is optional
    }
    const data = duplicateWorkbook(id, name);
    return NextResponse.json({ data }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

