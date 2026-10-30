import 'server-only';
import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { recomputeDepositValuations } from '@src/lib/finance/db-service/valuations';
import { getAccount } from '@src/lib/finance/db-service/accounts';

export async function POST(
  _request: NextRequest,
  context: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    // Verify account exists and belongs to user
    await getAccount(user.id, id);

    const result = await recomputeDepositValuations(user.id, id);

    return NextResponse.json({
      success: true,
      processedAccounts: result.processedAccounts,
      valuationsWritten: result.valuationsWritten,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
