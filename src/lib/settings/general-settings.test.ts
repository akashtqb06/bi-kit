import { describe, it, expect, beforeEach } from 'vitest';
import { db } from '@src/lib/db';
import { users, auditLog, appSettings } from '@src/lib/db/schema';
import { eq, and } from 'drizzle-orm';
import {
    getGeneralSettings,
    updateGeneralSettings,
    getEnvironmentInfo,
} from './app-settings';
import { hashPassword } from '@src/lib/auth/password';

describe('General Settings & Environment Info', () => {
    let adminUserId: string;

    beforeEach(async () => {
        const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
        if (admin) {
            adminUserId = admin.id;
        } else {
            const [created] = await db
                .insert(users)
                .values({
                    name: 'Admin Settings Tester',
                    email: `admin_settings_${Date.now()}@example.com`,
                    passwordHash: await hashPassword('password123'),
                    role: 'admin',
                    status: 'active',
                })
                .returning();
            adminUserId = created.id;
        }
    });

    it('retrieves default general settings and environment information', async () => {
        const settings = await getGeneralSettings();
        expect(settings).toBeDefined();
        expect(typeof settings.appName).toBe('string');
        expect(typeof settings.allowRegistration).toBe('boolean');
        expect(typeof settings.sessionLifetimeDays).toBe('number');
        expect(Array.isArray(settings.allowedConnectorTypes)).toBe(true);

        const env = getEnvironmentInfo();
        expect(env.publicUrl).toBeDefined();
        expect(env.networkPolicy).toBeDefined();
        expect(env.networkPolicy.length).toBeGreaterThan(0);
        expect(env.nodeEnv).toBeDefined();
    });

    it('updates general settings and writes an audit log entry', async () => {
        const newAppName = `BI Kit Test ${Date.now()}`;
        const updated = await updateGeneralSettings(
            {
                appName: newAppName,
                allowRegistration: false,
                sessionLifetimeDays: 14,
                allowedConnectorTypes: ['postgres', 'sqlite', 'csv'],
            },
            adminUserId
        );

        expect(updated.appName).toBe(newAppName);
        expect(updated.allowRegistration).toBe(false);
        expect(updated.sessionLifetimeDays).toBe(14);
        expect(updated.allowedConnectorTypes).toEqual(['postgres', 'sqlite', 'csv']);

        // Verify audit log entry
        const [audit] = await db
            .select()
            .from(auditLog)
            .where(and(eq(auditLog.action, 'settings.update'), eq(auditLog.userId, adminUserId)))
            .limit(1);
        expect(audit).toBeDefined();
    });
});
