import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { runDueSchedules } from '@src/lib/data-store/scheduler';

export async function POST(request: NextRequest): Promise<NextResponse> {
    try {
        assertCronAuthorized(request);
        const result = await runDueSchedules({ timeBudgetMs: 50_000, concurrency: 2 });
        return NextResponse.json({
            success: true,
            processed: result.processed,
            successCount: result.success,
            failed: result.failed,
            skipped: result.skipped,
            timestamp: new Date().toISOString(),
        });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function GET(request: NextRequest): Promise<NextResponse> {
    return POST(request);
}

