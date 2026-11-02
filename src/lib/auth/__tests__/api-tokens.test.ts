import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { db } from '@src/lib/db';
import { apiTokens, auditLog, loginAttempts, users } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import crypto from 'crypto';
import {
  createToken,
  validateToken,
  listTokens,
  revokeToken,
  checkTokenRateLimit,
} from '../api-tokens';
import { requireTokenOrSession } from '../require-token-or-session';
import { UnauthorizedError } from '../policy';

// Mock getCurrentUser for fallback
vi.mock('../dal', () => ({
  getCurrentUser: vi.fn(),
}));

import { getCurrentUser } from '../dal';

describe('API Tokens & Authentication', () => {
  const userA = 'usr_token_test_a';
  const userB = 'usr_token_test_b';

  beforeEach(async () => {
    // Seed test users
    await db.insert(users).values([
      {
        id: userA,
        email: 'usera@example.com',
        name: 'User A',
        passwordHash: 'dummy',
        role: 'member',
      },
      {
        id: userB,
        email: 'userb@example.com',
        name: 'User B',
        passwordHash: 'dummy',
        role: 'member',
      },
    ]).onConflictDoNothing();
  });

  afterEach(async () => {
    await db.delete(apiTokens).where(eq(apiTokens.userId, userA));
    await db.delete(apiTokens).where(eq(apiTokens.userId, userB));
    await db.delete(loginAttempts);
    vi.clearAllMocks();
  });

  it('creates token with hashed storage and one-time display (never stores raw token)', async () => {
    const { token, record } = await createToken(userA, 'Automation Ingest', ['finance:ingest']);

    expect(token).toBeDefined();
    expect(typeof token).toBe('string');
    expect(token.length).toBe(64); // 32 random bytes as hex

    // Display prefix is first 8 characters
    expect(record.prefix).toBe(token.slice(0, 8));

    // Verify raw token is NOT in database, only SHA-256 hash is stored
    const [stored] = await db.select().from(apiTokens).where(eq(apiTokens.id, record.id));
    expect(stored).toBeDefined();
    expect(stored.tokenHash).not.toBe(token);

    const expectedHash = crypto.createHash('sha256').update(token).digest('hex');
    expect(stored.tokenHash).toBe(expectedHash);

    // listTokens does not expose tokenHash
    const list = await listTokens(userA);
    expect(list).toHaveLength(1);
    expect(list[0]).not.toHaveProperty('tokenHash');
    expect(list[0].prefix).toBe(token.slice(0, 8));
  });

  it('enforces scope validation (finance:ingest vs finance:read)', async () => {
    const { token } = await createToken(userA, 'Ingest Only', ['finance:ingest']);

    // Valid scope
    const ingestValid = await validateToken(token, 'finance:ingest');
    expect(ingestValid).not.toBeNull();
    expect(ingestValid?.userId).toBe(userA);

    // Invalid scope
    const readInvalid = await validateToken(token, 'finance:read');
    expect(readInvalid).toBeNull();
  });

  it('rejects expired tokens', async () => {
    const pastDate = new Date(Date.now() - 3600 * 1000); // 1 hour ago
    const { token } = await createToken(userA, 'Expired Token', ['finance:ingest'], pastDate);

    const result = await validateToken(token, 'finance:ingest');
    expect(result).toBeNull();
  });

  it('revokes tokens and blocks subsequent validation', async () => {
    const { token, record } = await createToken(userA, 'To Revoke', ['finance:ingest']);

    // Valid initially
    expect(await validateToken(token, 'finance:ingest')).not.toBeNull();

    // Revoke
    await revokeToken(userA, record.id);

    // Invalid after revoke
    expect(await validateToken(token, 'finance:ingest')).toBeNull();
  });

  it('enforces per-token rate limiting', async () => {
    const { record } = await createToken(userA, 'Rate Limited Token', ['finance:ingest']);

    // Seed 99 attempts
    for (let i = 0; i < 99; i++) {
      const res = await checkTokenRateLimit(record.id, '127.0.0.1');
      expect(res.allowed).toBe(true);
    }

    // 100th attempt is allowed
    const attempt100 = await checkTokenRateLimit(record.id, '127.0.0.1');
    expect(attempt100.allowed).toBe(true);

    // 101st attempt exceeds limit
    const attempt101 = await checkTokenRateLimit(record.id, '127.0.0.1');
    expect(attempt101.allowed).toBe(false);
  });

  it('requireTokenOrSession validates Bearer token, enforces rate limit, and emits audit log without raw token', async () => {
    const { token, record } = await createToken(userA, 'Bearer Ingest', ['finance:ingest']);

    const req = new Request('http://localhost:3000/api/finance/ingest/transactions', {
      headers: { Authorization: `Bearer ${token}` },
    });

    const auth = await requireTokenOrSession('finance:ingest', req);
    expect(auth.userId).toBe(userA);
    expect(auth.via).toBe('token');
    expect(auth.tokenId).toBe(record.id);

    // Verify audit log has no raw token
    const logs = await db
      .select()
      .from(auditLog)
      .where(eq(auditLog.userId, userA));

    const tokenUseLog = logs.find((l) => l.action === 'api_token.used');
    expect(tokenUseLog).toBeDefined();
    const details = tokenUseLog?.details as Record<string, unknown>;
    expect(details?.tokenId).toBe(record.id);
    expect(details?.scope).toBe('finance:ingest');
    // Ensure raw token is NEVER present anywhere in audit logs
    const logString = JSON.stringify(tokenUseLog);
    expect(logString).not.toContain(token);
  });

  it('requireTokenOrSession rejects invalid or missing tokens', async () => {
    const invalidReq = new Request('http://localhost:3000/api/finance/ingest/transactions', {
      headers: { Authorization: 'Bearer invalid_hex_token_12345' },
    });

    await expect(requireTokenOrSession('finance:ingest', invalidReq)).rejects.toThrow(
      UnauthorizedError
    );
  });

  it('requireTokenOrSession falls back to session when no Bearer header is present', async () => {
    vi.mocked(getCurrentUser).mockResolvedValueOnce({
      id: userA,
      email: 'usera@example.com',
      name: 'User A',
      role: 'member',
      status: 'active',
      avatarUrl: null,
      createdAt: new Date(),
      lastLoginAt: null,
      mustChangePassword: false,
    });

    const reqWithoutAuth = new Request('http://localhost:3000/api/finance/ingest/transactions');
    const auth = await requireTokenOrSession('finance:ingest', reqWithoutAuth);
    expect(auth.userId).toBe(userA);
    expect(auth.via).toBe('session');
  });

  it('enforces strict user isolation: User A cannot see or revoke User B tokens', async () => {
    const { record: tokenB } = await createToken(userB, 'User B Token', ['finance:ingest']);

    // User A lists tokens — must not see User B's token
    const listA = await listTokens(userA);
    expect(listA.find((t) => t.id === tokenB.id)).toBeUndefined();

    // User A attempts to revoke User B's token — does not revoke it
    await revokeToken(userA, tokenB.id);

    const [checkTokenB] = await db.select().from(apiTokens).where(eq(apiTokens.id, tokenB.id));
    expect(checkTokenB.revokedAt).toBeNull();
  });
});
