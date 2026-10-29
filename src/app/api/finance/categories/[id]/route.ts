import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { updateCategorySchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const service = getFinanceService();
    const category = await service.getCategory(user.id, id);
    return NextResponse.json({ category });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const json = await request.json();
    const data = updateCategorySchema.parse(json);

    const service = getFinanceService();
    const category = await service.updateCategory(user.id, id, data);
    return NextResponse.json({ category });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const service = getFinanceService();
    await service.deleteCategory(user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

