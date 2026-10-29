import { describe, it, expect, beforeEach, vi } from 'vitest';
import { db } from '@src/lib/db';
import { dataSources, users, appSettings } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';
import { newId } from '@src/lib/db/id';
import { listDataSources, getDataSourcePublic, createDataSource, updateDataSource, deleteDataSource } from '@src/lib/data-sources/service';
import { setAllowedConnectorTypes, isConnectorTypeAllowed, ALLOWED_CONNECTORS_KEY } from '@src/lib/settings/allowed-connectors';
import { parseConnectionUrl } from './url-parser';
import * as testApi from '@src/app/api/data-sources/test/route';
import * as connectorsApi from '@src/app/api/connectors/route';
import * as settingsApi from '@src/app/api/settings/connectors/route';
import type { User } from '@src/lib/db/schema';

// Mock session user
const testSessionState = vi.hoisted(() => ({
    user: null as User | null,
}));

vi.mock('@src/lib/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@src/lib/auth/session')>();
    return {
        ...actual,
        getSession: vi.fn(async () => {
            if (!testSessionState.user) return null;
            return {
                user: testSessionState.user,
                session: {
                    id: 'mock-session',
                    userId: testSessionState.user.id,
                    tokenHash: 'mock-hash',
                    createdAt: new Date(),
                    lastUsedAt: new Date(),
                    expiresAt: new Date(Date.now() + 3600_000),
                    ipAddress: '127.0.0.1',
                    userAgent: 'Vitest',
                },
            };
        }),
    };
});

