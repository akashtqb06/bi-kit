import { NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { ensureSampleDataSource } from '@src/lib/data-sources/sample';

import { getCurrentUser } from '@src/lib/auth/dal';

export async function POST(): Promise<NextResponse> {
    try {
        const user = await getCurrentUser();
        const data = await ensureSampleDataSource(user ? { id: user.id, role: user.role } : undefined);
        return NextResponse.json({ data });
    } catch (error) {
        return handleApiError(error);
    }
}
