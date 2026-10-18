import 'server-only';
import { createHash, randomBytes } from 'node:crypto';
import { cache } from 'react';
import { and, eq, lte, ne } from 'drizzle-orm';
import { cookies } from 'next/headers';
import { connection } from 'next/server';
import { db } from '@src/lib/db';
import { sessions, users, type Session, type User } from '@src/lib/db/schema';
import type { ListedSession } from './types';

const SESSION_COOKIE = 'session';
const SESSION_LIFETIME_MS = 30 * 24 * 60 * 60 * 1000;
const SLIDING_WINDOW_MS = 12 * 60 * 60 * 1000;

export type SessionContext = {
    session: Session;
    user: User;
};

export type { ListedSession };

function hashToken(token: string): string {
    return createHash('sha256').update(token).digest('hex');
}

function cookieOptions(maxAge: number) {
    return {
        httpOnly: true,
        sameSite: 'lax' as const,
        path: '/',
        secure: process.env.NODE_ENV === 'production',
        maxAge,
    };
}

export async function createSession(
    userId: string,
    metadata: { ip?: string | null; userAgent?: string | null } = {}
): Promise<{ id: string; expiresAt: Date }> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    const [session] = await db
        .insert(sessions)
        .values({
            userId,
            tokenHash: hashToken(token),
            createdAt: now,
            lastUsedAt: now,
            expiresAt,
            ipAddress: metadata.ip ?? null,
            userAgent: metadata.userAgent ?? null,
        })
        .returning({ id: sessions.id, expiresAt: sessions.expiresAt });

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        ...cookieOptions(Math.floor(SESSION_LIFETIME_MS / 1000)),
        expires: expiresAt,
    });
    return session;
}

async function readSession(): Promise<SessionContext | null> {
    try {
        await connection();
    } catch {}
    let token: string | undefined;
    try {
        token = (await cookies()).get(SESSION_COOKIE)?.value;
    } catch {
        return null;
    }
    if (!token) return null;

    const tokenHash = hashToken(token);
    const [session] = await db.select().from(sessions).where(eq(sessions.tokenHash, tokenHash)).limit(1);
    if (!session) return null;

    const now = new Date();
    if (session.expiresAt <= now) {
        await db.delete(sessions).where(eq(sessions.id, session.id));
        return null;
    }

    const [user] = await db.select().from(users).where(eq(users.id, session.userId)).limit(1);
    if (!user || user.status !== 'active') return null;

    if (session.lastUsedAt.getTime() <= now.getTime() - SLIDING_WINDOW_MS) {
        const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
        const [updated] = await db
            .update(sessions)
            .set({ lastUsedAt: now, expiresAt })
            .where(
                and(eq(sessions.id, session.id), lte(sessions.lastUsedAt, new Date(now.getTime() - SLIDING_WINDOW_MS)))
            )
            .returning();
        if (updated) return { session: updated, user };
    }

    return { session, user };
}

export const getSession = cache(readSession);

export async function destroySession(): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    if (token) {
        await db.delete(sessions).where(eq(sessions.tokenHash, hashToken(token)));
    }
    cookieStore.delete(SESSION_COOKIE);
}

export async function destroyAllSessions(userId: string, exceptSessionId?: string): Promise<void> {
    await db
        .delete(sessions)
        .where(
            exceptSessionId
                ? and(eq(sessions.userId, userId), ne(sessions.id, exceptSessionId))
                : eq(sessions.userId, userId)
        );
}

export async function listSessions(userId: string): Promise<ListedSession[]> {
    return db
        .select({
            id: sessions.id,
            userId: sessions.userId,
            createdAt: sessions.createdAt,
            expiresAt: sessions.expiresAt,
            lastUsedAt: sessions.lastUsedAt,
            ipAddress: sessions.ipAddress,
            userAgent: sessions.userAgent,
        })
        .from(sessions)
        .where(eq(sessions.userId, userId));
}

export async function rotateCurrentSession(sessionId: string): Promise<void> {
    const token = randomBytes(32).toString('base64url');
    const now = new Date(Math.floor(Date.now() / 1000) * 1000);
    const expiresAt = new Date(now.getTime() + SESSION_LIFETIME_MS);
    await db
        .update(sessions)
        .set({
            tokenHash: hashToken(token),
            lastUsedAt: now,
            expiresAt,
        })
        .where(eq(sessions.id, sessionId));

    const cookieStore = await cookies();
    cookieStore.set(SESSION_COOKIE, token, {
        ...cookieOptions(Math.floor(SESSION_LIFETIME_MS / 1000)),
        expires: expiresAt,
    });
}

export async function revokeSession(userId: string, sessionId: string): Promise<void> {
    const cookieStore = await cookies();
    const token = cookieStore.get(SESSION_COOKIE)?.value;
    const currentTokenHash = token ? hashToken(token) : null;

    const [target] = await db
        .select()
        .from(sessions)
        .where(and(eq(sessions.id, sessionId), eq(sessions.userId, userId)))
        .limit(1);

    if (target) {
        await db.delete(sessions).where(eq(sessions.id, sessionId));
        if (currentTokenHash && target.tokenHash === currentTokenHash) {
            cookieStore.delete(SESSION_COOKIE);
        }
    }
}

