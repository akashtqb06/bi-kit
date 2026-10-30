import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { accountFiltersSchema, createAccountSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';

export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());
    const filters = accountFiltersSchema.parse(rawFilters);

    const service = getFinanceService();
    const accounts = await service.listAccounts(user.id, filters);
    return jsonNoStore({ accounts });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const json = await request.json();
    const data = createAccountSchema.parse(json);

    const service = getFinanceService();
    const account = await service.createAccount(user.id, data);
    return NextResponse.json({ account }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

