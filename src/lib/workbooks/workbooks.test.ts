import { mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import { afterAll, describe, expect, it, vi } from 'vitest';
import type { WorkbookWithCounts } from '@src/lib/workbooks/service';

vi.mock('@src/lib/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@src/lib/auth/session')>();
    return {
        ...actual,
        getSession: vi.fn(async () => {
            const { db } = await import('@src/lib/db');
            const { users } = await import('@src/lib/db/schema');
            const { eq } = await import('drizzle-orm');
            const [adminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
            if (!adminUser) return null;
            return {
                user: adminUser,
                session: {
                    id: 'test-admin-session',
                    userId: adminUser.id,
                    tokenHash: 'hash',
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
const appDatabaseDirectory = mkdtempSync(path.join(tmpdir(), 'bi-kit-wb-test-'));
process.env.APP_DB_PATH = path.join(appDatabaseDirectory, 'app.db');

const { db, runMigrations, resetConnection } = await import('@src/lib/db');
await runMigrations();
const { seedUsers } = await import('../../../scripts/seed/users');
await seedUsers();

const { listWorkbooks, createWorkbook, getWorkbook, duplicateWorkbook, bulkDeleteWorkbooks, deleteWorkbook } =
    await import('@src/lib/workbooks/service');
const { ConflictError } = await import('@src/lib/connectors/types');
const { queries, charts, dashboards, dataSources, users } = await import('@src/lib/db/schema');
const { newId } = await import('@src/lib/db/id');
const { eq } = await import('drizzle-orm');

const workbooksApi = await import('@src/app/api/workbooks/route');
const duplicateApi = await import('@src/app/api/workbooks/[id]/duplicate/route');
const workbookDetailApi = await import('@src/app/api/workbooks/[id]/route');

afterAll(() => {
    rmSync(appDatabaseDirectory, { recursive: true, force: true });
    if (previousDatabasePath) {
        process.env.APP_DB_PATH = previousDatabasePath;
    }
    resetConnection();
});

describe('workbooks backend services and endpoints', () => {
    it('lists workbooks with counts per workbook', async () => {
        const wb1 = await createWorkbook({ name: 'WB 1', description: 'First' });
        const wb2 = await createWorkbook({ name: 'WB 2', description: 'Second' });

        const testUser = (await db.select().from(users).limit(1))[0]!;

        // Create a dummy datasource
        const dsId = newId();
        await db.insert(dataSources)
            .values({
                id: dsId,
                ownerId: testUser.id,
                name: 'Test DS',
                type: 'sqlite',
                config: { path: ':memory:' },
            });

        // Add query to wb1
        const q1Id = newId();
        await db.insert(queries)
            .values({
                id: q1Id,
                workbookId: wb1.id,
                name: 'Query 1',
                dataSourceId: dsId,
                mode: 'sql',
                sql: 'SELECT 1',
            });

        // Add chart to wb1
        const c1Id = newId();
        await db.insert(charts)
            .values({
                id: c1Id,
                workbookId: wb1.id,
                queryId: q1Id,
                name: 'Chart 1',
                type: 'bar',
                config: {},
            });

        // Add dashboard to wb1
        await db.insert(dashboards)
            .values({
                id: newId(),
                ownerId: testUser.id,
                workbookId: wb1.id,
                name: 'Dashboard 1',
                layout: [{ i: '1', chartId: c1Id, x: 0, y: 0, w: 6, h: 4 }],
            });

        const list = await listWorkbooks();
        const found1 = list.find((w) => w.id === wb1.id);
        const found2 = list.find((w) => w.id === wb2.id);

        expect(found1).toBeDefined();
        expect(found1?.queriesCount).toBe(1);
        expect(found1?.chartsCount).toBe(1);
        expect(found1?.dashboardsCount).toBe(1);

        expect(found2).toBeDefined();
        expect(found2?.queriesCount).toBe(0);
        expect(found2?.chartsCount).toBe(0);
        expect(found2?.dashboardsCount).toBe(0);
    });

    it('duplicates a workbook with queries, charts, and dashboards', async () => {
        const original = await createWorkbook({ name: 'Original', description: 'To duplicate' });
        const dsId = newId();
        const testUser = (await db.select().from(users).limit(1))[0]!;
        await db.insert(dataSources)
            .values({
                id: dsId,
                ownerId: testUser.id,
                name: 'DS for dup',
                type: 'sqlite',
                config: { path: ':memory:' },
            });

        const qId = newId();
        await db.insert(queries)
            .values({
                id: qId,
                workbookId: original.id,
                name: 'Q',
                dataSourceId: dsId,
                mode: 'sql',
                sql: 'SELECT 42',
            });

        const cId = newId();
        await db.insert(charts)
            .values({
                id: cId,
                workbookId: original.id,
                queryId: qId,
                name: 'C',
                type: 'line',
                config: {},
            });

        await db.insert(dashboards)
            .values({
                id: newId(),
                ownerId: testUser.id,
                workbookId: original.id,
                name: 'D',
                layout: [{ i: 'tile-1', chartId: cId, x: 0, y: 0, w: 4, h: 4 }],
            });

        const duplicate = await duplicateWorkbook(original.id);
        expect(duplicate.name).toBe('Original (Copy)');
        expect(duplicate.id).not.toBe(original.id);
        expect(duplicate.queriesCount).toBe(1);
        expect(duplicate.chartsCount).toBe(1);
        expect(duplicate.dashboardsCount).toBe(1);

        // Verify duplicated queries, charts, and dashboards exist
        const dupQueries = await db.select().from(queries).where(eq(queries.workbookId, duplicate.id));
        expect(dupQueries).toHaveLength(1);
        expect(dupQueries[0].id).not.toBe(qId);
        expect(dupQueries[0].name).toBe('Q');

        const dupCharts = await db.select().from(charts).where(eq(charts.workbookId, duplicate.id));
        expect(dupCharts).toHaveLength(1);
        expect(dupCharts[0].id).not.toBe(cId);
        expect(dupCharts[0].queryId).toBe(dupQueries[0].id);

        const dupDashboards = await db.select().from(dashboards).where(eq(dashboards.workbookId, duplicate.id));
        expect(dupDashboards).toHaveLength(1);
        const layout = typeof dupDashboards[0].layout === 'string' ? JSON.parse(dupDashboards[0].layout) : dupDashboards[0].layout;
        expect(layout[0].chartId).toBe(dupCharts[0].id);
    });

    it('rejects single delete when child records exist', async () => {
        const wb = await createWorkbook({ name: 'Child test' });
        const dsId = newId();
        const testUser = (await db.select().from(users).limit(1))[0]!;
        await db.insert(dataSources)
            .values({
                id: dsId,
                ownerId: testUser.id,
                name: 'DS',
                type: 'sqlite',
                config: { path: ':memory:' },
            });

        await db.insert(queries)
            .values({
                id: newId(),
                workbookId: wb.id,
                name: 'Blocking Query',
                dataSourceId: dsId,
                mode: 'sql',
            });

        await expect(deleteWorkbook(wb.id)).rejects.toThrow(ConflictError);
    });

    it('bulk deletes multiple workbooks cascading in a transaction', async () => {
        const wbA = await createWorkbook({ name: 'Bulk A' });
        const wbB = await createWorkbook({ name: 'Bulk B' });

        const testUser = (await db.select().from(users).limit(1))[0]!;
        const dsId = newId();
        await db.insert(dataSources)
            .values({
                id: dsId,
                ownerId: testUser.id,
                name: 'DS',
                type: 'sqlite',
                config: { path: ':memory:' },
            });

        await db.insert(queries)
            .values({
                id: newId(),
                workbookId: wbA.id,
                name: 'QA',
                dataSourceId: dsId,
                mode: 'sql',
            });

        await db.insert(dashboards)
            .values({
                id: newId(),
                ownerId: testUser.id,
                workbookId: wbB.id,
                name: 'DB',
            });

        await bulkDeleteWorkbooks([wbA.id, wbB.id]);

        await expect(getWorkbook(wbA.id)).rejects.toThrow();
        await expect(getWorkbook(wbB.id)).rejects.toThrow();
    });

    it('POST /api/workbooks/[id]/duplicate and DELETE /api/workbooks HTTP handlers', async () => {
        const wb = await createWorkbook({ name: 'Route Test' });

        const dupRes = await duplicateApi.POST(
            new Request(`http://localhost/api/workbooks/${wb.id}/duplicate`, { method: 'POST' }),
            { params: Promise.resolve({ id: wb.id }) }
        );
        expect(dupRes.status).toBe(201);
        const dupJson = await dupRes.json();
        expect(dupJson.data.name).toBe('Route Test (Copy)');

        const deleteRes = await workbooksApi.DELETE(
            new Request('http://localhost/api/workbooks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [wb.id, dupJson.data.id] }),
            })
        );
        expect(deleteRes.status).toBe(200);
        const delJson = await deleteRes.json();
        expect(delJson.data.ok).toBe(true);
        expect(delJson.data.count).toBe(2);
    });

    it('verifies user flow: create three workbooks, search, sort by modified, select two and bulk delete, duplicate one, rename one, confirm reload', async () => {
        // 1. Create three workbooks
        const resA = await workbooksApi.POST(
            new Request('http://localhost/api/workbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Alpha Workbook' }),
            })
        );
        expect(resA.status).toBe(201);
        const wbA = (await resA.json()).data;

        const resB = await workbooksApi.POST(
            new Request('http://localhost/api/workbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Beta Workbook' }),
            })
        );
        expect(resB.status).toBe(201);
        const wbB = (await resB.json()).data;

        const resC = await workbooksApi.POST(
            new Request('http://localhost/api/workbooks', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Gamma Workbook' }),
            })
        );
        expect(resC.status).toBe(201);
        const wbC = (await resC.json()).data;

        // 2. Fetch list and confirm counts
        let listRes = await workbooksApi.GET();
        let listData = ((await listRes.json()) as { data: WorkbookWithCounts[] }).data;
        expect(listData.some((w) => w.id === wbA.id)).toBe(true);
        expect(listData.some((w) => w.id === wbB.id)).toBe(true);
        expect(listData.some((w) => w.id === wbC.id)).toBe(true);

        // 3. Search for one: filtering by title client-side / search matches
        const searchMatches = listData.filter((w) => w.name.toLowerCase().includes('beta'));
        expect(searchMatches).toHaveLength(1);
        expect(searchMatches[0].id).toBe(wbB.id);

        // 4. Sort by Modified (updatedAt desc)
        const sorted = [...listData].sort(
            (a, b) =>
                new Date(b.updatedAt || b.createdAt || 0).getTime() -
                new Date(a.updatedAt || a.createdAt || 0).getTime()
        );
        expect(sorted.length).toBeGreaterThanOrEqual(3);

        // 5. Select two and bulk delete them (wbB and wbC)
        const bulkDelRes = await workbooksApi.DELETE(
            new Request('http://localhost/api/workbooks', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [wbB.id, wbC.id] }),
            })
        );
        expect(bulkDelRes.status).toBe(200);

        // Confirm wbB and wbC are deleted, wbA still exists
        listRes = await workbooksApi.GET();
        listData = ((await listRes.json()) as { data: WorkbookWithCounts[] }).data;
        expect(listData.some((w) => w.id === wbB.id)).toBe(false);
        expect(listData.some((w) => w.id === wbC.id)).toBe(false);
        expect(listData.some((w) => w.id === wbA.id)).toBe(true);

        // 6. Duplicate one (wbA)
        const dupRes = await duplicateApi.POST(
            new Request(`http://localhost/api/workbooks/${wbA.id}/duplicate`, { method: 'POST' }),
            { params: Promise.resolve({ id: wbA.id }) }
        );
        expect(dupRes.status).toBe(201);
        const dupData = ((await dupRes.json()) as { data: WorkbookWithCounts }).data;
        expect(dupData.name).toBe('Alpha Workbook (Copy)');

        // 7. Rename one (rename wbA to 'Renamed Workbook')
        const renameRes = await workbookDetailApi.PUT(
            new Request(`http://localhost/api/workbooks/${wbA.id}`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: 'Renamed Workbook' }),
            }),
            { params: Promise.resolve({ id: wbA.id }) }
        );
        expect(renameRes.status).toBe(200);
        const renamedData = ((await renameRes.json()) as { data: WorkbookWithCounts }).data;
        expect(renamedData.name).toBe('Renamed Workbook');

        // 8. Confirm everything persists after reload
        listRes = await workbooksApi.GET();
        listData = ((await listRes.json()) as { data: WorkbookWithCounts[] }).data;
        const reloadedA = listData.find((w) => w.id === wbA.id);
        const reloadedDup = listData.find((w) => w.id === dupData.id);
        expect(reloadedA?.name).toBe('Renamed Workbook');
        expect(reloadedDup?.name).toBe('Alpha Workbook (Copy)');
    });
});