describe('Connectors Product Wiring & Security Tests', () => {
    let adminUser: User;
    let memberUser: User;

    beforeEach(async () => {
        // Find or create test admin and member
        let admin = (await db.select().from(users).where(eq(users.role, 'admin')).limit(1))[0];
        if (!admin) {
            const id = newId();
            admin = (await db.insert(users).values({
                id,
                name: 'Admin User',
                email: `admin-${id}@example.com`,
                passwordHash: 'mock-hash',
                role: 'admin',
            }).returning())[0];
        }
        adminUser = admin;

        let member = (await db.select().from(users).where(eq(users.role, 'member')).limit(1))[0];
        if (!member) {
            const id = newId();
            member = (await db.insert(users).values({
                id,
                name: 'Member User',
                email: `member-${id}@example.com`,
                passwordHash: 'mock-hash',
                role: 'member',
            }).returning())[0];
        }
        memberUser = member;

        testSessionState.user = adminUser;
        // Reset allowed connector types
        await db.delete(appSettings).where(eq(appSettings.key, ALLOWED_CONNECTORS_KEY));
    });

    describe('Secrets Protection in Public DTOs', () => {
        it('never returns raw plaintext passwords in listDataSources or getDataSourcePublic', async () => {
            const rawPassword = 'SuperSecretDbPassword123!';
            const ds = await createDataSource({
                name: 'Sensitive Postgres Source',
                type: 'postgres',
                config: {
                    host: 'localhost',
                    port: 5433,
                    database: 'bikit_dev',
                    username: 'postgres',
                    password: rawPassword,
                    ssl: 'disable',
                },
                ownerId: adminUser.id,
            });

            // Verify getDataSourcePublic masks the password
            const publicSource = await getDataSourcePublic(ds.id);
            expect(publicSource).toBeDefined();
            expect(publicSource.config).toBeDefined();
            expect(publicSource.config?.password).toBe('••••••••');
            expect(JSON.stringify(publicSource)).not.toContain(rawPassword);

            // Verify listDataSources masks the password
            const list = await listDataSources();
            const found = list.find((s) => s.id === ds.id);
            expect(found).toBeDefined();
            expect(found?.config?.password).toBe('••••••••');
            expect(JSON.stringify(list)).not.toContain(rawPassword);

            // Clean up
            await deleteDataSource(ds.id);
        });

        it('preserves existing encrypted secret when editing with sentinel', async () => {
            const originalPassword = 'InitialSecretPassword999!';
            const ds = await createDataSource({
                name: 'Edit Sentinel Test',
                type: 'postgres',
                config: {
                    host: 'localhost',
                    port: 5433,
                    database: 'bikit_dev',
                    username: 'postgres',
                    password: originalPassword,
                    ssl: 'disable',
                },
                ownerId: adminUser.id,
            });

            // Update host but keep password as sentinel
            await updateDataSource(ds.id, {
                name: 'Updated Sentinel Test',
                config: {
                    host: 'db.internal.example.com',
                    port: 5433,
                    database: 'bikit_dev',
                    username: 'postgres',
                    password: '••••••••',
                    ssl: 'disable',
                },
            });

            // Verify stored row still has the original password encrypted
            const row = (await db.select().from(dataSources).where(eq(dataSources.id, ds.id)))[0];
            expect(row).toBeDefined();
            expect(JSON.stringify(row?.config)).not.toContain('••••••••');

            await deleteDataSource(ds.id);
        });
    });

    describe('Allowed Connector Types Administration', () => {
        it('allows reading and setting allowed connectors for admin', async () => {
            testSessionState.user = adminUser;

            // Read defaults
            const getRes = await settingsApi.GET();
            expect(getRes.status).toBe(200);
            const getJson = await getRes.json();
            expect(getJson.data.allowedConnectorTypes).toContain('postgres');
            expect(getJson.data.allowedConnectorTypes).toContain('sqlite');

            // Admin restricts allowed connectors to sqlite and csv only
            const putReq = new Request('http://localhost/api/settings/connectors', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    allowedConnectorTypes: ['sqlite', 'csv'],
                }),
            });

            const putRes = await settingsApi.PUT(putReq);
            expect(putRes.status).toBe(200);
            const putJson = await putRes.json();
            expect(putJson.data.allowedConnectorTypes).toEqual(['sqlite', 'csv']);

            // Verify settings helper functions
            expect(await isConnectorTypeAllowed('sqlite')).toBe(true);
            expect(await isConnectorTypeAllowed('postgres')).toBe(false);

            // Connectors API reflects allowed: false
            const connRes = await connectorsApi.GET();
            expect(connRes.status).toBe(200);
            const connJson = await connRes.json();
            const pgDef = connJson.data.find((c: { type: string }) => c.type === 'postgres');
            const sqliteDef = connJson.data.find((c: { type: string }) => c.type === 'sqlite');
            expect(pgDef?.allowed).toBe(false);
            expect(sqliteDef?.allowed).toBe(true);
        });

        it('rejects non-admin access to settings/connectors', async () => {
            testSessionState.user = memberUser;

            const getRes = await settingsApi.GET();
            expect(getRes.status).toBe(403);

            const putReq = new Request('http://localhost/api/settings/connectors', {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ allowedConnectorTypes: ['sqlite'] }),
            });
            const putRes = await settingsApi.PUT(putReq);
            expect(putRes.status).toBe(403);
        });

        it('blocks testing a disabled connector type', async () => {
            await setAllowedConnectorTypes(['sqlite', 'csv']);
            testSessionState.user = adminUser;

            const testReq = new Request('http://localhost/api/data-sources/test', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    type: 'postgres',
                    config: { host: 'localhost', database: 'test' },
                }),
            });

            const testRes = await testApi.POST(testReq);
            expect(testRes.status).toBe(403);
            const testJson = await testRes.json();
            expect(testJson.error).toContain('disabled by administrator policy');
        });
    });

    describe('Connection URL Parser', () => {
        it('parses PostgreSQL connection URLs correctly', () => {
            const url = 'postgresql://admin:SecretPass123!@db.example.com:5432/analytics?sslmode=require';
            const parsed = parseConnectionUrl(url, 'postgres');

            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.fields.host).toBe('db.example.com');
                expect(parsed.fields.port).toBe(5432);
                expect(parsed.fields.database).toBe('analytics');
                expect(parsed.fields.username).toBe('admin');
                expect(parsed.fields.password).toBe('SecretPass123!');
                expect(parsed.fields.ssl).toBe('require');
            }
        });

        it('parses MySQL connection URLs correctly', () => {
            const url = 'mysql://appuser:MyPass!@10.0.0.5:3306/production_db?ssl=true';
            const parsed = parseConnectionUrl(url, 'mysql');

            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.fields.host).toBe('10.0.0.5');
                expect(parsed.fields.port).toBe(3306);
                expect(parsed.fields.database).toBe('production_db');
                expect(parsed.fields.username).toBe('appuser');
                expect(parsed.fields.password).toBe('MyPass!');
                expect(parsed.fields.ssl).toBe('require');
            }
        });

        it('parses MongoDB connection strings with authSource and TLS', () => {
            const url = 'mongodb://root:mongopass@mongo.internal:27017/analytics_docs?authSource=admin&replicaSet=rs0&tls=true';
            const parsed = parseConnectionUrl(url, 'mongodb');

            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.fields.host).toBe('mongo.internal');
                expect(parsed.fields.port).toBe(27017);
                expect(parsed.fields.database).toBe('analytics_docs');
                expect(parsed.fields.username).toBe('root');
                expect(parsed.fields.password).toBe('mongopass');
                expect(parsed.fields.authSource).toBe('admin');
                expect(parsed.fields.replicaSet).toBe('rs0');
                expect(parsed.fields.tls).toBe(true);
            }
        });

        it('returns error on empty or invalid URL', () => {
            expect(parseConnectionUrl('', 'postgres').success).toBe(false);
            expect(parseConnectionUrl('not a url', 'postgres').success).toBe(false);
        });
    });
});
