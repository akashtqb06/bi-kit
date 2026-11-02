import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { rejectItems } from '@src/lib/finance/inbox/service';
import { bulkRejectSchema } from '@src/lib/finance/ingest/schema';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

export async function POST(request: NextRequest) {
  const gate = checkFeatureGatedApi('inbox');
  if (gate) return gate;

  try {
    const user = await requireUserApi();
    const json = await request.json();
    const parsed = bulkRejectSchema.parse(json);

    const result = await rejectItems(user.id, parsed.ids);
    return NextResponse.json({ result }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
