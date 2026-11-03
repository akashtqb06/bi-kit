import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, NotFoundError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../../utils';
import { db, finAccounts } from '@src/lib/db';
import { and, eq } from 'drizzle-orm';
import { previewPfPassbookInputSchema } from '@src/lib/finance/contract';
import { buildPassbookPreview } from '@src/lib/finance/domain/pf/parser';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    // Verify account belongs to user
    const [account] = await db
      .select({ id: finAccounts.id, kind: finAccounts.kind })
      .from(finAccounts)
      .where(and(eq(finAccounts.id, id), eq(finAccounts.userId, user.id)))
      .limit(1);

    if (!account) {
      throw new NotFoundError(`Account not found: ${id}`);
    }

    const body = await request.json();
    const validated = previewPfPassbookInputSchema.parse(body);

    const result = buildPassbookPreview(validated);
    return jsonNoStore(result);
  } catch (err) {
    return handleApiError(err);
  }
}

