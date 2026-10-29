import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { getFinanceService } from '@src/lib/finance/service';

export async function GET() {
  try {
    const user = await requireUserApi();
    const service = getFinanceService();
    const stats = await service.getOverviewStats(user.id);
    return NextResponse.json(stats);
  } catch (err) {
    return handleApiError(err);
  }
}

