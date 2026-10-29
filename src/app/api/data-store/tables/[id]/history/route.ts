import { NextResponse } from 'next/server';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { getStoreTable, getSyncHistory } from '@src/lib/data-store/service';

interface RouteContext {
    params: Promise<{ id: string }>;
}

export async function GET(
    _req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await context.params;

        const table = await getStoreTable(user.id, id);
        assertCan(user, 'view', { type: 'data_store_table', id: table.id, ownerId: table.ownerId });

        const history = await getSyncHistory(id, 20);
        return NextResponse.json({ data: history });
    } catch (err) {
        return handleApiError(err);
    }
}

