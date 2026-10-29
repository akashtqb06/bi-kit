import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { BadRequestError, ConflictError, ConnectorError, NotFoundError } from '@src/lib/connectors/types';
import { UnauthorizedError, ForbiddenError } from '@src/lib/auth/policy';

export { BadRequestError, NotFoundError };
export { ForbiddenError };

export class NotImplementedError extends Error {
    constructor(message = 'Not implemented') {
        super(message);
        this.name = 'NotImplementedError';
    }
}

export function apiError(message: string, status: number): NextResponse {
    return NextResponse.json({ error: message }, { status });
}

export function handleApiError(err: unknown): NextResponse {
    if (err instanceof NotImplementedError || (err instanceof Error && err.name === 'NotImplementedError')) {
        // Extract method name from message like "DbFinanceService: listRecurringRules not implemented"
        const methodMatch = (err as Error).message.match(/:\s*(\w+)\s+not implemented/i);
        const method = methodMatch ? methodMatch[1] : (err as Error).message;
        return NextResponse.json({ error: 'not_implemented', method }, { status: 501 });
    }
    if (err instanceof UnauthorizedError) {
        return apiError(err.message, 401);
    }
    if (err instanceof ForbiddenError) {
        return apiError(err.message, 403);
    }
    if (err instanceof ZodError) {
        const message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        return apiError(`Validation error: ${message}`, 400);
    }
    if (err instanceof BadRequestError) {
        return apiError(err.message, 400);
    }
    if (err instanceof NotFoundError) {
        return apiError(err.message, 404);
    }
    if (err instanceof ConflictError) {
        return apiError(err.message, 409);
    }
    if (err instanceof ConnectorError) {
        if (err.code === 'SOURCE_NOT_FOUND') {
            return apiError(err.message, 404);
        }
        if (err.code === 'OPEN_FAILED') {
            return apiError(err.message, 500);
        }
        return apiError(err.message, 422);
    }
    // Do not expose internal error details
    console.error('[API error]', err);
    return apiError('An internal error occurred', 500);
}
