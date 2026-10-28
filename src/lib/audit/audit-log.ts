import { db } from '@src/lib/db';
import { auditLog } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';

export interface AuditParams {
    userId?: string | null;
    action: 'test' | 'create' | 'update' | 'delete';
    dataSourceId?: string | null;
    host?: string | null;
}

/**
 * Audit log a network data source event (console + sqlite audit_log table).
 * Never logs credentials, passwords, or connection strings containing secrets.
 */
export function logNetworkAudit(params: AuditParams): void {
    const { userId, action, dataSourceId, host } = params;
    const now = new Date();

    // 1. Console log
    console.log(
        `[Audit] action=${action} dataSourceId=${dataSourceId || 'none'} host=${host || 'unknown'} user=${userId || 'anonymous'} at=${now.toISOString()}`
    );

    // 2. Persist to audit_log table (best-effort, non-blocking)
    try {
        db.insert(auditLog)
            .values({
                id: newId(),
                userId: userId || null,
                action,
                dataSourceId: dataSourceId || null,
                host: host || null,
                at: now,
            })
            .run();
    } catch (err) {
        console.error('[Audit] Failed to insert audit log entry:', err);
    }
}

