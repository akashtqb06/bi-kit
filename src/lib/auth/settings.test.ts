import { afterAll, afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import fs from 'node:fs/promises';
import { eq, like } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { dataSources, users, workbooks } from '@src/lib/db/schema';
import {
    changePasswordAction,
    deleteAccountAction,
    revokeOtherSessionsAction,
    revokeSessionAction,
    updateProfileAction,
    uploadAvatarAction,
} from './settings-actions';
import { createSession, getSession, listSessions } from './session';
import { hashPassword, verifyPassword } from './password';
import {
    getAvatarFilePath,
    getUserActivityCounts,
    removeAvatar,
    saveAvatar,
} from './user-service';
import { parseUserAgent } from '@src/components/settings/sessions-view';
import { requireRole } from './dal';

// Mock cookies and headers for Server Actions
const cookieState = vi.hoisted(() => ({
    value: '' as string,
    options: null as unknown,
}));

vi.mock('next/headers', () => ({
    cookies: async () => ({
        get: (name: string) => {
            if (name === 'session') {
                return cookieState.value ? { value: cookieState.value } : undefined;
            }
            return undefined;
        },
        set: (_name: string, value: string, options: unknown) => {
            cookieState.value = value;
            cookieState.options = options;
        },
        delete: (name: string) => {
            if (name === 'session') {
                cookieState.value = '';
            }
        },
    }),
    headers: async () => ({
        get: (header: string) => {
            if (header === 'x-forwarded-for') return '192.168.1.100';
            if (header === 'user-agent') return 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            return null;
        },
    }),
}));

vi.mock('next/cache', () => ({
    revalidatePath: vi.fn(),
}));

vi.mock('next/server', () => ({
    connection: async () => undefined,
}));

vi.mock('next/navigation', () => ({
    redirect: vi.fn((url: string) => {
        throw new Error(`REDIRECT:${url}`);
    }),
}));

async function createTestUser(overrides: Partial<typeof users.$inferInsert> = {}) {
    const passwordHash = await hashPassword('password123');
    const [user] = await db
        .insert(users)
        .values({
            name: 'Test User',
            email: `test-${Date.now()}-${Math.random().toString(36).substring(7)}@example.com`,
            passwordHash,
            role: 'member',
            status: 'active',
            ...overrides,
        })
        .returning();
    return user;
}

describe('Settings module & user service', () => {
    beforeEach(async () => {
        cookieState.value = '';
        await db.delete(workbooks).where(like(workbooks.name, '%Workbook%'));
        await db.delete(dataSources).where(like(dataSources.name, '%Data Source%'));
    });

    afterEach(async () => {
        cookieState.value = '';
        await db.delete(workbooks).where(like(workbooks.name, '%Workbook%'));
        await db.delete(dataSources).where(like(dataSources.name, '%Data Source%'));
    });

    describe('User-agent parser', () => {
        it('correctly parses desktop and mobile user agents without external libraries', () => {
            expect(parseUserAgent(null)).toBe('Unknown device');
            expect(parseUserAgent('')).toBe('Unknown device');

            const macChrome = 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
            expect(parseUserAgent(macChrome)).toBe('Chrome on macOS');

            const winEdge = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 Edg/120.0.0.0';
            expect(parseUserAgent(winEdge)).toBe('Edge on Windows');

            const linuxFirefox = 'Mozilla/5.0 (X11; Linux x86_64; rv:109.0) Gecko/20100101 Firefox/119.0';
            expect(parseUserAgent(linuxFirefox)).toBe('Firefox on Linux');

            const iPhoneSafari = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_1 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.1 Mobile/15E148 Safari/604.1';
            expect(parseUserAgent(iPhoneSafari)).toBe('Safari on iOS');

            const androidChrome = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Mobile Safari/537.36';
            expect(parseUserAgent(androidChrome)).toBe('Chrome on Android');
        });
    });

    describe('Profile actions & avatar handling', () => {
        it('updates user profile name and validates length', async () => {
            const user = await createTestUser({ name: 'Original Name' });
            await createSession(user.id);

            // Valid update
            const formData = new FormData();
            formData.append('name', 'Updated Name');
            const res = await updateProfileAction({ ok: false }, formData);
            expect(res.ok).toBe(true);

            const [updated] = await db.select().from(users).where(eq(users.id, user.id));
            expect(updated.name).toBe('Updated Name');

            // Name too short (< 2 chars)
            const shortFormData = new FormData();
            shortFormData.append('name', 'A');
            const shortRes = await updateProfileAction({ ok: false }, shortFormData);
            expect(shortRes.ok).toBe(false);
            expect(shortRes.fieldErrors?.name).toBeDefined();

            // Name too long (> 60 chars)
            const longFormData = new FormData();
            longFormData.append('name', 'A'.repeat(61));
            const longRes = await updateProfileAction({ ok: false }, longFormData);
            expect(longRes.ok).toBe(false);
            expect(longRes.fieldErrors?.name).toBeDefined();
        });

        it('saves, serves, and removes user avatar', async () => {
            const user = await createTestUser();
            await createSession(user.id);

            // Save avatar
            const fakeBuffer = Buffer.from('fake-png-content');
            const avatarUrl = await saveAvatar(user.id, 'png', fakeBuffer);
            expect(avatarUrl).toBe(`/api/users/${user.id}/avatar`);

            const fileInfo = await getAvatarFilePath(user.id);
            expect(fileInfo).not.toBeNull();
            expect(fileInfo?.ext).toBe('png');

            // Verify file exists on disk
            const content = await fs.readFile(fileInfo!.filePath);
            expect(content.toString()).toBe('fake-png-content');

            // Remove avatar
            await removeAvatar(user.id);
            const removedInfo = await getAvatarFilePath(user.id);
            expect(removedInfo).toBeNull();

            const [userAfterRemove] = await db.select().from(users).where(eq(users.id, user.id));
            expect(userAfterRemove.avatarUrl).toBeNull();
        });

        it('validates avatar upload file type and size via Server Action', async () => {
            const user = await createTestUser();
            await createSession(user.id);

            // Missing file
            const emptyForm = new FormData();
            const resEmpty = await uploadAvatarAction({ ok: false }, emptyForm);
            expect(resEmpty.ok).toBe(false);

            // Oversized file (> 1 MB)
            const oversizedBytes = new Uint8Array(1024 * 1024 + 10);
            const oversizedFile = new File([oversizedBytes], 'large.png', { type: 'image/png' });
            const oversizedForm = new FormData();
            oversizedForm.append('avatar', oversizedFile);
            const resOversized = await uploadAvatarAction({ ok: false }, oversizedForm);
            expect(resOversized.ok).toBe(false);
            expect(resOversized.formError).toContain('less than 1 MB');

            // Invalid mime type
            const textFile = new File(['hello'], 'test.txt', { type: 'text/plain' });
            const textForm = new FormData();
            textForm.append('avatar', textFile);
            const resText = await uploadAvatarAction({ ok: false }, textForm);
            expect(resText.ok).toBe(false);
            expect(resText.formError).toContain('PNG, JPEG, and WebP');
        });
    });

    describe('Activity counts and ownership', () => {
        it('calculates counts of owned workbooks, data sources, and dashboards', async () => {
            const user = await createTestUser();
            const otherUser = await createTestUser();

            // Create owned items
            await db.insert(workbooks).values({
                name: 'User Workbook',
                ownerId: user.id,
            });
            await db.insert(dataSources).values({
                name: 'User Data Source',
                type: 'sqlite',
                config: '{}',
                ownerId: user.id,
            });

            // Create other user item
            await db.insert(workbooks).values({
                name: 'Other Workbook',
                ownerId: otherUser.id,
            });

            const counts = await getUserActivityCounts(user.id);
            expect(counts.workbooks).toBe(1);
            expect(counts.dataSources).toBe(1);
            expect(counts.dashboards).toBe(0);
        });
    });

    describe('Password change and session rotation', () => {
        it('verifies current password, updates hash, rotates current session and revokes others', async () => {
            const user = await createTestUser();
            await createSession(user.id); // This becomes current
            await createSession(user.id); // Another session
            cookieState.value = (await getSession()) ? cookieState.value : '';

            // Incorrect current password
            const wrongForm = new FormData();
            wrongForm.append('currentPassword', 'wrongpassword');
            wrongForm.append('newPassword', 'NewValidPassword123');
            wrongForm.append('confirmPassword', 'NewValidPassword123');
            const wrongRes = await changePasswordAction({ ok: false }, wrongForm);
            expect(wrongRes.ok).toBe(false);
            expect(wrongRes.fieldErrors?.currentPassword).toBeDefined();

            // Mismatched confirmation
            const mismatchForm = new FormData();
            mismatchForm.append('currentPassword', 'password123');
            mismatchForm.append('newPassword', 'NewValidPassword123');
            mismatchForm.append('confirmPassword', 'DifferentPassword123');
            const mismatchRes = await changePasswordAction({ ok: false }, mismatchForm);
            expect(mismatchRes.ok).toBe(false);
            expect(mismatchRes.fieldErrors?.confirmPassword).toBeDefined();

            // Valid password change
            const validForm = new FormData();
            validForm.append('currentPassword', 'password123');
            validForm.append('newPassword', 'NewValidPassword123');
            validForm.append('confirmPassword', 'NewValidPassword123');
            const validRes = await changePasswordAction({ ok: false }, validForm);
            expect(validRes.ok).toBe(true);

            // Verify password was updated in DB
            const [refreshedUser] = await db.select().from(users).where(eq(users.id, user.id));
            expect(await verifyPassword('NewValidPassword123', refreshedUser.passwordHash)).toBe(true);

            // Verify other sessions were revoked
            const remainingSessions = await listSessions(user.id);
            expect(remainingSessions).toHaveLength(1);
        });
    });

    describe('Sessions management', () => {
        it('revokes a specific session', async () => {
            const user = await createTestUser();
            const current = await createSession(user.id);
            const other = await createSession(user.id);

            expect(await listSessions(user.id)).toHaveLength(2);

            const res = await revokeSessionAction(other.id);
            expect(res.ok).toBe(true);

            const remaining = await listSessions(user.id);
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe(current.id);
        });

        it('revokes all other sessions', async () => {
            const user = await createTestUser();
            await createSession(user.id);
            await createSession(user.id);
            const current = await createSession(user.id);

            expect(await listSessions(user.id)).toHaveLength(3);

            const res = await revokeOtherSessionsAction();
            expect(res.ok).toBe(true);

            const remaining = await listSessions(user.id);
            expect(remaining).toHaveLength(1);
            expect(remaining[0].id).toBe(current.id);
        });
    });

    describe('Delete account & admin protection', () => {
        it('blocks account deletion when user is the only active admin', async () => {
            // Clean up other admins for this test
            await db.delete(users).where(eq(users.role, 'admin'));

            const lastAdmin = await createTestUser({ role: 'admin' });
            await createSession(lastAdmin.id);

            const formData = new FormData();
            formData.append('email', lastAdmin.email);
            formData.append('password', 'password123');

            const res = await deleteAccountAction({ ok: false }, formData);
            expect(res.ok).toBe(false);
            expect(res.formError).toContain('administrator');
        });

        it('deletes account and cascades owned content in transaction', async () => {
            await createTestUser({ role: 'admin' });
            await createTestUser({ role: 'admin' });
            const member = await createTestUser({ role: 'member' });

            await createSession(member.id);

            // Add owned content
            await db.insert(workbooks).values({
                name: 'Member Workbook',
                ownerId: member.id,
            });

            const formData = new FormData();
            formData.append('email', member.email);
            formData.append('password', 'password123');

            const res = await deleteAccountAction({ ok: false }, formData);
            expect(res.ok).toBe(true);

            // User should be deleted
            const [deleted] = await db.select().from(users).where(eq(users.id, member.id));
            expect(deleted).toBeUndefined();

            // Owned workbook should be deleted
            const userWorkbooks = await db.select().from(workbooks).where(eq(workbooks.ownerId, member.id));
            expect(userWorkbooks).toHaveLength(0);
        });
    });

    describe('Admin role protection', () => {
        it('allows admins and redirects non-admins for requireRole', async () => {
            const member = await createTestUser({ role: 'member' });
            const admin = await createTestUser({ role: 'admin' });

            // Member should be redirected
            await createSession(member.id);
            await expect(requireRole('admin', { next: '/settings/users' })).rejects.toThrow('REDIRECT:/?toast=forbidden');

            // Admin should pass
            await createSession(admin.id);
            const user = await requireRole('admin', { next: '/settings/users' });
            expect(user.role).toBe('admin');
        });
    });

    afterAll(async () => {
        const { seedUsers } = await import('../../../scripts/seed/users');
        await seedUsers();
        const { seedSampleWorkbook } = await import('../../../scripts/seed/sample-workbook');
        await seedSampleWorkbook();
    });
});
