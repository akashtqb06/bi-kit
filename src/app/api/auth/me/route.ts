import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';

export async function GET() {
    try {
        const user = await requireUserApi();
        return NextResponse.json(user);
    } catch (err) {
        return handleApiError(err);
    }
}
