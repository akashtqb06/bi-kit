import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { updateAccountSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const service = getFinanceService();
    const account = await service.getAccount(user.id, id);
    return jsonNoStore({ account });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const json = await request.json();
    const data = updateAccountSchema.parse(json);

    const service = getFinanceService();
    const account = await service.updateAccount(user.id, id, data);
    return NextResponse.json({ account });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const service = getFinanceService();
    await service.deleteAccount(user.id, id);
    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}

