import { NextResponse } from 'next/server';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { updateTableSettingsSchema } from '@src/lib/data-store/types';
import {
    getStoreTable,
    updateStoreTableSettings,
    deleteStoreTable,
} from '@src/lib/data-store/service';
import { logAuditEvent } from '@src/lib/audit/audit-log';

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

        return NextResponse.json({ data: table });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function PATCH(
    req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await context.params;
        const body: unknown = await req.json();
        const input = updateTableSettingsSchema.parse(body);

        const table = await getStoreTable(user.id, id);
        assertCan(user, 'edit', { type: 'data_store_table', id: table.id, ownerId: table.ownerId });

        const updated = await updateStoreTableSettings(user.id, id, input);
        return NextResponse.json({ data: updated });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function DELETE(
    _req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await context.params;

        const table = await getStoreTable(user.id, id);
        assertCan(user, 'delete', { type: 'data_store_table', id: table.id, ownerId: table.ownerId });

        await deleteStoreTable(user.id, id);
        await logAuditEvent({
            userId: user.id,
            action: 'data_store.delete',
            details: { tableId: id, storeTable: table.storeTable },
        });
        return NextResponse.json({ success: true });
    } catch (err) {
        return handleApiError(err);
    }
}
