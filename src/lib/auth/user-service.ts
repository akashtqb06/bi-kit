import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { and, count, desc, eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
    dashboards,
    dataSources,
    sessions,
    users,
    workbooks,
    type User,
} from '@src/lib/db/schema';
import { getAvatarsDir } from '@src/lib/db/paths';
import { hashPassword } from './password';
import { destroyAllSessions } from './session';
import { logAuditEvent } from '@src/lib/audit/audit-log';
import type { SafeUser } from './types';

export async function getUserById(id: string): Promise<User | null> {
    const [user] = await db.select().from(users).where(eq(users.id, id)).limit(1);
    return user ?? null;
}

export async function countActiveAdmins(): Promise<number> {
    const [result] = await db
        .select({ count: count() })
        .from(users)
        .where(and(eq(users.role, 'admin'), eq(users.status, 'active')));
    return result?.count ?? 0;
}

export async function updateUserProfile(
    userId: string,
    updates: { name?: string; avatarUrl?: string | null }
): Promise<SafeUser> {
    const updateData: Partial<typeof users.$inferInsert> = {
        updatedAt: new Date(),
    };
    if (updates.name !== undefined) updateData.name = updates.name;
    if (updates.avatarUrl !== undefined) updateData.avatarUrl = updates.avatarUrl;

    const [updated] = await db
        .update(users)
        .set(updateData)
        .where(eq(users.id, userId))
        .returning();

    if (!updated) {
        throw new Error('User not found');
    }

    return {
        id: updated.id,
        email: updated.email,
        name: updated.name,
        role: updated.role,
        avatarUrl: updated.avatarUrl,
        createdAt: updated.createdAt,
        lastLoginAt: updated.lastLoginAt,
    };
}

export async function updateUserPassword(userId: string, newPasswordHash: string): Promise<void> {
    await db
        .update(users)
        .set({
            passwordHash: newPasswordHash,
            mustChangePassword: false,
            updatedAt: new Date(),
        })
        .where(eq(users.id, userId));
}

export async function getUserActivityCounts(userId: string): Promise<{
    workbooks: number;
    dataSources: number;
    dashboards: number;
}> {
    const [wbResult] = await db
        .select({ count: count() })
        .from(workbooks)
        .where(eq(workbooks.ownerId, userId));
    const [dsResult] = await db
        .select({ count: count() })
        .from(dataSources)
        .where(eq(dataSources.ownerId, userId));
    const [dashResult] = await db
        .select({ count: count() })
        .from(dashboards)
        .where(eq(dashboards.ownerId, userId));

    return {
        workbooks: wbResult?.count ?? 0,
        dataSources: dsResult?.count ?? 0,
        dashboards: dashResult?.count ?? 0,
    };
}

export async function getAvatarFilePath(userId: string): Promise<{ filePath: string; ext: string } | null> {
    const avatarsDir = getAvatarsDir();
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp'];

    try {
        await fs.access(avatarsDir);
    } catch {
        return null;
    }

    for (const ext of allowedExts) {
        const filePath = path.join(avatarsDir, `${userId}.${ext}`);
        try {
            await fs.access(filePath);
            return { filePath, ext };
        } catch {
            // continue checking
        }
    }

    return null;
}

export async function removeAvatar(userId: string): Promise<void> {
    const avatarsDir = getAvatarsDir();
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp'];

    for (const ext of allowedExts) {
        const filePath = path.join(avatarsDir, `${userId}.${ext}`);
        try {
            await fs.unlink(filePath);
        } catch {
            // ignore missing files
        }
    }

    await updateUserProfile(userId, { avatarUrl: null });
}

export async function saveAvatar(
    userId: string,
    ext: string,
    buffer: Buffer | Uint8Array
): Promise<string> {
    const avatarsDir = getAvatarsDir();
    await fs.mkdir(avatarsDir, { recursive: true });

    // Clean up any existing avatar files for this user with other extensions
    const allowedExts = ['png', 'jpg', 'jpeg', 'webp'];
    for (const otherExt of allowedExts) {
        if (otherExt !== ext) {
            try {
                await fs.unlink(path.join(avatarsDir, `${userId}.${otherExt}`));
            } catch {
                // ignore
            }
        }
    }

    const normalizedExt = ext === 'jpeg' ? 'jpg' : ext;
    const targetFile = path.join(avatarsDir, `${userId}.${normalizedExt}`);
    await fs.writeFile(targetFile, buffer);

    const avatarUrl = `/api/users/${userId}/avatar`;
    await updateUserProfile(userId, { avatarUrl });
    return avatarUrl;
}

export async function deleteUserAccount(userId: string): Promise<void> {
    const user = await getUserById(userId);
    if (!user) {
        throw new Error('User not found');
    }

    if (user.role === 'admin') {
        const adminCount = await countActiveAdmins();
        if (adminCount <= 1) {
            throw new Error('Cannot delete the only remaining active administrator account.');
        }
    }

    // In a transaction, delete user content & account
    await db.transaction(async (tx) => {
        await tx.delete(dashboards).where(eq(dashboards.ownerId, userId));
        await tx.delete(workbooks).where(eq(workbooks.ownerId, userId));
        await tx.delete(dataSources).where(eq(dataSources.ownerId, userId));
        await tx.delete(sessions).where(eq(sessions.userId, userId));
        await tx.delete(users).where(eq(users.id, userId));
    });

    // Remove avatar file from disk if present
    await removeAvatar(userId).catch(() => {});
}

export type UserAdminRecord = {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | null;
    mustChangePassword: boolean;
};

export function generateTemporaryPassword(): string {
    return `Tmp_${randomBytes(6).toString('base64url')}!`;
}

