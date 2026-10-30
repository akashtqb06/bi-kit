import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { budgetFiltersSchema, createBudgetSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('budgets');
    if (gated) return gated;

    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());
    const filters = budgetFiltersSchema.parse(rawFilters);

    const service = getFinanceService();
    const result = await service.listBudgets(user.id, filters);
    return jsonNoStore(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const gated = checkFeatureGatedApi('budgets');
    if (gated) return gated;

    const json = await request.json();
    const data = createBudgetSchema.parse(json);

    const service = getFinanceService();
    const budget = await service.createBudget(user.id, data);
    return NextResponse.json({ budget }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

