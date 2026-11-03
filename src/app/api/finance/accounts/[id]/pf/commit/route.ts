import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../../utils';
import { commitPfPassbookInputSchema } from '@src/lib/finance/contract';
import { commitPfPassbook } from '@src/lib/finance/db-service/pf';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    const body = await request.json();
    const validated = commitPfPassbookInputSchema.parse(body);

    const result = await commitPfPassbook(user.id, id, validated);
    return jsonNoStore(result);
  } catch (err) {
    return handleApiError(err);
  }
}

