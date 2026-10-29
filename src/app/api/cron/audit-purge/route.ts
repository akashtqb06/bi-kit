import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { purgeOldAuditLogs } from '@src/lib/audit/audit-service';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
        const result = await purgeOldAuditLogs();
        return NextResponse.json({
            success: true,
            purgedCount: result.purgedCount,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    return POST(request);
}
