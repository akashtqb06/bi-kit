import { NextResponse } from 'next/server';
import { createDataSourceSchema, bulkDeleteDataSourcesSchema } from '@src/lib/schemas';
import {
    listDataSources,
    createDataSource,
    bulkDeleteDataSources,
} from '@src/lib/data-sources/service';
import { handleApiError } from '@src/app/api/utils';
import { requireUserApi } from '@src/lib/auth/dal';

export async function GET(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const data = listDataSources({ id: user.id, role: user.role });
        return NextResponse.json({ data });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const body: unknown = await req.json();
        const input = createDataSourceSchema.parse(body);
        const data = createDataSource(input, user.id);
        return NextResponse.json({ data }, { status: 201 });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function DELETE(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const body: unknown = await req.json();
        const { ids } = bulkDeleteDataSourcesSchema.parse(body);
        const data = bulkDeleteDataSources(ids, { id: user.id, role: user.role });
        return NextResponse.json({ data });
    } catch (err) {
        return handleApiError(err);
    }
}

