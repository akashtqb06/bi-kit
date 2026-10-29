import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { createValuationSchema, valuationFiltersSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());
    const filters = valuationFiltersSchema.parse(rawFilters);

    const service = getFinanceService();
    const valuations = await service.listValuations(user.id, filters);
    return NextResponse.json({ valuations });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const json = await request.json();
    const data = createValuationSchema.parse(json);

    const service = getFinanceService();
    const valuation = await service.createValuation(user.id, data);
    return NextResponse.json({ valuation }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

