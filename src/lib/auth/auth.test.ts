import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const cookieState = vi.hoisted(() => ({
    value: '' as string,
    options: null as unknown,
}));

vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: () => (cookieState.value ? { value: cookieState.value } : undefined),
        set: (_name: string, value: string, options: unknown) => {
            cookieState.value = value;
            cookieState.options = options;
        },
        delete: () => {
            cookieState.value = '';
        },
    }),
    headers: async () => ({
        get: (header: string) => {
            if (header === 'x-forwarded-for') return '127.0.0.1';
            if (header === 'user-agent') return 'Vitest';
            return null;
        },
    }),
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
        throw new Error(`REDIRECT:${url}`);
    }),
}));

vi.mock('next/server', () => ({
    connection: async () => undefined,
}));

import { eq, inArray } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { appSettings, loginAttempts, sessions, users } from '@src/lib/db/schema';
import { registerAction, loginAction, logoutAction } from './actions';
import { can, assertCan, NotFoundError } from './policy';
import { checkLoginRateLimit, recordLoginAttempt } from './rate-limit';
import { createSession, destroyAllSessions, destroySession, getSession, listSessions } from './session';
import { hashPassword, needsRehash, verifyPassword } from './password';
import { credentialsSchema } from './schemas';

const member = { id: 'member-one', role: 'member' } as const;
const otherMember = { id: 'member-two', role: 'member' } as const;
const admin = { id: 'admin-one', role: 'admin' } as const;

async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
    const [user] = await db
        .insert(users)
        .values({
            id: 'auth-test-user',
            email: 'auth-test@example.com',
            name: 'Auth Test',
            passwordHash: 'not-used-by-session-tests',
            ...overrides,
        })
        .returning();
    return user;
}

const testEmails = ['auth-test@example.com', 'disabled@example.com', 'action-user@example.com'];

