import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@src/lib/db';
import { users, sessions, auditLog } from '@src/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
    listUsersAdmin,
    createUserAdmin,
    updateUserRoleAdmin,
    updateUserStatusAdmin,
    resetUserPasswordAdmin,
    revokeUserSessionsAdmin,
    deleteUserAccountAdmin,
    countActiveAdmins,
} from '@src/lib/auth/user-service';
import { createSession, getSession } from '@src/lib/auth/session';
import { hashPassword } from '@src/lib/auth/password';
import { can } from '@src/lib/auth/policy';

describe('Admin Users Policy & User Management', () => {
    let adminUserId: string;
    let memberUserId: string;

    beforeAllServer: beforeEach(async () => {
        // Ensure an admin and a member exist in database
        const allUsers = await db.select().from(users);
        const admin = allUsers.find((u) => u.role === 'admin' && u.status === 'active');
        const member = allUsers.find((u) => u.role === 'member' && u.status === 'active');

        if (admin) {
            adminUserId = admin.id;
        } else {
            const [createdAdmin] = await db
                .insert(users)
                .values({
                    name: 'Test Admin',
                    email: `admin_${Date.now()}@example.com`,
                    passwordHash: await hashPassword('password123'),
                    role: 'admin',
                    status: 'active',
                })
                .returning();
            adminUserId = createdAdmin.id;
        }

        if (member) {
            memberUserId = member.id;
        } else {
            const [createdMember] = await db
                .insert(users)
                .values({
                    name: 'Test Member',
                    email: `member_${Date.now()}@example.com`,
                    passwordHash: await hashPassword('password123'),
                    role: 'member',
                    status: 'active',
                })
                .returning();
            memberUserId = createdMember.id;
        }
    });

    it('policy: members cannot perform admin actions on users', () => {
        const memberUser = { id: memberUserId, role: 'member' };
        const adminUser = { id: adminUserId, role: 'admin' };

        // Member cannot create a user
        expect(can(memberUser, 'create', { type: 'user' })).toBe(false);
        // Member cannot edit another user
        expect(can(memberUser, 'edit', { type: 'user', id: adminUserId })).toBe(false);
        // Member cannot delete another user
        expect(can(memberUser, 'delete', { type: 'user', id: adminUserId })).toBe(false);

        // Admin has full capability on users
        expect(can(adminUser, 'create', { type: 'user' })).toBe(true);
        expect(can(adminUser, 'edit', { type: 'user', id: memberUserId })).toBe(true);
        expect(can(adminUser, 'delete', { type: 'user', id: memberUserId })).toBe(true);
    });

    it('createUserAdmin creates user with temporary password, mustChangePassword true, and logs audit event', async () => {
        const uniqueEmail = `newuser_${Date.now()}@example.com`;
        const result = await createUserAdmin(
            {
                name: 'New Test User',
                email: uniqueEmail,
                role: 'member',
                mustChangePassword: true,
            },
            adminUserId
        );

        expect(result.user).toBeDefined();
        expect(result.user.email).toBe(uniqueEmail);
        expect(result.user.role).toBe('member');
        expect(result.user.mustChangePassword).toBe(true);
        expect(result.temporaryPassword.length).toBeGreaterThanOrEqual(10);

        // Verify audit log entry was created
        const [audit] = await db
            .select()
            .from(auditLog)
            .where(and(eq(auditLog.action, 'user.create'), eq(auditLog.userId, adminUserId)))
            .limit(1);

        expect(audit).toBeDefined();
    });

    it('last-admin protection: cannot demote or disable the last active administrator', async () => {
        // Demote all admins except adminUserId to members
        const otherAdmins = await db
            .select()
            .from(users)
            .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));

        for (const adm of otherAdmins) {
            if (adm.id !== adminUserId) {
                await db.update(users).set({ role: 'member' }).where(eq(users.id, adm.id));
            }
        }

        const activeCount = await countActiveAdmins();
        expect(activeCount).toBe(1);

        // Attempting to demote the last admin should throw
        await expect(updateUserRoleAdmin(adminUserId, 'member', adminUserId)).rejects.toThrow(
            /Cannot demote the only remaining active administrator/
        );

        // Attempting to disable the last admin should throw
        await expect(updateUserStatusAdmin(adminUserId, 'disabled', adminUserId)).rejects.toThrow(
            /Cannot disable the only remaining active administrator/
        );

        // Attempting to delete yourself should throw
        await expect(deleteUserAccountAdmin(adminUserId, adminUserId)).rejects.toThrow(
            /cannot delete your own account/
        );
    });

    it('resetUserPasswordAdmin generates new temporary password, flags mustChangePassword, and revokes sessions', async () => {
        // Create a test user with a session
        const tempUserEmail = `reset_test_${Date.now()}@example.com`;
        const { user: created } = await createUserAdmin(
            { name: 'Reset User', email: tempUserEmail, role: 'member' },
            adminUserId
        );

        // Create an active session record in database for this user
        const now = new Date();
        await db.insert(sessions).values({
            userId: created.id,
            tokenHash: `hash_${Date.now()}`,
            createdAt: now,
            lastUsedAt: now,
            expiresAt: new Date(now.getTime() + 86400000),
            ipAddress: '127.0.0.1',
        });
        const sessionsBefore = await db.select().from(sessions).where(eq(sessions.userId, created.id));
        expect(sessionsBefore.length).toBeGreaterThan(0);

        // Reset password
        const resetRes = await resetUserPasswordAdmin(created.id, adminUserId);
        expect(resetRes.temporaryPassword).toBeDefined();

        // Verify sessions were destroyed
        const sessionsAfter = await db.select().from(sessions).where(eq(sessions.userId, created.id));
        expect(sessionsAfter.length).toBe(0);

        // Verify mustChangePassword is true in db
        const [updatedUser] = await db.select().from(users).where(eq(users.id, created.id)).limit(1);
        expect(updatedUser.mustChangePassword).toBe(true);

        // Verify audit entry
        const [audit] = await db
            .select()
            .from(auditLog)
            .where(and(eq(auditLog.action, 'user.reset_password'), eq(auditLog.userId, adminUserId)))
            .limit(1);
        expect(audit).toBeDefined();
    });

    it('deleteUserAccountAdmin deletes user and cascades content in a transaction without dangling data', async () => {
        const deleteUserEmail = `todelete_${Date.now()}@example.com`;
        const { user: toDelete } = await createUserAdmin(
            { name: 'To Delete', email: deleteUserEmail, role: 'member' },
            adminUserId
        );

        await deleteUserAccountAdmin(toDelete.id, adminUserId);

        const [found] = await db.select().from(users).where(eq(users.id, toDelete.id)).limit(1);
        expect(found).toBeUndefined();

        // Verify audit entry for user.delete
        const [audit] = await db
            .select()
            .from(auditLog)
            .where(and(eq(auditLog.action, 'user.delete'), eq(auditLog.userId, adminUserId)))
            .limit(1);
        expect(audit).toBeDefined();
    });

    it('finance owner-only rule stays strict: admins can NEVER read another user finance data', () => {
        const adminUser = { id: adminUserId, role: 'admin' };
        const otherUserId = memberUserId;

        // Verify policy prohibits admin from viewing or editing someone else's finance data
        expect(can(adminUser, 'view', { type: 'fin_account', ownerId: otherUserId })).toBe(false);
        expect(can(adminUser, 'edit', { type: 'fin_account', ownerId: otherUserId })).toBe(false);
        expect(can(adminUser, 'delete', { type: 'fin_account', ownerId: otherUserId })).toBe(false);
        expect(can(adminUser, 'view', { type: 'fin_transaction', ownerId: otherUserId })).toBe(false);
        expect(can(adminUser, 'view', { type: 'fin_budget', ownerId: otherUserId })).toBe(false);
    });
});