export async function listUsersAdmin(): Promise<UserAdminRecord[]> {
    return db
        .select({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
            avatarUrl: users.avatarUrl,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            lastLoginAt: users.lastLoginAt,
            mustChangePassword: users.mustChangePassword,
        })
        .from(users)
        .orderBy(desc(users.createdAt));
}

export async function createUserAdmin(
    input: {
        name: string;
        email: string;
        role: 'admin' | 'member';
        mustChangePassword?: boolean;
    },
    adminUserId: string
): Promise<{ user: UserAdminRecord; temporaryPassword: string }> {
    const temporaryPassword = generateTemporaryPassword();
    const passwordHash = await hashPassword(temporaryPassword);

    const [user] = await db
        .insert(users)
        .values({
            name: input.name,
            email: input.email,
            passwordHash,
            role: input.role,
            status: 'active',
            mustChangePassword: input.mustChangePassword ?? true,
        })
        .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
            avatarUrl: users.avatarUrl,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            lastLoginAt: users.lastLoginAt,
            mustChangePassword: users.mustChangePassword,
        });

    await logAuditEvent({
        userId: adminUserId,
        action: 'user.create',
        details: { targetUserId: user.id, targetEmail: user.email, role: user.role },
    });

    return { user, temporaryPassword };
}

export async function updateUserRoleAdmin(
    targetUserId: string,
    newRole: 'admin' | 'member',
    adminUserId: string
): Promise<UserAdminRecord> {
    const target = await getUserById(targetUserId);
    if (!target) {
        throw new Error('User not found');
    }

    if (target.role === 'admin' && newRole === 'member') {
        const adminCount = await countActiveAdmins();
        if (adminCount <= 1) {
            throw new Error('Cannot demote the only remaining active administrator.');
        }
    }

    const [updated] = await db
        .update(users)
        .set({ role: newRole, updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
        .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
            avatarUrl: users.avatarUrl,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            lastLoginAt: users.lastLoginAt,
            mustChangePassword: users.mustChangePassword,
        });

    await logAuditEvent({
        userId: adminUserId,
        action: 'user.update_role',
        details: { targetUserId, previousRole: target.role, newRole },
    });

    return updated;
}

export async function updateUserStatusAdmin(
    targetUserId: string,
    newStatus: 'active' | 'disabled',
    adminUserId: string
): Promise<UserAdminRecord> {
    const target = await getUserById(targetUserId);
    if (!target) {
        throw new Error('User not found');
    }

    if (target.role === 'admin' && newStatus === 'disabled') {
        const adminCount = await countActiveAdmins();
        if (adminCount <= 1) {
            throw new Error('Cannot disable the only remaining active administrator.');
        }
    }

    const [updated] = await db
        .update(users)
        .set({ status: newStatus, updatedAt: new Date() })
        .where(eq(users.id, targetUserId))
        .returning({
            id: users.id,
            email: users.email,
            name: users.name,
            role: users.role,
            status: users.status,
            avatarUrl: users.avatarUrl,
            createdAt: users.createdAt,
            updatedAt: users.updatedAt,
            lastLoginAt: users.lastLoginAt,
            mustChangePassword: users.mustChangePassword,
        });

    if (newStatus === 'disabled') {
        await destroyAllSessions(targetUserId);
    }

    await logAuditEvent({
        userId: adminUserId,
        action: newStatus === 'disabled' ? 'user.disable' : 'user.enable',
        details: { targetUserId, status: newStatus },
    });

    return updated;
}

export async function resetUserPasswordAdmin(
    targetUserId: string,
    adminUserId: string
): Promise<{ temporaryPassword: string }> {
    const target = await getUserById(targetUserId);
    if (!target) {
        throw new Error('User not found');
    }

    const temporaryPassword = generateTemporaryPassword();
    const newPasswordHash = await hashPassword(temporaryPassword);

    await db
        .update(users)
        .set({
            passwordHash: newPasswordHash,
            mustChangePassword: true,
            updatedAt: new Date(),
        })
        .where(eq(users.id, targetUserId));

    await destroyAllSessions(targetUserId);

    await logAuditEvent({
        userId: adminUserId,
        action: 'user.reset_password',
        details: { targetUserId, targetEmail: target.email },
    });

    return { temporaryPassword };
}

export async function revokeUserSessionsAdmin(
    targetUserId: string,
    adminUserId: string
): Promise<void> {
    const target = await getUserById(targetUserId);
    if (!target) {
        throw new Error('User not found');
    }

    await destroyAllSessions(targetUserId);

    await logAuditEvent({
        userId: adminUserId,
        action: 'user.revoke_sessions',
        details: { targetUserId, targetEmail: target.email },
    });
}

export async function deleteUserAccountAdmin(
    targetUserId: string,
    currentUserId: string
): Promise<void> {
    if (targetUserId === currentUserId) {
        throw new Error('You cannot delete your own account from user management.');
    }

    const target = await getUserById(targetUserId);
    if (!target) {
        throw new Error('User not found');
    }

    if (target.role === 'admin') {
        const adminCount = await countActiveAdmins();
        if (adminCount <= 1) {
            throw new Error('Cannot delete the only remaining active administrator account.');
        }
    }

    await db.transaction(async (tx) => {
        await tx.delete(dashboards).where(eq(dashboards.ownerId, targetUserId));
        await tx.delete(workbooks).where(eq(workbooks.ownerId, targetUserId));
        await tx.delete(dataSources).where(eq(dataSources.ownerId, targetUserId));
        await tx.delete(sessions).where(eq(sessions.userId, targetUserId));
        await tx.delete(users).where(eq(users.id, targetUserId));
    });

    await removeAvatar(targetUserId).catch(() => {});

    await logAuditEvent({
        userId: currentUserId,
        action: 'user.delete',
        details: { deletedUserId: targetUserId, deletedEmail: target.email, role: target.role },
    });
}
