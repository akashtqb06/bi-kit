import { NextResponse } from "next/server";
import { createWorkbookSchema, bulkDeleteWorkbooksSchema } from "@src/lib/schemas";
import { listWorkbooks, createWorkbook, bulkDeleteWorkbooks } from "@src/lib/workbooks/service";
import { handleApiError } from "@src/app/api/utils";
import { getCurrentUser } from "@src/lib/auth/dal";

export async function GET(): Promise<NextResponse> {
  try {
    const user = await getCurrentUser();
    return NextResponse.json({
      data: listWorkbooks(user ? { id: user.id, role: user.role } : undefined),
    });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const input = createWorkbookSchema.parse(body);
    const user = await getCurrentUser();
    return NextResponse.json(
      { data: createWorkbook(input, user?.id) },
      { status: 201 }
    );
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const input = bulkDeleteWorkbooksSchema.parse(body);
    bulkDeleteWorkbooks(input.ids);
    return NextResponse.json({ data: { ok: true, count: input.ids.length } });
  } catch (err) {
    return handleApiError(err);
  }
}
