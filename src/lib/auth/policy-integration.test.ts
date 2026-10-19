import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';
import path from 'node:path';
import fs from 'node:fs';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';


type UserRow = {
    id: string;
    email: string;
    name: string;
    role: string;
    status: string;
    avatarUrl: string | null;
    createdAt: Date;
    updatedAt: Date;
    lastLoginAt: Date | null;
    passwordHash: string;
};

const testSessionState = vi.hoisted(() => ({
    user: null as UserRow | null,
}));

function setTestSessionUser(user: UserRow | null | undefined): void {
    testSessionState.user = user ?? null;
}

vi.mock('@src/lib/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@src/lib/auth/session')>();
    return {
        ...actual,
        getSession: vi.fn(async () => {
            if (!testSessionState.user) return null;
            return {
                user: testSessionState.user,
                session: {
                    id: 'mock-session-id',
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

const previousDatabasePath = process.env.APP_DB_PATH;
const appDatabaseDirectory = fs.mkdtempSync(path.join(tmpdir(), 'bi-kit-policy-test-'));
process.env.APP_DB_PATH = path.join(appDatabaseDirectory, 'app.db');

const { db, runMigrations, resetConnection } = await import('@src/lib/db');
runMigrations();
const { users, workbooks, dataSources, queries, charts, dashboards } = await import('@src/lib/db/schema');
const { seedUsers } = await import('../../../scripts/seed/users');
const { DATA_DIR } = await import('@src/lib/db/paths');

// Import all API routes
import * as workbooksApi from '@src/app/api/workbooks/route';
import * as workbookDetailApi from '@src/app/api/workbooks/[id]/route';
import * as workbookDuplicateApi from '@src/app/api/workbooks/[id]/duplicate/route';
import * as dataSourcesApi from '@src/app/api/data-sources/route';
import * as dataSourceDetailApi from '@src/app/api/data-sources/[id]/route';
import * as dataSourceSchemaApi from '@src/app/api/data-sources/[id]/schema/route';
import * as dataSourceTestApi from '@src/app/api/data-sources/[id]/test/route';
import * as dataSourceUploadApi from '@src/app/api/data-sources/[id]/upload/route';
import * as queriesApi from '@src/app/api/queries/route';
import * as queryDetailApi from '@src/app/api/queries/[id]/route';
import * as queryRunApi from '@src/app/api/queries/run/route';
import * as chartsApi from '@src/app/api/charts/route';
import * as chartDetailApi from '@src/app/api/charts/[id]/route';
import * as dashboardsApi from '@src/app/api/dashboards/route';
import * as dashboardDetailApi from '@src/app/api/dashboards/[id]/route';
import * as dashboardDuplicateApi from '@src/app/api/dashboards/[id]/duplicate/route';
import * as dashboardViewApi from '@src/app/api/dashboards/[id]/view/route';

let adminUser: UserRow;
let memberA: UserRow;
let memberB: UserRow;

let memberBWorkbookId: string;
let memberBDataSourceId: string;
let memberBQueryId: string;
let memberBChartId: string;
let memberBDashboardId: string;

function makeJsonReq(url: string, method: string, body?: unknown): Request {
    return new Request(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: body !== undefined ? JSON.stringify(body) : undefined,
    });
}

beforeAll(async () => {
    const seeded = await seedUsers();
    adminUser = seeded.admin;

    // Create two members
    const [uA] = await db
        .insert(users)
        .values({
            email: 'member-a@example.com',
            name: 'Member A',
            passwordHash: 'dummy-hash',
            role: 'member',
            status: 'active',
        })
        .returning();
    memberA = uA;

    const [uB] = await db
        .insert(users)
        .values({
            email: 'member-b@example.com',
            name: 'Member B',
            passwordHash: 'dummy-hash',
            role: 'member',
            status: 'active',
        })
        .returning();
    memberB = uB;

    // Create a physical SQLite source inside DATA_DIR for Member B
    const sourceDir = fs.mkdtempSync(path.join(DATA_DIR, '.policy-b-source-'));
    const sourcePath = path.join(sourceDir, 'b_data.db');
    const sourceDb = new Database(sourcePath);
    sourceDb.exec('CREATE TABLE b_table (id INTEGER PRIMARY KEY, secret TEXT)');
    sourceDb.prepare('INSERT INTO b_table (secret) VALUES (?)').run('member-b-secret');
    sourceDb.close();

    // Create Member B's data source
    const [dsB] = await db
        .insert(dataSources)
        .values({
            name: "Member B's Secret DS",
            type: 'sqlite',
            config: JSON.stringify({ path: sourcePath }),
            ownerId: memberB.id,
        })
        .returning();
    memberBDataSourceId = dsB.id;

    // Create Member B's workbook
    const [wbB] = await db
        .insert(workbooks)
        .values({
            name: "Member B's Workbook",
            ownerId: memberB.id,
        })
        .returning();
    memberBWorkbookId = wbB.id;

    // Create Member B's query
    const [qB] = await db
        .insert(queries)
        .values({
            workbookId: memberBWorkbookId,
            dataSourceId: memberBDataSourceId,
            name: "Member B's Query",
            mode: 'sql',
            sql: 'SELECT * FROM b_table',
            createdBy: memberB.id,
        })
        .returning();
    memberBQueryId = qB.id;

    // Create Member B's chart
    const [cB] = await db
        .insert(charts)
        .values({
            workbookId: memberBWorkbookId,
            queryId: memberBQueryId,
            name: "Member B's Chart",
            type: 'bar',
            config: '{}',
            createdBy: memberB.id,
        })
        .returning();
    memberBChartId = cB.id;

    // Create Member B's dashboard
    const [dB] = await db
        .insert(dashboards)
        .values({
            workbookId: memberBWorkbookId,
            ownerId: memberB.id,
            name: "Member B's Dashboard",
            layout: '[]',
            filters: '[]',
        })
        .returning();
    memberBDashboardId = dB.id;
});

afterAll(() => {
    setTestSessionUser(undefined);
    fs.rmSync(appDatabaseDirectory, { recursive: true, force: true });
    if (previousDatabasePath) {
        process.env.APP_DB_PATH = previousDatabasePath;
    }
    resetConnection();
});

describe('Policy Integration & Access Control', () => {
    describe('Unauthenticated API security (All API routes return 401)', () => {
        it('ensures every route handler under src/app/api returns 401 when unauthenticated', async () => {
            setTestSessionUser(null);

            function findRouteFiles(dir: string): string[] {
                const results: string[] = [];
                const entries = fs.readdirSync(dir, { withFileTypes: true });
                for (const entry of entries) {
                    const fullPath = path.join(dir, entry.name);
                    if (entry.isDirectory()) {
                        results.push(...findRouteFiles(fullPath));
                    } else if (entry.name === 'route.ts') {
                        results.push(fullPath);
                    }
                }
                return results;
            }

            const apiDir = path.resolve(process.cwd(), 'src/app/api');
            const routeFiles = findRouteFiles(apiDir);
            expect(routeFiles.length).toBeGreaterThanOrEqual(20);

            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

            for (const file of routeFiles) {
                const mod = await import(file);
                for (const method of methods) {
                    if (typeof mod[method] === 'function') {
                        const req = makeJsonReq('http://localhost/api/test', method, method !== 'GET' ? {} : undefined);
                        const res = await mod[method](req, {
                            params: Promise.resolve({ id: 'any-id' }),
                        });
                        expect(
                            res.status,
                            `Expected 401 for unauthenticated ${method} on ${path.relative(process.cwd(), file)}`
                        ).toBe(401);
                    }
                }
            }
        });
    });

    describe("Member A cannot view, edit, delete, or run queries against Member B's resources", () => {
        it('isolates workbooks (list, get, put, delete)', async () => {
            setTestSessionUser(memberA);

            // Member A lists workbooks: Member B's workbook must NOT be present
            const listRes = await workbooksApi.GET();
            expect(listRes.status).toBe(200);
            const listJson = await listRes.json();
            expect(listJson.data.some((w: { id: string }) => w.id === memberBWorkbookId)).toBe(false);

            // Member A tries to get Member B's workbook -> 404
            const getRes = await workbookDetailApi.GET(makeJsonReq('http://localhost/api/workbooks', 'GET'), {
                params: Promise.resolve({ id: memberBWorkbookId }),
            });
            expect(getRes.status).toBe(404);

            // Member A tries to edit Member B's workbook -> 404
            const putRes = await workbookDetailApi.PUT(
                makeJsonReq('http://localhost/api/workbooks', 'PUT', { name: 'Hacked' }),
                { params: Promise.resolve({ id: memberBWorkbookId }) }
            );
            expect(putRes.status).toBe(404);

            // Member A tries to duplicate Member B's workbook -> 404
            const dupRes = await workbookDuplicateApi.POST(
                makeJsonReq('http://localhost/api/workbooks/duplicate', 'POST'),
                { params: Promise.resolve({ id: memberBWorkbookId }) }
            );
            expect(dupRes.status).toBe(404);

            // Member A tries to delete Member B's workbook -> 404
            const delRes = await workbookDetailApi.DELETE(makeJsonReq('http://localhost/api/workbooks', 'DELETE'), {
                params: Promise.resolve({ id: memberBWorkbookId }),
            });
            expect(delRes.status).toBe(404);
        });

        it('isolates data sources (list, get, schema, test, upload, delete)', async () => {
            setTestSessionUser(memberA);

            // List data sources
            const listRes = await dataSourcesApi.GET();
            expect(listRes.status).toBe(200);
            const listJson = await listRes.json();
            expect(listJson.data.some((ds: { id: string }) => ds.id === memberBDataSourceId)).toBe(false);

            // Get data source detail -> 404
            const getRes = await dataSourceDetailApi.GET(makeJsonReq('http://localhost/api/data-sources', 'GET'), {
                params: Promise.resolve({ id: memberBDataSourceId }),
            });
            expect(getRes.status).toBe(404);

            // Get schema -> 404
            const schemaRes = await dataSourceSchemaApi.GET(makeJsonReq('http://localhost/api/data-sources', 'GET'), {
                params: Promise.resolve({ id: memberBDataSourceId }),
            });
            expect(schemaRes.status).toBe(404);

            // Test connection -> 404
            const testRes = await dataSourceTestApi.POST(makeJsonReq('http://localhost/api/data-sources', 'POST'), {
                params: Promise.resolve({ id: memberBDataSourceId }),
            });
            expect(testRes.status).toBe(404);

            // Upload/replace -> 404
            const uploadRes = await dataSourceUploadApi.PUT(
                new Request('http://localhost/api/data-sources/upload', { method: 'PUT', body: new FormData() }),
                { params: Promise.resolve({ id: memberBDataSourceId }) }
            );
            expect(uploadRes.status).toBe(404);

            // Delete -> 404
            const delRes = await dataSourceDetailApi.DELETE(makeJsonReq('http://localhost/api/data-sources', 'DELETE'), {
                params: Promise.resolve({ id: memberBDataSourceId }),
            });
            expect(delRes.status).toBe(404);
        });

        it('isolates queries and blocks running SQL against Member B data source', async () => {
            setTestSessionUser(memberA);

            // List queries: Member B's query must not be returned
            const listRes = await queriesApi.GET(new Request('http://localhost/api/queries'));
            expect(listRes.status).toBe(200);
            const listJson = await listRes.json();
            expect(listJson.data.some((q: { id: string }) => q.id === memberBQueryId)).toBe(false);

            // Get query -> 404
            const getRes = await queryDetailApi.GET(makeJsonReq('http://localhost/api/queries', 'GET'), {
                params: Promise.resolve({ id: memberBQueryId }),
            });
            expect(getRes.status).toBe(404);

            // Edit query -> 404
            const putRes = await queryDetailApi.PUT(
                makeJsonReq('http://localhost/api/queries', 'PUT', { name: 'Hacked Query' }),
                { params: Promise.resolve({ id: memberBQueryId }) }
            );
            expect(putRes.status).toBe(404);

            // Delete query -> 404
            const delRes = await queryDetailApi.DELETE(makeJsonReq('http://localhost/api/queries', 'DELETE'), {
                params: Promise.resolve({ id: memberBQueryId }),
            });
            expect(delRes.status).toBe(404);

            // Member A tries to run a query against Member B's data source -> 404
            const runRes = await queryRunApi.POST(
                makeJsonReq('http://localhost/api/queries/run', 'POST', {
                    dataSourceId: memberBDataSourceId,
                    mode: 'sql',
                    sql: 'SELECT secret FROM b_table',
                })
            );
            expect(runRes.status).toBe(404);
        });

        it('isolates charts (list, get, edit, delete)', async () => {
            setTestSessionUser(memberA);

            // List charts: Member B's chart must not be returned
            const listRes = await chartsApi.GET(new Request('http://localhost/api/charts'));
            expect(listRes.status).toBe(200);
            const listJson = await listRes.json();
            expect(listJson.data.some((c: { id: string }) => c.id === memberBChartId)).toBe(false);

            // Get chart -> 404
            const getRes = await chartDetailApi.GET(makeJsonReq('http://localhost/api/charts', 'GET'), {
                params: Promise.resolve({ id: memberBChartId }),
            });
            expect(getRes.status).toBe(404);

            // Edit chart -> 404
            const putRes = await chartDetailApi.PUT(
                makeJsonReq('http://localhost/api/charts', 'PUT', { name: 'Hacked Chart' }),
                { params: Promise.resolve({ id: memberBChartId }) }
            );
            expect(putRes.status).toBe(404);

            // Delete chart -> 404
            const delRes = await chartDetailApi.DELETE(makeJsonReq('http://localhost/api/charts', 'DELETE'), {
                params: Promise.resolve({ id: memberBChartId }),
            });
            expect(delRes.status).toBe(404);
        });

        it('isolates dashboards (list, get, edit, delete, duplicate, view)', async () => {
            setTestSessionUser(memberA);

            // List dashboards: Member B's dashboard must NOT be present
            const listRes = await dashboardsApi.GET(new Request('http://localhost/api/dashboards'));
            expect(listRes.status).toBe(200);
            const listJson = await listRes.json();
            expect(listJson.data.some((d: { id: string }) => d.id === memberBDashboardId)).toBe(false);

            // Get dashboard -> 404
            const getRes = await dashboardDetailApi.GET(makeJsonReq('http://localhost/api/dashboards', 'GET'), {
                params: Promise.resolve({ id: memberBDashboardId }),
            });
            expect(getRes.status).toBe(404);

            // Edit dashboard -> 404
            const putRes = await dashboardDetailApi.PUT(
                makeJsonReq('http://localhost/api/dashboards', 'PUT', { name: 'Hacked Dashboard' }),
                { params: Promise.resolve({ id: memberBDashboardId }) }
            );
            expect(putRes.status).toBe(404);

            // Duplicate dashboard -> 404
            const dupRes = await dashboardDuplicateApi.POST(
                makeJsonReq('http://localhost/api/dashboards/duplicate', 'POST'),
                { params: Promise.resolve({ id: memberBDashboardId }) }
            );
            expect(dupRes.status).toBe(404);

            // Record view -> 404
            const viewRes = await dashboardViewApi.POST(makeJsonReq('http://localhost/api/dashboards/view', 'POST'), {
                params: Promise.resolve({ id: memberBDashboardId }),
            });
            expect(viewRes.status).toBe(404);

            // Delete dashboard -> 404
            const delRes = await dashboardDetailApi.DELETE(makeJsonReq('http://localhost/api/dashboards', 'DELETE'), {
                params: Promise.resolve({ id: memberBDashboardId }),
            });
            expect(delRes.status).toBe(404);
        });
    });

    describe('Admin has unrestricted access across all users', () => {
        it("allows admin to view, query, edit, and duplicate Member B's resources", async () => {
            setTestSessionUser(adminUser);

            // Admin lists workbooks -> Member B's workbook is visible
            const listWbRes = await workbooksApi.GET();
            expect(listWbRes.status).toBe(200);
            const listWbJson = await listWbRes.json();
            expect(listWbJson.data.some((w: { id: string }) => w.id === memberBWorkbookId)).toBe(true);

            // Admin reads Member B's workbook
            const getWbRes = await workbookDetailApi.GET(makeJsonReq('http://localhost/api/workbooks', 'GET'), {
                params: Promise.resolve({ id: memberBWorkbookId }),
            });
            expect(getWbRes.status).toBe(200);

            // Admin reads Member B's data source and views schema
            const dsRes = await dataSourceDetailApi.GET(makeJsonReq('http://localhost/api/data-sources', 'GET'), {
                params: Promise.resolve({ id: memberBDataSourceId }),
            });
            expect(dsRes.status).toBe(200);

            const schemaRes = await dataSourceSchemaApi.GET(makeJsonReq('http://localhost/api/data-sources', 'GET'), {
                params: Promise.resolve({ id: memberBDataSourceId }),
            });
            expect(schemaRes.status).toBe(200);

            // Admin executes query against Member B's data source
            const runRes = await queryRunApi.POST(
                makeJsonReq('http://localhost/api/queries/run', 'POST', {
                    dataSourceId: memberBDataSourceId,
                    mode: 'sql',
                    sql: 'SELECT secret FROM b_table',
                })
            );
            expect(runRes.status).toBe(200);
            const runJson = await runRes.json();
            expect(runJson.data.rows[0][0]).toBe('member-b-secret');

            // Admin duplicates Member B's dashboard
            const dupRes = await dashboardDuplicateApi.POST(
                makeJsonReq('http://localhost/api/dashboards/duplicate', 'POST', { name: "Admin's Copy" }),
                { params: Promise.resolve({ id: memberBDashboardId }) }
            );
            expect(dupRes.status).toBe(201);
            const dupJson = await dupRes.json();
            expect(dupJson.data.name).toBe("Admin's Copy");
        });
    });
});
