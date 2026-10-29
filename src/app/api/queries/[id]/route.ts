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
import { getMaterializedQueryInfo, dropMaterializedQuery } from "@src/lib/data-store/service";
import { syncTable } from "@src/lib/data-store/sync-engine";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const query = await getQuery(id);
    const wb = await getWorkbook(query.workbookId);
    assertCan(user, 'view', { type: 'query', id, ownerId: wb.ownerId, workbookId: query.workbookId });
    return NextResponse.json({ data: await getQueryPublic(id) });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(req: Request, { params }: RouteParams): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const query = await getQuery(id);
    const wb = await getWorkbook(query.workbookId);
    assertCan(user, 'edit', { type: 'query', id, ownerId: wb.ownerId, workbookId: query.workbookId });
    const body: unknown = await req.json();
    const input = updateQuerySchema.parse(body);
    if (input.dataSourceId) {
      const ds = await getDataSource(input.dataSourceId);
      assertCan(user, 'view', { type: 'data_source', id: input.dataSourceId, ownerId: ds.ownerId });
    }
    const updated = await updateQuery(id, input);

    // If query definition or sql changed, refresh materialized data store table if enabled
    if (input.definition !== undefined || input.sql !== undefined) {
      const storeTable = await getMaterializedQueryInfo(id);
      if (storeTable) {
        void syncTable(storeTable.id, { triggeredBy: 'query_change', forceFull: true });
      }
    }

    return NextResponse.json({ data: updated });
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
    const query = await getQuery(id);
    const wb = await getWorkbook(query.workbookId);
    assertCan(user, 'delete', { type: 'query', id, ownerId: wb.ownerId, workbookId: query.workbookId });

    // Clean up any materialized data store table
    await dropMaterializedQuery(user.id, id);

    await deleteQuery(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
