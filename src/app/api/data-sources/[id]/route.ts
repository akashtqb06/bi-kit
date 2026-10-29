import { NextResponse } from "next/server";
import { updateDataSourceSchema } from "@src/lib/schemas";
import {
  getDataSource,
  getDataSourcePublic,
  updateDataSource,
  deleteDataSource,
  setCachedSchema,
} from "@src/lib/data-sources/service";
import { getConnectorDefinition } from "@src/lib/connectors/registry";
import { getConnector } from "@src/lib/connectors/manager";
import { logNetworkAudit } from "@src/lib/audit/audit-log";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  _req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const source = await getDataSource(id);
    assertCan(user, "view", { type: "data_source", id, ownerId: source.ownerId });
    const data = await getDataSourcePublic(id);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(
  req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const source = await getDataSource(id);
    assertCan(user, "edit", { type: "data_source", id, ownerId: source.ownerId });
    const body: unknown = await req.json();
    const input = updateDataSourceSchema.parse(body);
    const data = await updateDataSource(id, input);
    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PATCH(
  req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const source = await getDataSource(id);
    assertCan(user, "edit", { type: "data_source", id, ownerId: source.ownerId });
    const body: unknown = await req.json();
    const input = updateDataSourceSchema.parse(body);
    const data = await updateDataSource(id, input);

    const def = getConnectorDefinition(source.type);
    if (def && (def.category === 'sql' || def.category === 'nosql')) {
      const host = typeof data.config?.host === 'string' ? data.config.host : null;
      await logNetworkAudit({
        userId: user.id,
        action: 'update',
        dataSourceId: id,
        host,
      });
    }

    // If config was changed, refresh schema cache
    if (input.config) {
      try {
        const updatedSource = await getDataSource(id);
        const connector = await getConnector(updatedSource);
        const snapshot = await connector.introspect();
        await setCachedSchema(id, snapshot);
      } catch {
        // best effort
      }
    }

    return NextResponse.json({ data });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(
  _req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const source = await getDataSource(id);
    assertCan(user, "delete", { type: "data_source", id, ownerId: source.ownerId });

    const def = getConnectorDefinition(source.type);
    if (def && (def.category === 'sql' || def.category === 'nosql')) {
      let host: string | null = null;
      try {
        const parsed = typeof source.config === 'string' ? JSON.parse(source.config) : source.config;
        host = typeof parsed.host === 'string' ? parsed.host : null;
      } catch {
        // ignore
      }
      await logNetworkAudit({
        userId: user.id,
        action: 'delete',
        dataSourceId: id,
        host,
      });
    }

    await deleteDataSource(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}
