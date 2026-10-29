import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import {
    listAuditLogs,
    getAuditRetentionDays,
    setAuditRetentionDays,
} from '@src/lib/audit/audit-service';
import { handleApiError, apiError } from '@src/app/api/utils';

const patchRetentionSchema = z.object({
    retentionDays: z.number().int().min(7).max(3650),
});

export async function GET(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action') || undefined;
        const search = searchParams.get('q') || undefined;
        const limit = parseInt(searchParams.get('limit') || '50', 10);
        const offset = parseInt(searchParams.get('offset') || '0', 10);

        const { logs, total } = await listAuditLogs({
            action,
            search,
            limit,
            offset,
        });

        const retentionDays = await getAuditRetentionDays();

        return NextResponse.json({
            data: logs,
            total,
            retentionDays,
        });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function PATCH(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const body: unknown = await req.json();
        const input = patchRetentionSchema.parse(body);

        await setAuditRetentionDays(input.retentionDays, user.id);
        const updatedRetentionDays = await getAuditRetentionDays();

        return NextResponse.json({
            data: { retentionDays: updatedRetentionDays },
        });
    } catch (err) {
        return handleApiError(err);
    }
}

