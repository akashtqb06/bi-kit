import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { purgeOldAuditLogs } from '@src/lib/audit/audit-service';
import { logAuditEvent } from '@src/lib/audit/audit-log';
import { handleApiError, apiError } from '@src/app/api/utils';

export async function POST(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const result = await purgeOldAuditLogs();

        await logAuditEvent({
            userId: user.id,
            action: 'audit.manual_purge',
            details: { purgedCount: result.purgedCount },
        });

        return NextResponse.json({ data: result });
    } catch (err) {
        return handleApiError(err);
    }
}

