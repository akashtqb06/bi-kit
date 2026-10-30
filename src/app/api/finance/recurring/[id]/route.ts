import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { updateRecurringRuleSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('recurring');
    if (gated) return gated;

    const { id } = await context.params;
    const service = getFinanceService();
    const rule = await service.getRecurringRule(user.id, id);
    return jsonNoStore({ rule });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('recurring');
    if (gated) return gated;

    const { id } = await context.params;
    const json = await request.json();
    const data = updateRecurringRuleSchema.parse(json);

    const service = getFinanceService();
    const rule = await service.updateRecurringRule(user.id, id, data);
    return NextResponse.json({ rule });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('recurring');
    if (gated) return gated;

    const { id } = await context.params;
    const service = getFinanceService();
    await service.deleteRecurringRule(user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

