import { NextResponse } from 'next/server';
import { getDataSource, updateDataSourceStatus } from '@src/lib/data-sources/service';
import { getConnector } from '@src/lib/connectors/manager';
import { handleApiError } from '@src/app/api/utils';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
    _req: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await params;
        const source = getDataSource(id);
        assertCan(user, 'edit', { type: 'data_source', id, ownerId: source.ownerId });

        const connector = await getConnector(source);
        try {
            const testResult = await connector.test();
            const snapshot = testResult.ok ? await connector.introspect().catch(() => null) : null;
            const tableCount = snapshot?.tables?.length ?? 0;

            updateDataSourceStatus(id, {
                status: testResult.ok ? 'ok' : 'error',
                lastTestedAt: new Date(),
                serverVersion: testResult.serverVersion,
                lastError: testResult.ok ? null : testResult.message,
            });
            return NextResponse.json({
                data: {
                    ok: testResult.ok,
                    latencyMs: testResult.latencyMs,
                    serverVersion: testResult.serverVersion,
                    message: testResult.message,
                    warnings: testResult.warnings,
                    tableCount,
                },
            });
        } catch (testErr) {
            const errMsg = testErr instanceof Error ? testErr.message : 'Connection test failed';
            updateDataSourceStatus(id, {
                status: 'error',
                lastTestedAt: new Date(),
                lastError: errMsg,
            });
            throw testErr;
        }
    } catch (err) {
        return handleApiError(err);
    }
}
