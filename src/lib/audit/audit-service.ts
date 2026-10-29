import { db } from '@src/lib/db';
import { auditLog, users, appSettings } from '@src/lib/db/schema';
import { and, desc, eq, gte, ilike, lte, or, sql, lt } from 'drizzle-orm';
import { logAuditEvent } from './audit-log';

export interface AuditLogRow {
    id: string;
    action: string;
    userId: string | null;
    userName: string | null;
    userEmail: string | null;
    dataSourceId: string | null;
    host: string | null;
    ipAddress: string | null;
    details: Record<string, unknown> | null;
    at: Date;
}

export interface AuditFilterParams {
    action?: string;
    userId?: string;
    search?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
}

const AUDIT_RETENTION_KEY = 'audit_log_retention_days';
export const DEFAULT_AUDIT_RETENTION_DAYS = 180;

export async function getAuditRetentionDays(): Promise<number> {
    try {
        const [row] = await db
            .select()
            .from(appSettings)
            .where(eq(appSettings.key, AUDIT_RETENTION_KEY))
            .limit(1);

        if (row && typeof row.value === 'number') {
            return row.value;
        }
    } catch {
        // ignore and fallback
    }
    return DEFAULT_AUDIT_RETENTION_DAYS;
}

export async function setAuditRetentionDays(days: number, adminUserId: string): Promise<void> {
    const validDays = Math.max(7, Math.min(days, 3650));
    await db
        .insert(appSettings)
        .values({
            key: AUDIT_RETENTION_KEY,
            value: validDays,
        })
        .onConflictDoUpdate({
            target: appSettings.key,
            set: { value: validDays },
        });

    await logAuditEvent({
        userId: adminUserId,
        action: 'settings.update',
        details: { auditLogRetentionDays: validDays },
    });
}

export async function listAuditLogs(
    params: AuditFilterParams = {}
): Promise<{ logs: AuditLogRow[]; total: number }> {
    const limit = Math.min(Math.max(params.limit ?? 50, 1), 200);
    const offset = Math.max(params.offset ?? 0, 0);

    const conditions = [];

    if (params.action && params.action !== 'all') {
        conditions.push(eq(auditLog.action, params.action));
    }

    if (params.userId) {
        conditions.push(eq(auditLog.userId, params.userId));
    }

    if (params.startDate) {
        conditions.push(gte(auditLog.at, params.startDate));
    }

    if (params.endDate) {
        conditions.push(lte(auditLog.at, params.endDate));
    }

    if (params.search && params.search.trim()) {
        const q = `%${params.search.trim()}%`;
        conditions.push(
            or(
                ilike(auditLog.action, q),
                ilike(auditLog.ipAddress, q),
                ilike(users.email, q),
                ilike(users.name, q)
            )
        );
    }

    const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

    const [countResult] = await db
        .select({ count: sql<number>`count(*)::int` })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.userId, users.id))
        .where(whereClause);

    const total = countResult?.count ?? 0;

    const rows = await db
        .select({
            id: auditLog.id,
            action: auditLog.action,
            userId: auditLog.userId,
            userName: users.name,
            userEmail: users.email,
            dataSourceId: auditLog.dataSourceId,
            host: auditLog.host,
            ipAddress: auditLog.ipAddress,
            details: auditLog.details,
            at: auditLog.at,
        })
        .from(auditLog)
        .leftJoin(users, eq(auditLog.userId, users.id))
        .where(whereClause)
        .orderBy(desc(auditLog.at))
        .limit(limit)
        .offset(offset);

    return {
        logs: rows.map((r) => ({
            ...r,
            details: r.details as Record<string, unknown> | null,
        })),
        total,
    };
}

export async function exportAuditLogsCsv(params: AuditFilterParams = {}): Promise<string> {
    // Export up to 5000 matching rows
    const { logs } = await listAuditLogs({ ...params, limit: 5000, offset: 0 });

    const escapeCsvField = (val: unknown): string => {
        if (val === null || val === undefined) return '""';
        const str = typeof val === 'object' ? JSON.stringify(val) : String(val);
        return `"${str.replace(/"/g, '""')}"`;
    };

    const header = ['Timestamp', 'Action', 'User ID', 'User Email', 'User Name', 'IP Address', 'Details'].join(',');

    const lines = logs.map((log) => {
        return [
            escapeCsvField(log.at.toISOString()),
            escapeCsvField(log.action),
            escapeCsvField(log.userId || ''),
            escapeCsvField(log.userEmail || ''),
            escapeCsvField(log.userName || ''),
            escapeCsvField(log.ipAddress || ''),
            escapeCsvField(log.details ? JSON.stringify(log.details) : ''),
        ].join(',');
    });

    return [header, ...lines].join('\n');
}

export async function purgeOldAuditLogs(retentionDays?: number): Promise<{ purgedCount: number }> {
    const days = retentionDays ?? (await getAuditRetentionDays());
    const cutoffDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const result = await db
        .delete(auditLog)
        .where(lt(auditLog.at, cutoffDate))
        .returning({ id: auditLog.id });

    const purgedCount = result.length;

    console.log(`[Audit Purge] Purged ${purgedCount} audit log entries older than ${cutoffDate.toISOString()}`);

    return { purgedCount };
}

