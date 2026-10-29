import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';
import { handleApiError, apiError } from '@src/app/api/utils';
import { getStoreTable } from '@src/lib/data-store/service';
import { syncTable, cancelSync, isSyncInProgress } from '@src/lib/data-store/sync-engine';
import { logAuditEvent } from '@src/lib/audit/audit-log';

interface RouteContext {
    params: Promise<{ id: string }>;
}

const syncActionSchema = z.object({
    action: z.enum(['sync', 'cancel']).default('sync'),
    forceFull: z.boolean().optional(),
});

export async function POST(
    req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await context.params;

        const table = await getStoreTable(user.id, id);
        assertCan(user, 'edit', { type: 'data_store_table', id: table.id, ownerId: table.ownerId });

        let action = 'sync';
        let forceFull = false;
        try {
            const body: unknown = await req.json();
            const parsed = syncActionSchema.parse(body);
            action = parsed.action;
            forceFull = parsed.forceFull ?? false;
        } catch {
            // default to sync
        }

        if (action === 'cancel') {
            const cancelled = cancelSync(id);
            return NextResponse.json({ success: true, cancelled });
        }

        if (isSyncInProgress(id)) {
            return apiError('A sync is already in progress for this table.', 409);
        }

        // Start sync (await execution so caller gets result)
        const result = await syncTable(id, { triggeredBy: 'manual', forceFull });
        await logAuditEvent({
            userId: user.id,
            action: 'data_store.sync',
            details: { tableId: id, status: result.status, rowsSynced: result.rowsSynced },
        });
        return NextResponse.json({ data: result });
    } catch (err) {
        return handleApiError(err);
    }
}

