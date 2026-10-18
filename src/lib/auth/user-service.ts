import 'server-only';
import fs from 'node:fs/promises';
import path from 'node:path';
import { and, count, eq } from 'drizzle-orm';
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
    db.transaction((tx) => {
        tx.delete(dashboards).where(eq(dashboards.ownerId, userId)).run();
        tx.delete(workbooks).where(eq(workbooks.ownerId, userId)).run();
        tx.delete(dataSources).where(eq(dataSources.ownerId, userId)).run();
        tx.delete(sessions).where(eq(sessions.userId, userId)).run();
        tx.delete(users).where(eq(users.id, userId)).run();
    });

    // Remove avatar file from disk if present
    await removeAvatar(userId).catch(() => {});
}
