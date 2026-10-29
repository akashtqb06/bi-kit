import { NextResponse } from 'next/server';
import { checkDatabaseHealth } from '@src/lib/db/health';
import { getBackupHeartbeat } from '@src/lib/backup/heartbeat';

export async function GET() {
    const health = await checkDatabaseHealth();
    const backup = getBackupHeartbeat();

    if (!health.ok) {
        if (process.env.NODE_ENV !== 'production') {
            return NextResponse.json(
                {
                    status: 'error',
                    database: 'unhealthy',
                    reason: health.reason,
                    error: health.exactFix,
                    fix: health.fix,
                    detail: health.detail,
                    backup,
                },
                { status: 503 }
            );
        }

        console.error('[Health Check Failure]', health.exactFix, health.error);
        return NextResponse.json(
            {
                status: 'error',
                database: 'unhealthy',
                backup,
            },
            { status: 503 }
        );
    }

    return NextResponse.json(
        {
            status: 'ok',
            database: 'healthy',
            backup,
        },
        { status: 200 }
    );
}

