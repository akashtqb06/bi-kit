import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { POST } from '@src/app/api/cron/recurring/route';
import { setupFinanceTestDb } from '../../__tests__/db/test-helper';

describe('POST /api/cron/recurring', () => {
  const originalSecret = process.env.CRON_SECRET;

  beforeEach(async () => {
    process.env.CRON_SECRET = 'test_cron_secret_s6a';
    process.env.FINANCE_BACKEND = 'db';
    await setupFinanceTestDb();
  });

  afterEach(() => {
    process.env.CRON_SECRET = originalSecret;
  });

  it('rejects unauthenticated requests without CRON_SECRET with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/recurring', {
      method: 'POST',
    });

    const res = await POST(req);
    expect(res.status).toBe(401);

    const body = await res.json();
    expect(body.error).toBeDefined();
  });

  it('rejects requests with incorrect bearer token with 401', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/recurring', {
      method: 'POST',
      headers: {
        authorization: 'Bearer wrong_token',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(401);
  });

  it('accepts valid Bearer token and triggers recurring generation', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/recurring', {
      method: 'POST',
      headers: {
        authorization: 'Bearer test_cron_secret_s6a',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
    expect(typeof body.processed).toBe('number');
    expect(typeof body.generated).toBe('number');
    expect(body.timestamp).toBeDefined();
  });

  it('accepts valid x-cron-secret header', async () => {
    const req = new NextRequest('http://localhost:3000/api/cron/recurring', {
      method: 'POST',
      headers: {
        'x-cron-secret': 'test_cron_secret_s6a',
      },
    });

    const res = await POST(req);
    expect(res.status).toBe(200);

    const body = await res.json();
    expect(body.success).toBe(true);
  });
});
