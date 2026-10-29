import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import {
    getUserById,
    updateUserRoleAdmin,
    updateUserStatusAdmin,
    deleteUserAccountAdmin,
} from '@src/lib/auth/user-service';
import { handleApiError, apiError } from '@src/app/api/utils';

type RouteParams = { params: Promise<{ id: string }> };

const patchUserSchema = z.object({
    role: z.enum(['admin', 'member']).optional(),
    status: z.enum(['active', 'disabled']).optional(),
});

const deleteUserSchema = z.object({
    confirmEmail: z.string().trim().toLowerCase().min(1, 'Email confirmation required'),
});

export async function PATCH(req: Request, { params }: RouteParams): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const { id: targetUserId } = await params;
        const body: unknown = await req.json();
        const input = patchUserSchema.parse(body);

        let updatedRecord = null;

        if (input.role) {
            updatedRecord = await updateUserRoleAdmin(targetUserId, input.role, user.id);
        }

        if (input.status) {
            updatedRecord = await updateUserStatusAdmin(targetUserId, input.status, user.id);
        }

        return NextResponse.json({ data: updatedRecord });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function DELETE(req: Request, { params }: RouteParams): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const { id: targetUserId } = await params;

        if (targetUserId === user.id) {
            return apiError('You cannot delete your own account from user management.', 400);
        }

        const target = await getUserById(targetUserId);
        if (!target) {
            return apiError('User not found.', 404);
        }

        const body: unknown = await req.json();
        const input = deleteUserSchema.parse(body);

        if (input.confirmEmail.toLowerCase() !== target.email.toLowerCase()) {
            return apiError('Confirmation email does not match user email.', 400);
        }

        await deleteUserAccountAdmin(targetUserId, user.id);
        return NextResponse.json({ data: { ok: true, deletedUserId: targetUserId } });
    } catch (err) {
        return handleApiError(err);
    }
}

