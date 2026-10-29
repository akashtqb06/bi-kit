import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import { normalizedEmailSchema } from '@src/lib/auth/schemas';
import {
    listUsersAdmin,
    createUserAdmin,
} from '@src/lib/auth/user-service';
import { handleApiError, apiError } from '@src/app/api/utils';

const createUserSchema = z.object({
    name: z.string().trim().min(1, 'Name is required').max(100),
    email: normalizedEmailSchema,
    role: z.enum(['admin', 'member']).default('member'),
    mustChangePassword: z.boolean().default(true),
});

export async function GET(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }
        const usersList = await listUsersAdmin();
        return NextResponse.json({ data: usersList });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const body: unknown = await req.json();
        const input = createUserSchema.parse(body);

        const result = await createUserAdmin(input, user.id);
        return NextResponse.json({ data: result }, { status: 201 });
    } catch (err) {
        return handleApiError(err);
    }
}
