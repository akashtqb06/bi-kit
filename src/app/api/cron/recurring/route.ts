import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { generateDueRecurringTransactions } from '@src/lib/finance/recurring';

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const result = await generateDueRecurringTransactions();
    const timestamp = new Date().toISOString();
    console.log(
      `[cron/recurring] Generated ${result.generated} transactions (${result.backfilled} backfilled, ${result.skipped} skipped) from ${result.processed} rules at ${timestamp}`
    );
    return NextResponse.json({
      success: true,
      processed: result.processed,
      generated: result.generated,
      backfilled: result.backfilled,
      skipped: result.skipped,
      timestamp,
    });
  } catch (err) {
    console.error('[cron/recurring] Execution failed:', err);
    return handleApiError(err);
  }
}
