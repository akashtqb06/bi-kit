import { NextResponse } from "next/server";
import { updateQuerySchema } from "@src/lib/schemas";
import {
  getQuery,
  getQueryPublic,
  updateQuery,
  deleteQuery,
} from "@src/lib/queries/service";
import { getWorkbook } from "@src/lib/workbooks/service";
import { getDataSource } from "@src/lib/data-sources/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const query = getQuery(id);
    const wb = getWorkbook(query.workbookId);
    assertCan(user, 'view', { type: 'query', id, ownerId: wb.ownerId, workbookId: query.workbookId });
    return NextResponse.json({ data: getQueryPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const query = getQuery(id);
    const wb = getWorkbook(query.workbookId);
    assertCan(user, 'edit', { type: 'query', id, ownerId: wb.ownerId, workbookId: query.workbookId });
    const body: unknown = await req.json();
    const input = updateQuerySchema.parse(body);
    if (input.dataSourceId) {
      const ds = getDataSource(input.dataSourceId);
      assertCan(user, 'view', { type: 'data_source', id: input.dataSourceId, ownerId: ds.ownerId });
    }
    return NextResponse.json({ data: updateQuery(id, input) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(req: Request, { params }: RouteParams): Promise<NextResponse> {
  return PUT(req, { params });
}

export async function DELETE(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const query = getQuery(id);
    const wb = getWorkbook(query.workbookId);
    assertCan(user, 'delete', { type: 'query', id, ownerId: wb.ownerId, workbookId: query.workbookId });
    deleteQuery(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}


