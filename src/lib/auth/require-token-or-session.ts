import 'server-only';

import { headers } from 'next/headers';
import { getCurrentUser } from './dal';
import { checkTokenRateLimit, validateToken } from './api-tokens';
import { UnauthorizedError } from './policy';
import { TooManyRequestsError } from '@src/app/api/utils';
import { logAuditEvent } from '../audit/audit-log';

export const VALID_TOKEN_SCOPES = ['finance:ingest', 'finance:read'] as const;
export type TokenScope = (typeof VALID_TOKEN_SCOPES)[number];

export async function requireTokenOrSession(
    scope: TokenScope,
    request?: Request
): Promise<{ userId: string; via: 'token' | 'session'; tokenId?: string }> {
    let authorization: string | null = null;
    if (request) {
        authorization = request.headers.get('Authorization');
    } else {
        try {
            const headersList = await headers();
            authorization = headersList.get('Authorization');
        } catch {
            // Outside Next request context (e.g. test invocation)
        }
    }

    if (authorization && authorization.startsWith('Bearer ')) {
        const rawToken = authorization.slice(7);
        const result = await validateToken(rawToken, scope);

        if (!result) {
            throw new UnauthorizedError('Invalid or expired token');
        }

        const { userId, tokenId } = result;

        // Rate limit check per token
        let ip = 'unknown';
        if (request) {
            ip = request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
        } else {
            try {
                const headersList = await headers();
                ip = headersList.get('x-forwarded-for')?.split(',')[0].trim() || 'unknown';
            } catch {
                // Ignore
            }
        }

        const rateLimit = await checkTokenRateLimit(tokenId, ip);
        if (!rateLimit.allowed) {
            throw new TooManyRequestsError('Rate limit exceeded for API token');
        }

        // Fire-and-forget audit event; never include raw token
        logAuditEvent({
            userId,
            action: 'api_token.used',
            details: { tokenId, scope },
        }).catch(() => {});

        return { userId, via: 'token', tokenId };
    }

    // Fall back to session
    const user = await getCurrentUser();
    if (!user) {
        throw new UnauthorizedError();
    }

    // finance:ingest and finance:read are always allowed for authenticated users
    return { userId: user.id, via: 'session' };
}
