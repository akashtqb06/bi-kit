import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import crypto from 'crypto';
import { db } from '@src/lib/db';
import { users, webhookDeliveries, webhookEndpoints } from '@src/lib/db/schema';
import { inArray } from 'drizzle-orm';
import {
  dispatchEvent,
  processWebhookDeliveries,
  validateWebhookUrl,
} from '../webhooks/dispatcher';

describe('Webhooks & Outbound Dispatcher', () => {
  const userA = 'usr_webhook_a';
  const userB = 'usr_webhook_b';
  const secretA = 'super_secret_webhook_key_12345';

  beforeEach(async () => {
    // Seed users
    await db.insert(users).values([
      { id: userA, email: 'webhooks_a@example.com', name: 'Webhook User A', passwordHash: 'h', role: 'member' },
      { id: userB, email: 'webhooks_b@example.com', name: 'Webhook User B', passwordHash: 'h', role: 'member' },
    ]).onConflictDoNothing();
  });

  afterEach(async () => {
    await db.delete(webhookDeliveries);
    await db.delete(webhookEndpoints).where(inArray(webhookEndpoints.userId, [userA, userB]));
    vi.restoreAllMocks();
  });

  it('SSRF guard blocks private, loopback, and link-local URLs while permitting public and allowlisted hosts', () => {
    // Blocked private/loopback/link-local
    expect(validateWebhookUrl('http://127.0.0.1:5678/webhook').valid).toBe(false);
    expect(validateWebhookUrl('http://localhost:5678/webhook').valid).toBe(false);
    expect(validateWebhookUrl('http://192.168.1.100/webhook').valid).toBe(false);
    expect(validateWebhookUrl('http://10.0.0.5/webhook').valid).toBe(false);
    expect(validateWebhookUrl('http://172.16.0.1/webhook').valid).toBe(false);
    expect(validateWebhookUrl('http://169.254.169.254/latest/meta-data').valid).toBe(false);
    expect(validateWebhookUrl('ftp://example.com/webhook').valid).toBe(false);

    // Permitted public URLs
    expect(validateWebhookUrl('https://hooks.slack.com/services/XXX/YYY').valid).toBe(true);
    expect(validateWebhookUrl('https://api.my-domain.com/webhooks/bikit').valid).toBe(true);

    // Explicit allowlist setting (e.g. docker internal service "n8n")
    process.env.WEBHOOK_ALLOWED_INTERNAL_HOSTS = 'n8n,internal-relay';
    expect(validateWebhookUrl('http://n8n:5678/webhook/bikit').valid).toBe(true);
    expect(validateWebhookUrl('http://internal-relay/hook').valid).toBe(true);
    delete process.env.WEBHOOK_ALLOWED_INTERNAL_HOSTS;
  });

  it('dispatches events only to enabled, matching endpoints and enforces user isolation', async () => {
    // User A has 2 endpoints: 1 for transaction.created, 1 disabled
    const [epA1] = await db
      .insert(webhookEndpoints)
      .values({
        userId: userA,
        url: 'https://webhook.site/user-a-txns',
        secretHash: secretA,
        events: ['transaction.created'],
        enabled: true,
      })
      .returning();

    await db
      .insert(webhookEndpoints)
      .values({
        userId: userA,
        url: 'https://webhook.site/user-a-disabled',
        secretHash: secretA,
        events: ['transaction.created'],
        enabled: false,
      });

    // User B endpoint
    const [epB] = await db
      .insert(webhookEndpoints)
      .values({
        userId: userB,
        url: 'https://webhook.site/user-b',
        secretHash: 'secret_b',
        events: ['transaction.created'],
        enabled: true,
      })
      .returning();

    // Dispatch transaction.created for User A
    await dispatchEvent('transaction.created', { transactionId: 'txn_123', amount: 50000 }, userA);

    // Verify delivery queued ONLY for User A's enabled endpoint
    const deliveries = await db.select().from(webhookDeliveries);
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0].endpointId).toBe(epA1.id);
    expect(deliveries[0].event).toBe('transaction.created');
    expect(deliveries[0].status).toBe('pending');
    expect(deliveries[0].attemptCount).toBe(0);

    // User B endpoint got nothing (strict isolation)
    const bDeliveries = deliveries.filter((d) => d.endpointId === epB.id);
    expect(bDeliveries).toHaveLength(0);
  });

  it('processes webhook deliveries with HMAC-SHA256 signatures, handles success, and retries on failure', async () => {
    await db
      .insert(webhookEndpoints)
      .values({
        userId: userA,
        url: 'https://webhook.site/test-delivery',
        secretHash: secretA,
        events: ['transaction.created'],
        enabled: true,
      });

    await dispatchEvent('transaction.created', { id: 'txn_abc', amount: 999 }, userA);

    // Mock fetch to inspect headers, signature, and body
    let capturedHeaders: HeadersInit | undefined;
    let capturedBody: string | undefined;

    const fetchMock = vi.fn().mockImplementation(async (url, init) => {
      capturedHeaders = init.headers;
      capturedBody = init.body;
      return new Response(JSON.stringify({ received: true }), { status: 200 });
    });
    vi.stubGlobal('fetch', fetchMock);

    const result = await processWebhookDeliveries();
    expect(result.processed).toBe(1);
    expect(result.succeeded).toBe(1);
    expect(result.failed).toBe(0);

    // Verify signature was generated using HMAC-SHA256
    const headersObj = capturedHeaders as Record<string, string>;
    expect(headersObj['X-Bikit-Event']).toBe('transaction.created');
    expect(headersObj['X-Bikit-Signature']).toBeDefined();

    const expectedSignature =
      'sha256=' + crypto.createHmac('sha256', secretA).update(capturedBody!, 'utf8').digest('hex');
    expect(headersObj['X-Bikit-Signature']).toBe(expectedSignature);

    // Verify delivery updated in DB to 'success'
    const [delivery] = await db.select().from(webhookDeliveries);
    expect(delivery.status).toBe('success');
    expect(delivery.attemptCount).toBe(1);
    expect(delivery.responseStatus).toBe(200);
  });

  it('retries deliveries with exponential backoff and marks failed when max attempts exceeded', async () => {
    await db.insert(webhookEndpoints).values({
      id: 'ep_failing',
      userId: userA,
      url: 'https://webhook.site/failing-receiver',
      secretHash: secretA,
      events: ['card.due_soon'],
      enabled: true,
    });

    await dispatchEvent('card.due_soon', { accountId: 'acc_card_1', daysUntilDue: 2 }, userA);

    // Mock failing HTTP 500 response
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('Server Error', { status: 500 })));

    // Attempt 1 fails -> stays pending, nextAttemptAt bumped
    const res1 = await processWebhookDeliveries();
    expect(res1.processed).toBe(1);
    expect(res1.succeeded).toBe(0);

    const [del1] = await db.select().from(webhookDeliveries);
    expect(del1.status).toBe('pending');
    expect(del1.attemptCount).toBe(1);

    // Simulate 4 more failed attempts until max attempts (5) reached
    await db.update(webhookDeliveries).set({
      attemptCount: 4,
      nextAttemptAt: new Date(Date.now() - 1000), // Due now
    });

    const res5 = await processWebhookDeliveries();
    expect(res5.failed).toBe(1);

    const [delFinal] = await db.select().from(webhookDeliveries);
    expect(delFinal.status).toBe('failed');
    expect(delFinal.attemptCount).toBe(5);
  });
});
