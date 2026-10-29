import { NextRequest, NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { assertCronAuthorized } from '@src/lib/finance/cron-auth';
import { DbFinanceService } from '@src/lib/finance/db-service';

export async function POST(request: NextRequest) {
  try {
    assertCronAuthorized(request);
    const service = new DbFinanceService();
    const result = await service.snapshotValuations();
    return NextResponse.json(result);
  } catch (err) {
    return handleApiError(err);
  }
}
