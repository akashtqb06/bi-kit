import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { approveItems } from '@src/lib/finance/inbox/service';
import { bulkApproveSchema } from '@src/lib/finance/ingest/schema';
import { dispatchEvent } from '@src/lib/finance/webhooks/dispatcher';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

export async function POST(request: NextRequest) {
  const gate = checkFeatureGatedApi('inbox');
  if (gate) return gate;

  try {
    const user = await requireUserApi();
    const json = await request.json();
    const parsed = bulkApproveSchema.parse(json);

    const result = await approveItems(user.id, parsed.items);

    // Fire transaction.created event for each newly created transaction
    for (const txnId of result.transactionIds) {
      void dispatchEvent('transaction.created', { transactionId: txnId }, user.id);
    }

    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
