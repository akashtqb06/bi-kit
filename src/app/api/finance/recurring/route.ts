import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { createRecurringRuleSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

export async function GET() {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('recurring');
    if (gated) return gated;

    const service = getFinanceService();
    const rules = await service.listRecurringRules(user.id);
    return jsonNoStore({ rules });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('recurring');
    if (gated) return gated;

    const json = await request.json();
    const data = createRecurringRuleSchema.parse(json);

    const service = getFinanceService();
    const rule = await service.createRecurringRule(user.id, data);
    return NextResponse.json({ rule }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

