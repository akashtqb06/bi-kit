import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../utils';
import { listPfEntries, getPfAccountSummary } from '@src/lib/finance/db-service/pf';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    const { searchParams } = new URL(request.url);
    const fy = searchParams.get('fy') || undefined;

    const [entries, summary] = await Promise.all([
      listPfEntries(user.id, id, fy),
      getPfAccountSummary(user.id, id, fy),
    ]);

    return jsonNoStore({ entries, summary });
  } catch (err) {
    return handleApiError(err);
  }
}

