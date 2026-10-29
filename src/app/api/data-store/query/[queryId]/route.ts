import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import {
    materializeQuery,
    dropMaterializedQuery,
    getMaterializedQueryInfo,
} from '@src/lib/data-store/service';

interface RouteContext {
    params: Promise<{ queryId: string }>;
}

export async function GET(
    _req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        await requireUserApi();
        const { queryId } = await context.params;
        const info = await getMaterializedQueryInfo(queryId);
        return NextResponse.json({ data: info });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function POST(
    _req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { queryId } = await context.params;
        const result = await materializeQuery(user.id, queryId);
        return NextResponse.json({ data: result });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function DELETE(
    _req: Request,
    context: RouteContext
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { queryId } = await context.params;
        await dropMaterializedQuery(user.id, queryId);
        return NextResponse.json({ success: true });
    } catch (err) {
        return handleApiError(err);
    }
}

