import { NextResponse } from 'next/server';
import { createDataSourceSchema, bulkDeleteDataSourcesSchema } from '@src/lib/schemas';
import {
    listDataSources,
    createDataSource,
    bulkDeleteDataSources,
} from '@src/lib/data-sources/service';
import { handleApiError } from '@src/app/api/utils';
import { getCurrentUser } from '@src/lib/auth/dal';

export async function GET(): Promise<NextResponse> {
    try {
        const user = await getCurrentUser();
        const data = listDataSources(user ? { id: user.id, role: user.role } : undefined);
        return NextResponse.json({ data });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const body: unknown = await req.json();
        const input = createDataSourceSchema.parse(body);
        const user = await getCurrentUser();
        const data = createDataSource(input, user?.id);
        return NextResponse.json({ data }, { status: 201 });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function DELETE(req: Request): Promise<NextResponse> {
    try {
        const body: unknown = await req.json();
        const { ids } = bulkDeleteDataSourcesSchema.parse(body);
        const data = bulkDeleteDataSources(ids);
        return NextResponse.json({ data });
    } catch (err) {
        return handleApiError(err);
    }
}
