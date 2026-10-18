import { NextResponse } from 'next/server';
import { ZodError } from 'zod';
import { ConflictError, ConnectorError, NotFoundError } from '@src/lib/connectors/types';

export function apiError(message: string, status: number): NextResponse {
    return NextResponse.json({ error: message }, { status });
}

export function handleApiError(err: unknown): NextResponse {
    if (err instanceof ZodError) {
        const message = err.issues.map((issue) => `${issue.path.join('.')}: ${issue.message}`).join('; ');
        return apiError(`Validation error: ${message}`, 400);
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
