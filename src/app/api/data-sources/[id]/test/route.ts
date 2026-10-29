import { NextResponse } from 'next/server';
import { getDataSource, updateDataSourceStatus } from '@src/lib/data-sources/service';
import { getConnector } from '@src/lib/connectors/manager';
import { handleApiError, apiError } from '@src/app/api/utils';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';

const testRateLimits = new Map<string, { count: number; resetAt: number }>();

function checkRateLimit(key: string, maxRequests = 10, windowMs = 60_000): boolean {
    const now = Date.now();
    const current = testRateLimits.get(key);
    if (!current || now > current.resetAt) {
        testRateLimits.set(key, { count: 1, resetAt: now + windowMs });
        return true;
    }
    if (current.count >= maxRequests) {
        return false;
    }
    current.count++;
    return true;
}

type RouteParams = { params: Promise<{ id: string }> };

export async function POST(
    _req: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();

        // Rate limit: 10 tests/min per user
        const rateLimitKey = `ds-test:${user.id}`;
        if (!checkRateLimit(rateLimitKey, 10, 60_000)) {
            return apiError('Too many connection test requests. Please wait before trying again (rate limit: 10/min).', 429);
        }

        const { id } = await params;
        const source = await getDataSource(id);
        assertCan(user, 'edit', { type: 'data_source', id, ownerId: source.ownerId });

        const connector = await getConnector(source);
        try {
            const testResult = await connector.test();
            const snapshot = testResult.ok ? await connector.introspect().catch(() => null) : null;
            const tableCount = snapshot?.tables?.length ?? 0;

            await updateDataSourceStatus(id, {
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
            await updateDataSourceStatus(id, {
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
