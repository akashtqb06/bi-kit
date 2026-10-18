'use server';

import { headers } from 'next/headers';
import { revalidatePath } from 'next/cache';
import { requireUser } from './dal';
import { hashPassword, verifyPassword } from './password';
import { checkPasswordRateLimit, recordPasswordAttempt } from './rate-limit';
import {
    changePasswordSchema,
    deleteAccountSchema,
    updateProfileSchema,
} from './schemas';
import {
    destroyAllSessions,
    destroySession,
    getSession,
    revokeSession,
    rotateCurrentSession,
} from './session';
import {
    countActiveAdmins,
    deleteUserAccount,
    getUserById,
    removeAvatar,
    saveAvatar,
    updateUserPassword,
    updateUserProfile,
} from './user-service';
import type { SettingsActionResult } from './types';

async function getClientIp(): Promise<string> {
    const requestHeaders = await headers();
    const forwardedFor = requestHeaders.get('x-forwarded-for')?.split(',')[0]?.trim();
    return forwardedFor || requestHeaders.get('x-real-ip') || 'unknown';
}

function fieldErrorsFromZod(error: { issues: { path: PropertyKey[]; message: string }[] }): SettingsActionResult {
    const errors: Record<string, string> = {};
    for (const issue of error.issues) {
        const field = String(issue.path[0] ?? '');
        if (field && !errors[field]) {
            errors[field] = issue.message;
        }
    }
    return { ok: false, fieldErrors: errors };
}

export async function updateProfileAction(
    _prevState: SettingsActionResult,
    formData: FormData
): Promise<SettingsActionResult> {
    const user = await requireUser('/settings/profile');
    const name = String(formData.get('name') ?? '');

    const parsed = updateProfileSchema.safeParse({ name });
    if (!parsed.success) {
        return fieldErrorsFromZod(parsed.error);
    }

    try {
        await updateUserProfile(user.id, { name: parsed.data.name });
        revalidatePath('/settings/profile');
        revalidatePath('/', 'layout');
        return { ok: true };
    } catch {
        return { ok: false, formError: 'Failed to update profile' };
    }
}

export async function uploadAvatarAction(
    _prevState: SettingsActionResult,
    formData: FormData
): Promise<SettingsActionResult> {
    const user = await requireUser('/settings/profile');
    const isRemove = formData.get('remove') === 'true';

    if (isRemove) {
        try {
            await removeAvatar(user.id);
            revalidatePath('/settings/profile');
            revalidatePath('/', 'layout');
            return { ok: true };
        } catch {
            return { ok: false, formError: 'Failed to remove avatar' };
        }
    }

    const file = formData.get('avatar');
    if (!file || !(file instanceof File) || file.size === 0) {
        return { ok: false, formError: 'Please select an image file to upload' };
    }

    const MAX_SIZE = 1024 * 1024; // 1 MB
    if (file.size > MAX_SIZE) {
        return { ok: false, formError: 'Avatar image must be less than 1 MB' };
    }

    const allowedMimeTypes: Record<string, string> = {
        'image/png': 'png',
        'image/jpeg': 'jpg',
        'image/webp': 'webp',
    };

    const ext = allowedMimeTypes[file.type];
    if (!ext) {
        return { ok: false, formError: 'Only PNG, JPEG, and WebP images are supported' };
    }

    try {
        const arrayBuffer = await file.arrayBuffer();
        await saveAvatar(user.id, ext, Buffer.from(arrayBuffer));
        revalidatePath('/settings/profile');
        revalidatePath('/', 'layout');
        return { ok: true };
    } catch {
        return { ok: false, formError: 'Failed to upload avatar' };
    }
}

