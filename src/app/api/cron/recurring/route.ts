import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { generateDueRecurringTransactions } from '@src/lib/finance/recurring';

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await generateDueRecurringTransactions();
    return NextResponse.json({
      success: true,
      processed: result.processed,
      generated: result.generated,
      backfilled: result.backfilled,
      skipped: result.skipped,
      timestamp: new Date().toISOString(),
    });
  } catch (err) {
    return handleApiError(err);
  }
}
