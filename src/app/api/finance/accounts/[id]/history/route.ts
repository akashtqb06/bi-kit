import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../utils';
import { getAccountHistory } from '@src/lib/finance/db-service/history';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    const { searchParams } = new URL(request.url);
    const from = searchParams.get('from') || undefined;
    const to = searchParams.get('to') || undefined;
    const preset = searchParams.get('preset') || undefined;

    const result = await getAccountHistory(user.id, id, { from, to, preset });
    return jsonNoStore(result);
  } catch (err) {
    return handleApiError(err);
  }
}
