import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { updateTransactionSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const service = getFinanceService();
    const transaction = await service.getTransaction(user.id, id);
    return NextResponse.json({ transaction });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const json = await request.json();
    const data = updateTransactionSchema.parse(json);

    const service = getFinanceService();
    const transaction = await service.updateTransaction(user.id, id, data);
    return NextResponse.json({ transaction });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const service = getFinanceService();
    await service.deleteTransaction(user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

