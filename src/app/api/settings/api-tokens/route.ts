import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { createToken, listTokens } from '@src/lib/auth/api-tokens';
import { createApiTokenSchema } from '@src/lib/finance/ingest/schema';

export async function GET() {
  try {
    const user = await requireUserApi();
    const tokens = await listTokens(user.id);
    return NextResponse.json({ tokens }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const json = await request.json();
    const parsed = createApiTokenSchema.parse(json);

    const { token, record } = await createToken(
      user.id,
      parsed.name,
      parsed.scopes,
      parsed.expiresAt ?? undefined
    );

    return NextResponse.json({ token, record }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
