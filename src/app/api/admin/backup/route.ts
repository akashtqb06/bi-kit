import { NextResponse } from 'next/server';
import fs from 'node:fs/promises';
import path from 'node:path';
import { requireUserApi } from '@src/lib/auth/dal';
import { logAuditEvent } from '@src/lib/audit/audit-log';
import { handleApiError, apiError } from '@src/app/api/utils';

export async function POST(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        let triggered = false;
        let message = 'On-demand backup initiated.';

        // Attempt to create a trigger file in backups directory if writable
        const backupTriggerPath = path.join(process.cwd(), 'backups', '.backup-trigger');
        try {
            await fs.writeFile(backupTriggerPath, JSON.stringify({
                triggeredBy: user.id,
                triggeredAt: new Date().toISOString(),
            }));
            triggered = true;
            message = 'Backup request dispatched to backup daemon.';
        } catch {
            triggered = false;
            message = 'Backup trigger file could not be written directly. Use CLI command.';
        }

        await logAuditEvent({
            userId: user.id,
            action: 'backup.trigger',
            details: { triggered },
        });

        return NextResponse.json({
            data: {
                triggered,
                message,
                cliCommand: 'bash scripts/backup-now.sh',
                dockerCommand: 'docker compose exec backup /usr/local/bin/backup.sh',
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}

