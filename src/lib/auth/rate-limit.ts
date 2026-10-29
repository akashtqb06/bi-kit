import 'server-only';
import { and, asc, eq, gte, inArray, lt } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { loginAttempts } from '@src/lib/db/schema';
import { normalizedEmailSchema } from './schemas';

const WINDOW_MS = 15 * 60 * 1000;
const RETENTION_MS = 24 * 60 * 60 * 1000;
const EMAIL_LIMIT = 5;
const IP_LIMIT = 20;

function keysFor(email: string, ip: string): { emailKey: string; ipKey: string } {
    return {
        emailKey: `email:${normalizedEmailSchema.parse(email)}`,
        ipKey: `ip:${ip}`,
    };
}

export async function recordLoginAttempt(
    email: string,
    ip: string,
    success: boolean,
    attemptedAt = new Date()
): Promise<void> {
    const { emailKey, ipKey } = keysFor(email, ip);
    await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(attemptedAt.getTime() - RETENTION_MS)));
    await db.insert(loginAttempts).values([
        { key: emailKey, success, attemptedAt },
        { key: ipKey, success, attemptedAt },
    ]);
}

export type RateLimitResult = {
    allowed: boolean;
    retryAt: Date | null;
    message: string | null;
};

export async function checkLoginRateLimit(email: string, ip: string, now = new Date()): Promise<RateLimitResult> {
    const { emailKey, ipKey } = keysFor(email, ip);
    const cutoff = new Date(now.getTime() - WINDOW_MS);
    const attempts = await db
        .select({ key: loginAttempts.key, attemptedAt: loginAttempts.attemptedAt })
        .from(loginAttempts)
        .where(
            and(
                inArray(loginAttempts.key, [emailKey, ipKey]),
                gte(loginAttempts.attemptedAt, cutoff),
                eq(loginAttempts.success, false)
            )
        )
        .orderBy(asc(loginAttempts.attemptedAt));
    const emailAttempts = attempts.filter((attempt) => attempt.key === emailKey);
    const ipAttempts = attempts.filter((attempt) => attempt.key === ipKey);
    const retryTimes = [
        emailAttempts.length >= EMAIL_LIMIT ? emailAttempts[0].attemptedAt.getTime() + WINDOW_MS : null,
        ipAttempts.length >= IP_LIMIT ? ipAttempts[0].attemptedAt.getTime() + WINDOW_MS : null,
    ].filter((value): value is number => value !== null);

    if (retryTimes.length === 0) return { allowed: true, retryAt: null, message: null };

    const retryAt = new Date(Math.max(...retryTimes));
    const isEmailLockout = emailAttempts.length >= EMAIL_LIMIT;
    const message = isEmailLockout
        ? `Account temporarily locked due to repeated failed login attempts. Try again at ${retryAt.toISOString()}.`
        : `Too many login attempts from this IP address. Try again at ${retryAt.toISOString()}.`;
    return {
        allowed: false,
        retryAt,
        message,
    };
}

const PWD_USER_LIMIT = 5;
const PWD_IP_LIMIT = 20;

export async function recordPasswordAttempt(
    userId: string,
    ip: string,
    success: boolean,
    attemptedAt = new Date()
): Promise<void> {
    const userKey = `pwd:user:${userId}`;
    const ipKey = `pwd:ip:${ip}`;
    await db.delete(loginAttempts).where(lt(loginAttempts.attemptedAt, new Date(attemptedAt.getTime() - RETENTION_MS)));
    await db.insert(loginAttempts).values([
        { key: userKey, success, attemptedAt },
        { key: ipKey, success, attemptedAt },
    ]);
}

export async function checkPasswordRateLimit(userId: string, ip: string, now = new Date()): Promise<RateLimitResult> {
    const userKey = `pwd:user:${userId}`;
    const ipKey = `pwd:ip:${ip}`;
    const cutoff = new Date(now.getTime() - WINDOW_MS);
    const attempts = await db
        .select({ key: loginAttempts.key, attemptedAt: loginAttempts.attemptedAt })
        .from(loginAttempts)
        .where(
            and(
                inArray(loginAttempts.key, [userKey, ipKey]),
                gte(loginAttempts.attemptedAt, cutoff),
                eq(loginAttempts.success, false)
            )
        )
        .orderBy(asc(loginAttempts.attemptedAt));
    const userAttempts = attempts.filter((attempt) => attempt.key === userKey);
    const ipAttempts = attempts.filter((attempt) => attempt.key === ipKey);
    const retryTimes = [
        userAttempts.length >= PWD_USER_LIMIT ? userAttempts[0].attemptedAt.getTime() + WINDOW_MS : null,
        ipAttempts.length >= PWD_IP_LIMIT ? ipAttempts[0].attemptedAt.getTime() + WINDOW_MS : null,
    ].filter((value): value is number => value !== null);

    if (retryTimes.length === 0) return { allowed: true, retryAt: null, message: null };

    const retryAt = new Date(Math.max(...retryTimes));
    return {
        allowed: false,
        retryAt,
        message: `Too many password change attempts. Try again at ${retryAt.toISOString()}.`,
    };
}
