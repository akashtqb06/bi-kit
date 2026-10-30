import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { categoryFiltersSchema, createCategorySchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';


export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());
    const filters = categoryFiltersSchema.parse(rawFilters);

    const service = getFinanceService();
    const categories = await service.listCategories(user.id, filters);
    return jsonNoStore({ categories });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const json = await request.json();
    const data = createCategorySchema.parse(json);

    const service = getFinanceService();
    const category = await service.createCategory(user.id, data);
    return NextResponse.json({ category }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

