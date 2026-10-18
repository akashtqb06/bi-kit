import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { appSettings, users, type User } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import { APP_DB_PATH } from '@src/lib/db/paths';
import { assertTestIsolationGuard } from '@src/lib/db/guard';
import { hashPassword } from '@src/lib/auth/password';

export async function seedUsers(): Promise<{ admin: User; member: User }> {
    assertTestIsolationGuard(APP_DB_PATH);
    fs.mkdirSync(path.dirname(APP_DB_PATH), { recursive: true });

    const adminEmail = (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase();
    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
    const memberEmail = (process.env.SEED_DEMO_USER_EMAIL ?? 'member@example.com').trim().toLowerCase();
    const memberPassword = process.env.SEED_DEMO_USER_PASSWORD ?? 'ChangeMe123!';

    if (process.env.NODE_ENV === 'production') {
        if (!process.env.SEED_ADMIN_PASSWORD || process.env.SEED_ADMIN_PASSWORD === 'ChangeMe123!') {
            throw new Error(
                'Refusing to seed admin user in production with default password. Set SEED_ADMIN_PASSWORD.'
            );
        }
        if (!process.env.SEED_DEMO_USER_PASSWORD || process.env.SEED_DEMO_USER_PASSWORD === 'ChangeMe123!') {
            throw new Error(
                'Refusing to seed demo member in production with default password. Set SEED_DEMO_USER_PASSWORD.'
            );
        }
    }

    const adminHash = await hashPassword(adminPassword);
    const memberHash = await hashPassword(memberPassword);

    const now = new Date();

    // Upsert admin
    const existingAdmin = db.select().from(users).where(eq(users.email, adminEmail)).get();
    if (existingAdmin) {
        db.update(users)
            .set({
                name: 'Admin',
                passwordHash: adminHash,
                role: 'admin',
                status: 'active',
                updatedAt: now,
            })
            .where(eq(users.email, adminEmail))
            .run();
    } else {
        db.insert(users)
            .values({
                id: newId(),
                email: adminEmail,
                name: 'Admin',
                passwordHash: adminHash,
                role: 'admin',
                status: 'active',
            })
            .run();
    }

    // Upsert demo member
    const existingMember = db.select().from(users).where(eq(users.email, memberEmail)).get();
    if (existingMember) {
        db.update(users)
            .set({
                name: 'Demo Member',
                passwordHash: memberHash,
                role: 'member',
                status: 'active',
                updatedAt: now,
            })
            .where(eq(users.email, memberEmail))
            .run();
    } else {
        db.insert(users)
            .values({
                id: newId(),
                email: memberEmail,
                name: 'Demo Member',
                passwordHash: memberHash,
                role: 'member',
                status: 'active',
            })
            .run();
    }

    // Make sure app_settings has allowRegistration=true
    const existingSetting = db.select().from(appSettings).where(eq(appSettings.key, 'allowRegistration')).get();
    if (existingSetting) {
        db.update(appSettings)
            .set({ value: true })
            .where(eq(appSettings.key, 'allowRegistration'))
            .run();
    } else {
        db.insert(appSettings)
            .values({
                key: 'allowRegistration',
                value: true,
            })
            .run();
    }

    const admin = db.select().from(users).where(eq(users.email, adminEmail)).get();
    const member = db.select().from(users).where(eq(users.email, memberEmail)).get();

    if (!admin || !member) {
        throw new Error('Failed to seed users: could not retrieve seeded users from database.');
    }

    console.log(`Seeded users: Admin (${admin.email}), Demo Member (${member.email})`);
    return { admin, member };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    seedUsers()
        .then(() => {
            process.exit(0);
        })
        .catch((error: unknown) => {
            console.error('User seeding failed:', error);
            process.exit(1);
        });
}

