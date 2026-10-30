import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { getFinanceService } from '@src/lib/finance/service';
import { overviewStatsQuerySchema } from '@src/lib/finance/contract';


export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawQuery = {
      from: searchParams.get('from') || undefined,
      to: searchParams.get('to') || undefined,
      preset: searchParams.get('preset') || undefined,
      accounts: searchParams.get('accounts') || undefined,
    };
    const query = overviewStatsQuerySchema.parse(rawQuery);

    const service = getFinanceService();
    const stats = await service.getOverviewStats(user.id, query);
    return jsonNoStore(stats);
  } catch (err) {
    return handleApiError(err);
  }
}

