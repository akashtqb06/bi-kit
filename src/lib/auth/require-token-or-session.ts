import 'server-only';

import { headers } from 'next/headers';
import { getCurrentUser } from './dal';
import { validateToken } from './api-tokens';
import { UnauthorizedError } from './policy';
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
