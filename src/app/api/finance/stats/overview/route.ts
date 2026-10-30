import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { getFinanceService } from '@src/lib/finance/service';

export async function GET() {
  try {
    const user = await requireUserApi();
    const service = getFinanceService();
    const stats = await service.getOverviewStats(user.id);
    return jsonNoStore(stats);
  } catch (err) {
    return handleApiError(err);
  }
}