export async function changePasswordAction(
    _prevState: SettingsActionResult,
    formData: FormData
): Promise<SettingsActionResult> {
    const user = await requireUser('/settings/security');
    const ip = await getClientIp();

    const rateLimit = await checkPasswordRateLimit(user.id, ip);
    if (!rateLimit.allowed) {
        return { ok: false, formError: rateLimit.message ?? 'Too many password change attempts. Try again later.' };
    }

    const currentPassword = String(formData.get('currentPassword') ?? '');
    const newPassword = String(formData.get('newPassword') ?? '');
    const confirmPassword = String(formData.get('confirmPassword') ?? '');

    const parsed = changePasswordSchema.safeParse({
        currentPassword,
        newPassword,
        confirmPassword,
    });

    if (!parsed.success) {
        return fieldErrorsFromZod(parsed.error);
    }

    if (parsed.data.newPassword.toLowerCase() === user.email.toLowerCase()) {
        return {
            ok: false,
            fieldErrors: { newPassword: 'Password must not match your email address' },
        };
    }

    const fullUser = await getUserById(user.id);
    if (!fullUser) {
        return { ok: false, formError: 'User not found' };
    }

    const passwordMatches = await verifyPassword(parsed.data.currentPassword, fullUser.passwordHash);
    if (!passwordMatches) {
        await recordPasswordAttempt(user.id, ip, false);
        return {
            ok: false,
            fieldErrors: { currentPassword: 'Incorrect current password' },
        };
    }

    await recordPasswordAttempt(user.id, ip, true);
    const newHash = await hashPassword(parsed.data.newPassword);
    await updateUserPassword(user.id, newHash);

    // Keep current session (rotate it) and destroy all other sessions
    const sessionCtx = await getSession();
    if (sessionCtx?.session.id) {
        await rotateCurrentSession(sessionCtx.session.id);
        await destroyAllSessions(user.id, sessionCtx.session.id);
    }

    revalidatePath('/settings/security');
    revalidatePath('/settings/sessions');
    return { ok: true };
}

export async function revokeSessionAction(sessionId: string): Promise<SettingsActionResult> {
    const user = await requireUser('/settings/sessions');
    if (!sessionId || typeof sessionId !== 'string') {
        return { ok: false, formError: 'Invalid session ID' };
    }

    try {
        await revokeSession(user.id, sessionId);
        revalidatePath('/settings/sessions');
        return { ok: true };
    } catch {
        return { ok: false, formError: 'Failed to revoke session' };
    }
}

export async function revokeOtherSessionsAction(): Promise<SettingsActionResult> {
    const user = await requireUser('/settings/sessions');
    const sessionCtx = await getSession();
    if (!sessionCtx) {
        return { ok: false, formError: 'Current session not found' };
    }

    try {
        await destroyAllSessions(user.id, sessionCtx.session.id);
        revalidatePath('/settings/sessions');
        return { ok: true };
    } catch {
        return { ok: false, formError: 'Failed to revoke other sessions' };
    }
}

export async function deleteAccountAction(
    _prevState: SettingsActionResult,
    formData: FormData
): Promise<SettingsActionResult> {
    const user = await requireUser('/settings/security');
    const email = String(formData.get('email') ?? '');
    const password = String(formData.get('password') ?? '');

    const parsed = deleteAccountSchema.safeParse({ email, password });
    if (!parsed.success) {
        return fieldErrorsFromZod(parsed.error);
    }

    if (parsed.data.email.toLowerCase() !== user.email.toLowerCase()) {
        return {
            ok: false,
            fieldErrors: { email: 'Email address does not match your account' },
        };
    }

    if (user.role === 'admin') {
        const adminCount = await countActiveAdmins();
        if (adminCount <= 1) {
            return {
                ok: false,
                formError: 'Cannot delete the only remaining active administrator account. Transfer admin role first.',
            };
        }
    }

    const fullUser = await getUserById(user.id);
    if (!fullUser) {
        return { ok: false, formError: 'User not found' };
    }

    const passwordMatches = await verifyPassword(parsed.data.password, fullUser.passwordHash);
    if (!passwordMatches) {
        return {
            ok: false,
            fieldErrors: { password: 'Incorrect password' },
        };
    }

    try {
        await deleteUserAccount(user.id);
        await destroySession();
        return { ok: true };
    } catch (err: unknown) {
        const message = err instanceof Error ? err.message : 'Failed to delete account';
        return { ok: false, formError: message };
    }
}
