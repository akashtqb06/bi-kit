'use server';

import { count, eq } from 'drizzle-orm';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { db } from '@src/lib/db';
import { appSettings, users } from '@src/lib/db/schema';
import { createSession, destroySession } from './session';
import { hashPassword, verifyPassword } from './password';
import { checkLoginRateLimit, recordLoginAttempt } from './rate-limit';
import { credentialsSchema, registerSchema } from './schemas';
import type { AuthActionResult, AuthField } from './types';
export type { AuthActionResult, AuthField } from './types';

const invalidCredentialsMessage = 'Invalid email or password';
const dummyPasswordHash = hashPassword('bi-kit-invalid-account-password');

function readString(formData: FormData, key: string): string {
    const value = formData.get(key);
    return typeof value === 'string' ? value : '';
}

function fieldErrors(error: { issues: { path: PropertyKey[]; message: string }[] }): AuthActionResult {
    const errors: Partial<Record<AuthField, string>> = {};
    for (const issue of error.issues) {
        const field = issue.path[0];
        if (
            (field === 'name' || field === 'email' || field === 'password' || field === 'confirmPassword') &&
            !errors[field]
        ) {
            errors[field] = issue.message;
        }
    }
    return { ok: false, fieldErrors: errors };
}

function safeNextPath(value: string): string {
    if (!value.startsWith('/') || value.startsWith('//') || value.includes('\\')) return '/';
    try {
        const parsed = new URL(value, 'http://bi-kit.local');
        if (parsed.origin !== 'http://bi-kit.local') return '/';
        return `${parsed.pathname}${parsed.search}${parsed.hash}`;
    } catch {
        return '/';
    }
}

async function requestMetadata(): Promise<{ ip: string; userAgent: string | null }> {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
    return {
        ip: forwardedFor || requestHeaders.get('x-real-ip') || 'unknown',
        userAgent: requestHeaders.get('user-agent'),
    };
}

export async function registerAction(_previousState: AuthActionResult, formData: FormData): Promise<AuthActionResult> {
    const parsed = registerSchema.safeParse({
        name: readString(formData, 'name'),
        email: readString(formData, 'email'),
        password: readString(formData, 'password'),
        confirmPassword: readString(formData, 'confirmPassword'),
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'allowRegistration')).limit(1);
    if (setting?.value !== true) {
        return { ok: false, formError: 'Registration is closed' };
    }

    const passwordHash = await hashPassword(parsed.data.password);
    let user: typeof users.$inferSelect;
    try {
        user = await db.transaction((transaction) => {
            const [userCount] = transaction.select({ count: count() }).from(users).all();
            const [created] = transaction
                .insert(users)
                .values({
                    name: parsed.data.name,
                    email: parsed.data.email,
                    passwordHash,
                    role: userCount.count === 0 ? 'admin' : 'member',
                })
                .returning()
                .all();
            return created;
        });
    } catch {
        return {
            ok: false,
            fieldErrors: { email: 'An account with this email already exists' },
        };
    }

    const metadata = await requestMetadata();
    await createSession(user.id, metadata);
    redirect(safeNextPath(readString(formData, 'next')));
}

export async function loginAction(_previousState: AuthActionResult, formData: FormData): Promise<AuthActionResult> {
    const parsed = credentialsSchema.safeParse({
        email: readString(formData, 'email'),
        password: readString(formData, 'password'),
    });
    if (!parsed.success) return fieldErrors(parsed.error);

    const metadata = await requestMetadata();
    const rateLimit = await checkLoginRateLimit(parsed.data.email, metadata.ip);
    if (!rateLimit.allowed) {
        return { ok: false, formError: rateLimit.message ?? 'Too many login attempts. Try again later.' };
    }

    const [user] = await db.select().from(users).where(eq(users.email, parsed.data.email)).limit(1);
    const passwordHash = user?.passwordHash ?? (await dummyPasswordHash);
    const passwordMatches = await verifyPassword(parsed.data.password, passwordHash);

    if (!user || !passwordMatches) {
        await recordLoginAttempt(parsed.data.email, metadata.ip, false);
        return { ok: false, formError: invalidCredentialsMessage };
    }
    if (user.status !== 'active') {
        await recordLoginAttempt(parsed.data.email, metadata.ip, false);
        return { ok: false, formError: 'This account is disabled' };
    }

    await recordLoginAttempt(parsed.data.email, metadata.ip, true);
    await db.update(users).set({ lastLoginAt: new Date(), updatedAt: new Date() }).where(eq(users.id, user.id));
    await destroySession();
    await createSession(user.id, metadata);
    redirect(safeNextPath(readString(formData, 'next')));
}

export async function logoutAction(): Promise<void> {
    await destroySession();
    redirect('/login');
}
