'use client';

import { useEffect } from 'react';
import { DatabaseErrorPage } from '@src/components/db/database-error-page';

export default function GlobalErrorBoundary({
    error,
    reset,
}: {
    error: Error & { digest?: string };
    reset: () => void;
}) {
    useEffect(() => {
        console.error('[Application Error Boundary Caught]', error);
    }, [error]);

    return <DatabaseErrorPage error={error} onRetry={reset} />;
}

