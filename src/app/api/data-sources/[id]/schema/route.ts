import { NextResponse } from 'next/server';
import { getDataSource, getCachedSchemaWithMeta, setCachedSchema } from '@src/lib/data-sources/service';
import { getConnector } from '@src/lib/connectors/manager';
import { handleApiError } from '@src/app/api/utils';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(
    req: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await params;
        const source = await getDataSource(id);
        assertCan(user, 'view', { type: 'data_source', id, ownerId: source.ownerId });

        const url = new URL(req.url);
        const refresh = url.searchParams.get('refresh') === '1' || url.searchParams.get('refresh') === 'true';
        const sampleSizeParam = url.searchParams.get('sampleSize');
        const sampleSize = sampleSizeParam ? parseInt(sampleSizeParam, 10) : undefined;

        if (refresh) {
            assertCan(user, 'edit', { type: 'data_source', id, ownerId: source.ownerId });
        }

        // 1. Check cached schema if refresh is not requested
        if (!refresh) {
            const cached = await getCachedSchemaWithMeta(id);
            if (cached) {
                return NextResponse.json({
                    data: {
                        ...cached.snapshot,
                        fetchedAt: cached.fetchedAt.toISOString(),
                    },
                    meta: {
                        fetchedAt: cached.fetchedAt.toISOString(),
                    },
                });
            }
        }

        // 2. Introspect via connector
        const connector = await getConnector(source);
        const snapshot = await connector.introspect({ sampleSize });
        await setCachedSchema(id, snapshot);

        const fetchedAt = new Date().toISOString();
        return NextResponse.json({
            data: {
                ...snapshot,
                fetchedAt,
            },
            meta: {
                fetchedAt,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}
