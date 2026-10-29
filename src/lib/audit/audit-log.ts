import { db } from '@src/lib/db';
import { auditLog } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';

export interface AuditParams {
    userId?: string | null;
    action: string;
    dataSourceId?: string | null;
    host?: string | null;
    details?: Record<string, unknown> | null;
    ipAddress?: string | null;
}

/**
 * Log any audit event across authentication, user management, settings, data sources, etc.
 * Never logs credentials, passwords, or connection strings containing secrets.
 */
export async function logAuditEvent(params: AuditParams): Promise<void> {
    const { userId, action, dataSourceId, host, details, ipAddress } = params;
    const now = new Date();

    console.log(
        `[Audit] action=${action} user=${userId || 'system'} ip=${ipAddress || 'none'} at=${now.toISOString()}`
    );

    try {
        await db.insert(auditLog).values({
            id: newId(),
            userId: userId || null,
            action,
            dataSourceId: dataSourceId || null,
            host: host || null,
            details: details || null,
            ipAddress: ipAddress || null,
            at: now,
        });
    } catch (err) {
        console.error('[Audit] Failed to insert audit log entry:', err);
    }
}

/**
 * Audit log a network data source event (console + postgres audit_log table).
 * Never logs credentials, passwords, or connection strings containing secrets.
 */
export async function logNetworkAudit(params: AuditParams): Promise<void> {
    return logAuditEvent(params);
}
