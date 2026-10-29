import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@src/lib/db';
import { auditLog, users } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import {
    listAuditLogs,
    exportAuditLogsCsv,
    getAuditRetentionDays,
    setAuditRetentionDays,
    purgeOldAuditLogs,
    DEFAULT_AUDIT_RETENTION_DAYS,
} from './audit-service';
import { logAuditEvent } from './audit-log';
import { hashPassword } from '@src/lib/auth/password';

describe('Audit Log Service & Retention', () => {
    let adminUserId: string;

    beforeEach(async () => {
        const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
        if (admin) {
            adminUserId = admin.id;
        } else {
            const [created] = await db
                .insert(users)
                .values({
                    name: 'Audit Admin',
                    email: `audit_admin_${Date.now()}@example.com`,
                    passwordHash: await hashPassword('password123'),
                    role: 'admin',
                    status: 'active',
                })
                .returning();
            adminUserId = created.id;
        }
    });

    it('records and lists audit logs with filtering and pagination', async () => {
        const uniqueHost = `host_${Date.now()}.internal`;
        await logAuditEvent({
            userId: adminUserId,
            action: 'data_source.test',
            host: uniqueHost,
            details: { latencyMs: 12 },
            ipAddress: '192.168.1.100',
        });

        const result = await listAuditLogs({
            action: 'data_source.test',
            limit: 10,
        });

        expect(result.total).toBeGreaterThanOrEqual(1);
        const match = result.logs.find((l) => l.host === uniqueHost);
        expect(match).toBeDefined();
        expect(match?.action).toBe('data_source.test');
        expect(match?.ipAddress).toBe('192.168.1.100');
    });

    it('exports audit logs as formatted CSV', async () => {
        await logAuditEvent({
            userId: adminUserId,
            action: 'export.test',
            details: { format: 'csv' },
            ipAddress: '10.0.0.1',
        });

        const csv = await exportAuditLogsCsv({ action: 'export.test' });
        expect(typeof csv).toBe('string');
        expect(csv).toContain('Timestamp,Action,User ID,User Email,User Name,IP Address,Details');
        expect(csv).toContain('export.test');
    });

    it('manages audit log retention setting and purges expired records', async () => {
        const defaultRetention = await getAuditRetentionDays();
        expect(defaultRetention).toBe(DEFAULT_AUDIT_RETENTION_DAYS);

        // Update retention to 90 days
        await setAuditRetentionDays(90, adminUserId);
        const updated = await getAuditRetentionDays();
        expect(updated).toBe(90);

        // Insert an old audit record (100 days old)
        const oldDate = new Date(Date.now() - 100 * 24 * 60 * 60 * 1000);
        await db.insert(auditLog).values({
            action: 'ancient.action',
            userId: adminUserId,
            at: oldDate,
        });

        // Purge with 90 day retention
        const purgeResult = await purgeOldAuditLogs(90);
        expect(purgeResult.purgedCount).toBeGreaterThanOrEqual(1);

        // Verify ancient record is gone
        const ancient = await db.select().from(auditLog).where(eq(auditLog.action, 'ancient.action'));
        expect(ancient.length).toBe(0);
    });
});
