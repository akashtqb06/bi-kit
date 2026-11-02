import { NextRequest, NextResponse } from 'next/server';
import { eq } from 'drizzle-orm';
import { requireUserApi } from '@src/lib/auth/dal';
import { BadRequestError, handleApiError } from '@src/app/api/utils';
import { db } from '@src/lib/db';
import { webhookEndpoints } from '@src/lib/db/schema';
import { createWebhookEndpointSchema } from '@src/lib/finance/ingest/schema';
import { validateWebhookUrl } from '@src/lib/finance/webhooks/dispatcher';
import { newId } from '@src/lib/db/id';

export async function GET() {
  try {
    const user = await requireUserApi();
    const endpoints = await db
      .select({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        enabled: webhookEndpoints.enabled,
        createdAt: webhookEndpoints.createdAt,
        updatedAt: webhookEndpoints.updatedAt,
      })
      .from(webhookEndpoints)
      .where(eq(webhookEndpoints.userId, user.id));

    return NextResponse.json({ endpoints }, { status: 200 });
  } catch (err) {
    return handleApiError(err);
  }
}

export async function POST(request: NextRequest) {
  try {
    const user = await requireUserApi();
    const json = await request.json();
    const parsed = createWebhookEndpointSchema.parse(json);

    const ssrfCheck = validateWebhookUrl(parsed.url);
    if (!ssrfCheck.valid) {
      throw new BadRequestError(`Invalid webhook URL: ${ssrfCheck.reason}`);
    }

    const id = newId();
    const [endpoint] = await db
      .insert(webhookEndpoints)
      .values({
        id,
        userId: user.id,
        url: parsed.url,
        secretHash: parsed.secret,
        events: parsed.events,
        enabled: parsed.enabled ?? true,
      })
      .returning({
        id: webhookEndpoints.id,
        url: webhookEndpoints.url,
        events: webhookEndpoints.events,
        enabled: webhookEndpoints.enabled,
        createdAt: webhookEndpoints.createdAt,
      });

    return NextResponse.json({ endpoint }, { status: 201 });
  } catch (err) {
    return handleApiError(err);
  }
}
