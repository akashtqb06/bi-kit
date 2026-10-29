import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { exportAuditLogsCsv } from '@src/lib/audit/audit-service';
import { logAuditEvent } from '@src/lib/audit/audit-log';
import { handleApiError, apiError } from '@src/app/api/utils';

export async function GET(req: Request): Promise<NextResponse | Response> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const { searchParams } = new URL(req.url);
        const action = searchParams.get('action') || undefined;
        const search = searchParams.get('q') || undefined;

        const csvContent = await exportAuditLogsCsv({
            action,
            search,
        });

        await logAuditEvent({
            userId: user.id,
            action: 'export.audit_log',
            details: { actionFilter: action, query: search },
        });

        const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;

        return new Response(csvContent, {
            status: 200,
            headers: {
                'Content-Type': 'text/csv; charset=utf-8',
                'Content-Disposition': `attachment; filename="${filename}"`,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}
