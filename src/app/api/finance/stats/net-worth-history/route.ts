import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { netWorthHistoryQuerySchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawQuery = Object.fromEntries(searchParams.entries());
    const query = netWorthHistoryQuerySchema.parse(rawQuery);

    const service = getFinanceService();
    const history = await service.getNetWorthHistory(user.id, query);
    return NextResponse.json({ history });
  } catch (err) {
    return handleApiError(err);
  }
}

