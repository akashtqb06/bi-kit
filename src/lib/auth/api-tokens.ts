import 'server-only';

import crypto from 'crypto';
import { and, eq, gte, isNull, lt } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { apiTokens, loginAttempts } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------

export type ApiTokenRecord = typeof apiTokens.$inferSelect;

export type ApiTokenListItem = {
    id: string;
    name: string;
    prefix: string;
    scopes: string[];
    lastUsedAt: Date | null;
    expiresAt: Date | null;
    revokedAt: Date | null;
    createdAt: Date;
};

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function hashToken(rawToken: string): string {
    return crypto.createHash('sha256').update(rawToken).digest('hex');
}

// ---------------------------------------------------------------------------
// createToken
// ---------------------------------------------------------------------------

export async function createToken(
    userId: string,
    name: string,
    scopes: string[],
    expiresAt?: Date
): Promise<{ token: string; record: ApiTokenRecord }> {
    const token = crypto.randomBytes(32).toString('hex');
    const prefix = token.slice(0, 8);
    const tokenHash = hashToken(token);

    const [record] = await db
        .insert(apiTokens)
        .values({
            id: newId(),
            userId,
            name,
            tokenHash,
            prefix,
            scopes,
            expiresAt: expiresAt ?? null,
        })
        .returning();

    return { token, record };
}

// ---------------------------------------------------------------------------
// validateToken
// ---------------------------------------------------------------------------

export async function validateToken(
    rawToken: string,
    requiredScope: string
): Promise<{ userId: string; tokenId: string } | null> {
    const tokenHash = hashToken(rawToken);

    const [row] = await db
        .select()
        .from(apiTokens)
        .where(and(eq(apiTokens.tokenHash, tokenHash), isNull(apiTokens.revokedAt)))
        .limit(1);

    if (!row) return null;

    // Check expiry
    if (row.expiresAt && row.expiresAt < new Date()) return null;

    // Check scope
    if (!row.scopes.includes(requiredScope)) return null;

    // Fire-and-forget lastUsedAt update
    db.update(apiTokens)
        .set({ lastUsedAt: new Date() })
        .where(eq(apiTokens.id, row.id))
        .catch(() => {
            // intentionally swallow
        });

    return { userId: row.userId, tokenId: row.id };
}

// ---------------------------------------------------------------------------
// listTokens
// ---------------------------------------------------------------------------

export async function listTokens(userId: string): Promise<ApiTokenListItem[]> {
    const rows = await db
        .select({
            id: apiTokens.id,
            name: apiTokens.name,
            prefix: apiTokens.prefix,
            scopes: apiTokens.scopes,
            lastUsedAt: apiTokens.lastUsedAt,
            expiresAt: apiTokens.expiresAt,
            revokedAt: apiTokens.revokedAt,
            createdAt: apiTokens.createdAt,
        })
        .from(apiTokens)
        .where(eq(apiTokens.userId, userId));

    return rows;
}

// ---------------------------------------------------------------------------
// revokeToken
// ---------------------------------------------------------------------------

export async function revokeToken(userId: string, tokenId: string): Promise<void> {
    await db
        .update(apiTokens)
        .set({ revokedAt: new Date() })
        .where(and(eq(apiTokens.id, tokenId), eq(apiTokens.userId, userId)));
}

// ---------------------------------------------------------------------------
// checkTokenRateLimit
// ---------------------------------------------------------------------------

const TOKEN_WINDOW_MS = 60 * 1000; // 1 minute
const TOKEN_LIMIT = 100;

export async function checkTokenRateLimit(
    tokenId: string,
    ip: string
): Promise<{ allowed: boolean }> {
    void ip; // ip reserved for future per-IP limiting
    const key = `token:${tokenId}`;
    const now = new Date();
    const cutoff = new Date(now.getTime() - TOKEN_WINDOW_MS);

    const recentAttempts = await db
        .select({ id: loginAttempts.id })
        .from(loginAttempts)
        .where(
            and(
                eq(loginAttempts.key, key),
                gte(loginAttempts.attemptedAt, cutoff)
            )
        );

    if (recentAttempts.length >= TOKEN_LIMIT) {
        return { allowed: false };
    }

    // Record this request; fire-and-forget cleanup of stale entries + insert
    db.delete(loginAttempts)
        .where(lt(loginAttempts.attemptedAt, new Date(now.getTime() - 24 * 60 * 60 * 1000)))
        .catch(() => {});

    db.insert(loginAttempts)
        .values({ key, success: false, attemptedAt: now })
        .catch(() => {});

    return { allowed: true };
}
