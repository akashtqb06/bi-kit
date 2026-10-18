import { NextResponse } from 'next/server';
import { getDataSource } from '@src/lib/data-sources/service';
import { createConnector } from '@src/lib/connectors/factory';
import { handleApiError } from '@src/app/api/utils';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
    _req: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await params;
        const source = getDataSource(id);
        assertCan(user, 'edit', { type: 'data_source', id, ownerId: source.ownerId });
        const connector = createConnector(source);
        try {
            connector.testConnection();
            const tables = connector.getTables();
            return NextResponse.json({ data: { ok: true, tableCount: tables.length } });
        } finally {
            connector.close();
        }
    } catch (err) {
        return handleApiError(err);
    }
}
