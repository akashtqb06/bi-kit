import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../utils';
import { createTransactionSchema, transactionFiltersSchema } from '@src/lib/finance/contract';
import { getFinanceService } from '@src/lib/finance/service';


export async function GET(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());
    const filters = transactionFiltersSchema.parse(rawFilters);

    const service = getFinanceService();
    const result = await service.listTransactions(user.id, filters);
    return jsonNoStore(result);
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const json = await request.json();
    const clientRequestIdHeader = request.headers.get('x-client-request-id') || undefined;
    const clientRequestId = json.clientRequestId || clientRequestIdHeader;

    const data = createTransactionSchema.parse({
      ...json,
      clientRequestId,
    });

    const service = getFinanceService();
    const transaction = await service.createTransaction(user.id, data, { clientRequestId });
    return NextResponse.json({ transaction }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}

