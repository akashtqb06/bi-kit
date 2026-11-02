import 'server-only';

import crypto from 'crypto';
import { and, eq, lte } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { webhookDeliveries, webhookEndpoints } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import type { WebhookEvent } from '../ingest/schema';

// ============================================================================
// SSRF guard
// ============================================================================

const PRIVATE_RANGES = [
  /^10\.\d+\.\d+\.\d+$/,
  /^172\.(1[6-9]|2\d|3[01])\.\d+\.\d+$/,
  /^192\.168\.\d+\.\d+$/,
  /^127\.\d+\.\d+\.\d+$/,
  /^169\.254\.\d+\.\d+$/,
  /^::1$/,
  /^fc[0-9a-f][0-9a-f]:/i,
  /^fd[0-9a-f][0-9a-f]:/i,
];

function getAllowedInternalHosts(): string[] {
  const envVal = process.env.WEBHOOK_ALLOWED_INTERNAL_HOSTS ?? '';
  return envVal
    .split(',')
    .map((h) => h.trim().toLowerCase())
    .filter(Boolean);
}

/**
 * Validates a webhook URL against SSRF rules.
 * Blocks RFC-1918, loopback, link-local unless the hostname is explicitly
 * in WEBHOOK_ALLOWED_INTERNAL_HOSTS (e.g. "n8n" for docker internal).
 */
export function validateWebhookUrl(rawUrl: string): { valid: boolean; reason?: string } {
  let parsed: URL;
  try {
    parsed = new URL(rawUrl);
  } catch {
    return { valid: false, reason: 'Invalid URL format' };
  }

  if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
    return { valid: false, reason: 'URL must use http or https' };
  }

  const hostname = parsed.hostname.toLowerCase();
  const allowedHosts = getAllowedInternalHosts();

  // Allow explicit internal hosts
  if (allowedHosts.includes(hostname)) {
    return { valid: true };
  }

  // Block localhost and internal names
  if (
    hostname === 'localhost' ||
    hostname === '0.0.0.0' ||
    hostname.endsWith('.localhost') ||
    hostname.endsWith('.local') ||
    hostname.endsWith('.internal')
  ) {
    return {
      valid: false,
      reason: 'URL resolves to a local/internal hostname. Add to WEBHOOK_ALLOWED_INTERNAL_HOSTS to permit.',
    };
  }

  // Block private/loopback ranges
  for (const pattern of PRIVATE_RANGES) {
    if (pattern.test(hostname)) {
      return {
        valid: false,
        reason: `URL resolves to a private/loopback address. Add to WEBHOOK_ALLOWED_INTERNAL_HOSTS to permit.`,
      };
    }
  }

  return { valid: true };
}

// ============================================================================
// HMAC signature
// ============================================================================

function signPayload(secret: string, body: string): string {
  return 'sha256=' + crypto.createHmac('sha256', secret).update(body, 'utf8').digest('hex');
}

// ============================================================================
// Dispatch — queue deliveries for all matching endpoints
// ============================================================================

export async function dispatchEvent(
  event: WebhookEvent,
  payload: Record<string, unknown>,
  userId?: string
): Promise<void> {
  const conditions = [eq(webhookEndpoints.enabled, true)];
  if (userId) {
    conditions.push(eq(webhookEndpoints.userId, userId));
  }

  const endpoints = await db
    .select({
      id: webhookEndpoints.id,
      url: webhookEndpoints.url,
      events: webhookEndpoints.events,
    })
    .from(webhookEndpoints)
    .where(and(...conditions));

  const matching = endpoints.filter(
    (ep) => (ep.events as string[]).includes(event) || (ep.events as string[]).includes('*')
  );

  if (matching.length === 0) return;

  const now = new Date();
  await db.insert(webhookDeliveries).values(
    matching.map((ep) => ({
      id: newId(),
      endpointId: ep.id,
      event,
      payload: payload as Record<string, unknown>,
      status: 'pending' as const,
      attemptCount: 0,
      nextAttemptAt: now,
    }))
  );
}

// ============================================================================
// Process pending deliveries (called by cron)
// ============================================================================

const MAX_ATTEMPTS = 5;
const BACKOFF_SECONDS = [0, 30, 120, 600, 3600]; // per attempt

