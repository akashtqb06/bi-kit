import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../../utils';
import { updatePfRateSchema } from '@src/lib/finance/contract';
import { updatePfAccountRate } from '@src/lib/finance/db-service/pf';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    const body = await request.json();
    const validated = updatePfRateSchema.parse(body);

    await updatePfAccountRate(user.id, id, validated.fy, validated.rate);
    return jsonNoStore({ success: true, fy: validated.fy, rate: validated.rate });
  } catch (err) {
    return handleApiError(err);
  }
}

