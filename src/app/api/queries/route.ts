import { NextResponse } from "next/server";
import { createQuerySchema } from "@src/lib/schemas";
import { listQueries, createQuery } from "@src/lib/queries/service";
import { handleApiError } from "@src/app/api/utils";

export async function GET(req: Request): Promise<NextResponse> {
  try {
    const { searchParams } = new URL(req.url);
    const workbookId = searchParams.get("workbookId") ?? undefined;
    return NextResponse.json({ data: listQueries(workbookId) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(req: Request): Promise<NextResponse> {
  try {
    const body: unknown = await req.json();
    const input = createQuerySchema.parse(body);
    return NextResponse.json({ data: createQuery(input) }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

