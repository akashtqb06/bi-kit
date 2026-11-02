import { NextRequest, NextResponse } from 'next/server';
import { and, eq } from 'drizzle-orm';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, NotFoundError } from '@src/app/api/utils';
import { db } from '@src/lib/db';
import { webhookEndpoints } from '@src/lib/db/schema';

type RouteContext = { params: Promise<{ id: string }> };

export async function DELETE(_request: NextRequest, context: RouteContext) {
  try {
    const user = await requireUserApi();
    const { id } = await context.params;

    const result = await db
      .delete(webhookEndpoints)
      .where(and(eq(webhookEndpoints.id, id), eq(webhookEndpoints.userId, user.id)))
      .returning({ id: webhookEndpoints.id });

    if (result.length === 0) {
      throw new NotFoundError('Webhook endpoint not found');
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}