describe('auth foundation', () => {
    beforeEach(async () => {
        cookieState.value = '';
        cookieState.options = null;
        await db.delete(sessions);
        await db.delete(loginAttempts);
        await db.delete(users).where(inArray(users.email, testEmails));
    });

    afterEach(async () => {
        await db.delete(sessions);
        await db.delete(loginAttempts);
        await db.delete(users).where(inArray(users.email, testEmails));
    });

    afterAll(async () => {
        const { seedUsers } = await import('../../../scripts/seed/users');
        await seedUsers();
        const { seedSampleWorkbook } = await import('../../../scripts/seed/sample-workbook');
        await seedSampleWorkbook();
    });

    it('hashes passwords and verifies only the matching password', async () => {
        const encoded = await hashPassword('correct horse battery');

        expect(encoded).toMatch(/^scrypt\$32768\$8\$1\$/);
        expect(await verifyPassword('correct horse battery', encoded)).toBe(true);
        expect(await verifyPassword('incorrect password', encoded)).toBe(false);
        expect(needsRehash(encoded)).toBe(false);
        expect(needsRehash('not-a-hash')).toBe(true);
    });

    it('normalizes emails and enforces the shared password policy', () => {
        expect(credentialsSchema.parse({ email: ' User@Example.COM ', password: 'long-enough' }).email).toBe(
            'user@example.com'
        );
        expect(credentialsSchema.safeParse({ email: 'user@example.com', password: 'short' }).success).toBe(false);
        expect(credentialsSchema.safeParse({ email: 'user@example.com', password: 'x'.repeat(129) }).success).toBe(
            false
        );
        expect(credentialsSchema.safeParse({ email: 'user@example.com', password: 'USER@EXAMPLE.COM' }).success).toBe(
            false
        );
    });

    it('creates, reads, extends, lists, and destroys sessions', async () => {
        const user = await createTestUser();
        const created = await createSession(user.id, { ip: '127.0.0.1', userAgent: 'Vitest' });
        const [stored] = await db.select().from(sessions).where(eq(sessions.id, created.id));
        const cookieOptions = cookieState.options as {
            httpOnly: boolean;
            sameSite: string;
            path: string;
            maxAge: number;
            secure: boolean;
            expires: Date;
        };

        expect(cookieState.value).toHaveLength(43);
        expect(stored.tokenHash).not.toBe(cookieState.value);
        expect(stored.ipAddress).toBe('127.0.0.1');
        expect(cookieOptions).toMatchObject({
            httpOnly: true,
            sameSite: 'lax',
            path: '/',
            maxAge: 30 * 24 * 60 * 60,
            secure: process.env.NODE_ENV === 'production',
            expires: created.expiresAt,
        });
        expect(await getSession()).toMatchObject({ user: { id: user.id }, session: { id: created.id } });
        expect(await listSessions(user.id)).toHaveLength(1);

        const oldLastUsedAt = new Date(Date.now() - 13 * 60 * 60 * 1000);
        const oldExpiresAt = new Date(created.expiresAt.getTime() - 5000);
        await db
            .update(sessions)
            .set({ lastUsedAt: oldLastUsedAt, expiresAt: oldExpiresAt })
            .where(eq(sessions.id, created.id));
        await getSession();
        const [extended] = await db.select().from(sessions).where(eq(sessions.id, created.id));
        expect(extended.lastUsedAt.getTime()).toBeGreaterThan(oldLastUsedAt.getTime());
        expect(extended.expiresAt.getTime()).toBeGreaterThan(oldExpiresAt.getTime());

        await destroySession();
        expect(cookieState.value).toBe('');
        expect(await listSessions(user.id)).toHaveLength(0);
    });

    it('deletes expired sessions and rejects disabled users', async () => {
        const user = await createTestUser();
        const expired = await createSession(user.id);
        await db
            .update(sessions)
            .set({ expiresAt: new Date(Date.now() - 1000) })
            .where(eq(sessions.id, expired.id));
        expect(await getSession()).toBeNull();
        expect(await db.select().from(sessions).where(eq(sessions.id, expired.id))).toHaveLength(0);

        const disabled = await createTestUser({
            id: 'disabled-auth-user',
            email: 'disabled@example.com',
            status: 'disabled',
        });
        const session = await createSession(disabled.id);
        expect(await getSession()).toBeNull();
        expect(await listSessions(disabled.id)).toHaveLength(1);
        await db.delete(sessions).where(eq(sessions.id, session.id));
    });

    it('destroys all sessions except the requested current session', async () => {
        const user = await createTestUser();
        const current = await createSession(user.id);
        const other = await createSession(user.id);

        await destroyAllSessions(user.id, current.id);

        expect(await listSessions(user.id)).toHaveLength(1);
        expect((await listSessions(user.id))[0].id).toBe(current.id);
        expect(await db.select().from(sessions).where(eq(sessions.id, other.id))).toHaveLength(0);
    });

    it('applies admin, owner, other-member, and create policy rules', () => {
        const workbook = { type: 'workbook' as const, id: 'book-1', ownerId: member.id };
        expect(can(admin, 'delete', { type: 'user', id: otherMember.id })).toBe(true);
        expect(can(member, 'edit', workbook)).toBe(true);
        expect(can(otherMember, 'view', workbook)).toBe(false);
        expect(can(member, 'create', { type: 'user' })).toBe(false);
        // User cannot even view the workbook -> throws NotFoundError to avoid leaking existence
        expect(() => assertCan(otherMember, 'delete', workbook)).toThrow(NotFoundError);
        expect(() => assertCan(otherMember, 'view', workbook)).toThrow(NotFoundError);
    });

    it('rate limits failed email and IP attempts and ignores successful attempts', async () => {
        const now = new Date('2026-10-18T12:00:00.000Z');
        expect((await checkLoginRateLimit(' User@Example.com ', '192.0.2.1', now)).allowed).toBe(true);
        for (let attempt = 0; attempt < 5; attempt += 1) {
            await recordLoginAttempt('user@example.com', '192.0.2.1', false, new Date(now.getTime() + attempt * 1000));
        }
        const limited = await checkLoginRateLimit('USER@example.com', '192.0.2.1', now);
        expect(limited.allowed).toBe(false);
        expect(limited.retryAt).toEqual(new Date(now.getTime() + 15 * 60 * 1000));
        expect(limited.message).toContain(limited.retryAt?.toISOString());

        await db.delete(loginAttempts);
        await recordLoginAttempt('user@example.com', '192.0.2.1', true, now);
        expect((await checkLoginRateLimit('user@example.com', '192.0.2.1', now)).allowed).toBe(true);

        await db.delete(loginAttempts);
        for (let attempt = 0; attempt < 20; attempt += 1) {
            await recordLoginAttempt(`person-${attempt}@example.com`, '192.0.2.1', false, now);
        }
        const ipLimited = await checkLoginRateLimit('another@example.com', '192.0.2.1', now);
        expect(ipLimited.allowed).toBe(false);
        expect(ipLimited.retryAt).toEqual(new Date(now.getTime() + 15 * 60 * 1000));
    });

    it('seeds registration as enabled', async () => {
        const [setting] = await db.select().from(appSettings).where(eq(appSettings.key, 'allowRegistration'));
        expect(setting?.value).toBe(true);
    });

    it('registers a new user, logs in, and logs out via server actions', async () => {
        const registerFormData = new FormData();
        registerFormData.append('name', 'Action User');
        registerFormData.append('email', 'action-user@example.com');
        registerFormData.append('password', 'ValidPass123!');
        registerFormData.append('confirmPassword', 'ValidPass123!');
        registerFormData.append('next', '/workbooks');

        await expect(registerAction({ ok: false }, registerFormData)).rejects.toThrow('REDIRECT:/workbooks');
        expect(cookieState.value).toHaveLength(43);

        const [createdUser] = await db.select().from(users).where(eq(users.email, 'action-user@example.com'));
        expect(createdUser).toBeDefined();
        expect(createdUser?.name).toBe('Action User');

        // Test login with valid credentials
        cookieState.value = '';
        const loginFormData = new FormData();
        loginFormData.append('email', 'action-user@example.com');
        loginFormData.append('password', 'ValidPass123!');
        loginFormData.append('next', '/dashboards');

        await expect(loginAction({ ok: false }, loginFormData)).rejects.toThrow('REDIRECT:/dashboards');
        expect(cookieState.value).toHaveLength(43);

        // Test login with invalid credentials
        const badLoginFormData = new FormData();
        badLoginFormData.append('email', 'action-user@example.com');
        badLoginFormData.append('password', 'WrongPassword123!');
        const badResult = await loginAction({ ok: false }, badLoginFormData);
        expect(badResult.ok).toBe(false);
        expect(badResult.formError).toBe('Invalid email or password');

        // Test logout
        await expect(logoutAction()).rejects.toThrow('REDIRECT:/login');
        expect(cookieState.value).toBe('');
    });
});
