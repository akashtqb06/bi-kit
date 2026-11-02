import { NextRequest } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { requireUserApi } from '@src/lib/auth/dal';
import { listInbox } from '@src/lib/finance/inbox/service';
import { inboxFiltersSchema } from '@src/lib/finance/ingest/schema';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';
import { jsonNoStore } from '@src/app/api/finance/utils';

export async function GET(request: NextRequest) {
  const gate = checkFeatureGatedApi('inbox');
  if (gate) return gate;

  try {
    const user = await requireUserApi();
    const { searchParams } = new URL(request.url);
    const rawFilters = Object.fromEntries(searchParams.entries());
    const filters = inboxFiltersSchema.parse(rawFilters);

    const result = await listInbox(user.id, filters);
    return jsonNoStore(result);
  } catch (err) {
    return handleApiError(err);
  }
}
