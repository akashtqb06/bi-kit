import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { learnPayeeRule } from '@src/lib/finance/inbox/service';
import { learnRuleSchema } from '@src/lib/finance/ingest/schema';
import { checkFeatureGatedApi } from '@src/lib/finance/flags';

type RouteContext = { params: Promise<{ id: string }> };

export async function POST(request: NextRequest, context: RouteContext) {
  const gate = checkFeatureGatedApi('inbox');
  if (gate) return gate;

  try {
    const user = await requireUserApi();
    const { id } = await context.params;
    const json = await request.json();
    const parsed = learnRuleSchema.parse(json);

    await learnPayeeRule(user.id, id, parsed.categoryId);
    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
