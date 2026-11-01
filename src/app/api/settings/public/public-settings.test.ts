import { describe, it, expect } from 'vitest';
import { GET } from './route';
import { db } from '@src/lib/db';
import { users } from '@src/lib/db/schema';
import { updateGeneralSettings } from '@src/lib/settings/app-settings';
import { eq } from 'drizzle-orm';
import { hashPassword } from '@src/lib/auth/password';

describe('Public Settings API Route (/api/settings/public)', () => {
    it('returns 200 with appName', async () => {
        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data).toBeDefined();
        expect(typeof json.data.appName).toBe('string');
        expect(json.data.appName.length).toBeGreaterThan(0);
    });

    it('returns updated appName after settings change', async () => {
        const [admin] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
        let adminId = admin?.id;
        if (!adminId) {
            const [created] = await db
                .insert(users)
                .values({
                    name: 'Admin Tester',
                    email: `admin_public_${Date.now()}@example.com`,
                    passwordHash: await hashPassword('password123'),
                    role: 'admin',
                    status: 'active',
                })
                .returning();
            adminId = created.id;
        }

        const newName = `Custom App ${Date.now()}`;
        await updateGeneralSettings({ appName: newName }, adminId);

        const res = await GET();
        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.appName).toBe(newName);
    });
});
