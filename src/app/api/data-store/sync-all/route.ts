import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { resyncAll } from '@src/lib/data-store/service';

export async function POST(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        await resyncAll(user.id);
        return NextResponse.json({ success: true, message: 'Re-sync initiated for all Data Store tables' });
    } catch (err) {
        return handleApiError(err);
    }
}

