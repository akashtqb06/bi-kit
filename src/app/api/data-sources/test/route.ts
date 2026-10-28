import { NextResponse } from 'next/server';
import { z } from 'zod';
import { handleApiError, apiError } from '@src/app/api/utils';
import { requireUserApi } from '@src/lib/auth/dal';
import { testConnectorConfig } from '@src/lib/connectors/manager';
import { assertHostAllowed } from '@src/lib/connectors/network-guard';
import { isConnectorTypeAllowed } from '@src/lib/settings/allowed-connectors';
import { logNetworkAudit } from '@src/lib/audit/audit-log';
import { getConnectorDefinition } from '@src/lib/connectors/registry';

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

const testInputSchema = z.object({
    type: z.string().min(1),
    config: z.record(z.string(), z.unknown()),
});

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();

        // Per-user rate limit: 10 connection tests per minute
        const rateLimitKey = `ds-test:${user.id}`;
        const allowed = checkRateLimit(rateLimitKey, 10, 60_000);
        if (!allowed) {
            return apiError('Too many connection test requests. Please wait before trying again (rate limit: 10/min).', 429);
        }

        const body: unknown = await req.json();
        const input = testInputSchema.parse(body);

        if (!isConnectorTypeAllowed(input.type)) {
            return apiError(`Connector type "${input.type}" is disabled by administrator policy.`, 403);
        }

        const def = getConnectorDefinition(input.type);

        // If host is specified, assert allowed by network guard
        let host: string | null = null;
        if (typeof input.config.host === 'string' && input.config.host.trim()) {
            host = input.config.host.trim();
            const port = typeof input.config.port === 'number' ? input.config.port : undefined;
            await assertHostAllowed(host, port);
        }

        // Audit-log network data source tests
        if (def && (def.category === 'sql' || def.category === 'nosql')) {
            logNetworkAudit({
                userId: user.id,
                action: 'test',
                host: host || (typeof input.config.connectionString === 'string' ? 'connection-string' : null),
            });
        }

        // 10s timeout wrapper
        const testPromise = testConnectorConfig(input.type, input.config);
        const timeoutPromise = new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Connection test timed out after 10 seconds.')), 10000)
        );

        const result = await Promise.race([testPromise, timeoutPromise]);
        return NextResponse.json({ data: result });
    } catch (err) {
        return handleApiError(err);
    }
}
