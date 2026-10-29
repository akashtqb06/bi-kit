import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { resetUserPasswordAdmin } from '@src/lib/auth/user-service';
import { handleApiError, apiError } from '@src/app/api/utils';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(_req: Request, { params }: RouteParams): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const { id: targetUserId } = await params;
        const result = await resetUserPasswordAdmin(targetUserId, user.id);

        return NextResponse.json({ data: result });
    } catch (err) {
        return handleApiError(err);
    }
}
