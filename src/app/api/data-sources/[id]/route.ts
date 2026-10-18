import { NextResponse } from "next/server";
import { z } from "zod";
import {
  getDataSource,
  getDataSourcePublic,
  updateDataSource,
  deleteDataSource,
} from "@src/lib/data-sources/service";
import { handleApiError } from "@src/app/api/utils";
import { requireUserApi, assertCan } from "@src/lib/auth/dal";

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  config: z.object({ path: z.string().min(1) }).optional(),
});

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  _req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const source = getDataSource(id);
    assertCan(user, "view", { type: "data_source", id, ownerId: source.ownerId });
    const data = getDataSourcePublic(id);
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
    const source = getDataSource(id);
    assertCan(user, "edit", { type: "data_source", id, ownerId: source.ownerId });
    const body: unknown = await req.json();
    const input = updateSchema.parse(body);
    const data = updateDataSource(id, input);
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
    const source = getDataSource(id);
    assertCan(user, "edit", { type: "data_source", id, ownerId: source.ownerId });
    const body: unknown = await req.json();
    const input = updateSchema.parse(body);
    const data = updateDataSource(id, input);
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
    const source = getDataSource(id);
    assertCan(user, "delete", { type: "data_source", id, ownerId: source.ownerId });
    deleteDataSource(id);
    return NextResponse.json({ data: { ok: true } });
  } catch (err) {
    return handleApiError(err);
  }
}

