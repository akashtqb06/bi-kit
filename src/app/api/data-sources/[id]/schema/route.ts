import { NextResponse } from "next/server";
import { getDataSource } from "@src/lib/data-sources/service";
import { createConnector } from "@src/lib/connectors/factory";
import { handleApiError } from "@src/app/api/utils";

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
  _req: Request,
  { params }: RouteParams
): Promise<NextResponse> {
  try {
    const { id } = await params;
    const source = getDataSource(id);
    const connector = createConnector(source);
    try {
      const schema = connector.getSchema();
      return NextResponse.json({ data: schema });
    } finally {
      connector.close();
    }
  } catch (err) {
    return handleApiError(err);
  }
}

