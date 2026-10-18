import { NextResponse } from 'next/server';
import { handleApiError } from '@src/app/api/utils';
import { ensureSampleDataSource } from '@src/lib/data-sources/sample';
import { requireUserApi } from '@src/lib/auth/dal';

export async function POST(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const data = await ensureSampleDataSource({ id: user.id, role: user.role });
        return NextResponse.json({ data });
    } catch (error) {
        return handleApiError(error);
    }
}