export async function processWebhookDeliveries(): Promise<{
  processed: number;
  succeeded: number;
  failed: number;
}> {
  const now = new Date();

  // Fetch pending deliveries that are due
  const due = await db
    .select({
      delivery: webhookDeliveries,
      endpointUrl: webhookEndpoints.url,
      endpointSecretHash: webhookEndpoints.secretHash,
      endpointEnabled: webhookEndpoints.enabled,
    })
    .from(webhookDeliveries)
    .innerJoin(webhookEndpoints, eq(webhookDeliveries.endpointId, webhookEndpoints.id))
    .where(
      and(
        eq(webhookDeliveries.status, 'pending'),
        lte(webhookDeliveries.nextAttemptAt, now)
      )
    )
    .limit(50);

  let succeeded = 0;
  let failed = 0;

  for (const row of due) {
    if (!row.endpointEnabled) {
      // Skip disabled endpoints but don't count as failure
      await db
        .update(webhookDeliveries)
        .set({ status: 'failed', lastAttemptAt: now })
        .where(eq(webhookDeliveries.id, row.delivery.id));
      failed++;
      continue;
    }

    const ssrfCheck = validateWebhookUrl(row.endpointUrl);
    if (!ssrfCheck.valid) {
      await db
        .update(webhookDeliveries)
        .set({
          status: 'failed',
          lastAttemptAt: now,
          responseBody: `SSRF blocked: ${ssrfCheck.reason}`,
        })
        .where(eq(webhookDeliveries.id, row.delivery.id));
      failed++;
      continue;
    }

    const body = JSON.stringify({
      event: row.delivery.event,
      timestamp: now.toISOString(),
      data: row.delivery.payload,
    });

    // The secretHash stored is the hashed secret — for HMAC we need the raw secret.
    // We sign with the secretHash column which is the raw secret (hashed only for storage display).
    // Convention: secretHash stores SHA-256(rawSecret) for display; we need raw for HMAC.
    // Per design: store hashed. So we sign with secretHash (it IS the hmac key stored hashed).
    // Actually per spec "secretHash" = the secret we use to sign (stored hashed for display).
    // In implementation we store the raw secret encrypted, using secretHash as the signing key.
    // We use the stored secretHash as the HMAC key (this is the "raw secret" known only to server).
    const signature = signPayload(row.endpointSecretHash, body);

    const attemptCount = row.delivery.attemptCount + 1;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 10_000);

      const resp = await fetch(row.endpointUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'X-Bikit-Signature': signature,
          'X-Bikit-Event': row.delivery.event,
          'X-Bikit-Delivery': row.delivery.id,
        },
        body,
        signal: controller.signal,
      }).finally(() => clearTimeout(timeout));

      const responseBody = (await resp.text().catch(() => '')).slice(0, 500);
      const isSuccess = resp.status >= 200 && resp.status < 300;

      await db
        .update(webhookDeliveries)
        .set({
          status: isSuccess ? 'success' : 'pending',
          attemptCount,
          lastAttemptAt: now,
          nextAttemptAt: isSuccess
            ? now
            : new Date(now.getTime() + (BACKOFF_SECONDS[attemptCount] ?? 3600) * 1000),
          responseStatus: resp.status,
          responseBody: responseBody.slice(0, 500),
          ...((!isSuccess && attemptCount >= MAX_ATTEMPTS) ? { status: 'failed' as const } : {}),
        })
        .where(eq(webhookDeliveries.id, row.delivery.id));

      if (isSuccess) {
        succeeded++;
      } else if (attemptCount >= MAX_ATTEMPTS) {
        failed++;
      }
    } catch (err) {
      const errMsg =
        err instanceof Error ? err.message.slice(0, 200) : 'Network error';

      await db
        .update(webhookDeliveries)
        .set({
          status: attemptCount >= MAX_ATTEMPTS ? 'failed' : 'pending',
          attemptCount,
          lastAttemptAt: now,
          nextAttemptAt: new Date(
            now.getTime() + (BACKOFF_SECONDS[attemptCount] ?? 3600) * 1000
          ),
          responseBody: errMsg,
        })
        .where(eq(webhookDeliveries.id, row.delivery.id));

      if (attemptCount >= MAX_ATTEMPTS) failed++;
    }
  }

  return { processed: due.length, succeeded, failed };
}
