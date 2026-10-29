import { describe, it, expect, beforeEach, vi } from 'vitest';
import type { User } from '@src/lib/db/schema';

const testSessionState = vi.hoisted(() => ({
    user: null as User | null,
}));

function setTestSessionUser(user: User | null): void {
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
import { eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { dataSources, queries, users, workbooks } from '@src/lib/db/schema';
import {
    listDataSources,
    createCsvDataSource,
    updateDataSource,
    deleteDataSource,
    bulkDeleteDataSources,
    getDataSourcePublic,
} from './service';
import { ensureSampleDataSource } from './sample';
import { createConnector } from '@src/lib/connectors/factory';
import type { SqliteConnector } from '@src/lib/connectors/sqlite-connector';
import { ConflictError } from '@src/lib/connectors/types';
import * as testApi from '@src/app/api/data-sources/[id]/test/route';
import * as detailApi from '@src/app/api/data-sources/[id]/route';
import * as dataSourcesApi from '@src/app/api/data-sources/route';

describe('Data Sources Service & Table Integration', () => {
    beforeEach(() => {
        // Clear queries and data sources created for tests if needed
    });

    it('loads sample data idempotently and returns valid source', async () => {
        const { source, created } = await ensureSampleDataSource();
        expect(source).toBeDefined();
        expect(source.type).toBe('sqlite');
        expect(typeof created).toBe('boolean');

        const sources = await listDataSources();
        const found = sources.find((s) => s.id === source.id);
        expect(found).toBeDefined();
        expect(found?.tableCount).toBeGreaterThanOrEqual(1);
    });

    it('creates a CSV data source, tests connection, and lists table count', async () => {
        const csvContent = `id,name,value\n1,alpha,100\n2,beta,200\n3,gamma,300`;
        const { source, rowCount } = await createCsvDataSource({
            name: 'Test Sales CSV',
            csvText: csvContent,
            originalFileName: 'sales.csv',
        });

        expect(rowCount).toBe(3);
        expect(source.name).toBe('Test Sales CSV');
        expect(source.type).toBe('csv');

        // Test connection
        const fullSource = (await db.select().from(dataSources).where(eq(dataSources.id, source.id)))[0];
        expect(fullSource).toBeDefined();
        const connector = createConnector(fullSource!) as SqliteConnector;
        expect(() => connector.testConnection()).not.toThrow();
        const tables = connector.getTables();
        expect(tables.length).toBe(1);
        await connector.close();

        // Check listDataSources reflects tableCount
        const list = await listDataSources();
        const found = list.find((s) => s.id === source.id);
        expect(found).toBeDefined();
        expect(found?.tableCount).toBe(1);
        expect(found?.queryCount).toBe(0);

        // Clean up
        await deleteDataSource(source.id);
    });

    it('renames a data source and persists changes', async () => {
        const { source } = await createCsvDataSource({
            name: 'Original Name',
            csvText: 'a,b\n1,2',
            originalFileName: 'orig.csv',
        });

        const updated = await updateDataSource(source.id, { name: 'Renamed Source' });
        expect(updated.name).toBe('Renamed Source');

        const fetched = await getDataSourcePublic(source.id);
        expect(fetched.name).toBe('Renamed Source');

        await deleteDataSource(source.id);
    });

    it('blocks deletion of a data source used by dependent queries with a clear ConflictError message', async () => {
        // 1. Create a data source
        const { source } = await createCsvDataSource({
            name: 'Used Data Source',
            csvText: 'id,score\n1,99',
            originalFileName: 'used.csv',
        });

        // 2. Create a workbook and a dependent query
        const user = (await db.select().from(users).limit(1))[0]!;
        const wbId = 'wb-dep-' + Date.now();
        await db.insert(workbooks)
            .values({ id: wbId, name: 'Dependency Workbook', ownerId: user.id });

        const qId = 'query-dep-' + Date.now();
        await db.insert(queries)
            .values({
                id: qId,
                name: 'Revenue Summary Query',
                workbookId: wbId,
                dataSourceId: source.id,
                sql: 'SELECT * FROM "used"',
            });

        // 3. Verify listDataSources reports queryCount = 1
        const list = await listDataSources();
        const found = list.find((s) => s.id === source.id);
        expect(found?.queryCount).toBe(1);

        // 4. Single delete must throw ConflictError with clear message listing the query name
        await expect(deleteDataSource(source.id)).rejects.toThrow(ConflictError);
        await expect(deleteDataSource(source.id)).rejects.toThrow(/Revenue Summary Query/);

        // 5. Bulk delete must report it as blocked
        const bulkResult = await bulkDeleteDataSources([source.id]);
        expect(bulkResult.deleted).not.toContain(source.id);
        expect(bulkResult.blocked).toEqual([
            expect.objectContaining({
                id: source.id,
                name: 'Used Data Source',
                queryCount: 1,
            }),
        ]);

        // Clean up: delete query, workbook, then source
        await db.delete(queries).where(eq(queries.id, qId));
        await db.delete(workbooks).where(eq(workbooks.id, wbId));
        await deleteDataSource(source.id);
    });

    it('bulk deletes unused data sources while blocking used ones in transaction', async () => {
        const { source: ds1 } = await createCsvDataSource({
            name: 'Unused Source 1',
            csvText: 'x,y\n1,2',
            originalFileName: 'u1.csv',
        });
        const { source: ds2 } = await createCsvDataSource({
            name: 'Unused Source 2',
            csvText: 'x,y\n3,4',
            originalFileName: 'u2.csv',
        });
        const { source: dsBlocked } = await createCsvDataSource({
            name: 'Blocked Source',
            csvText: 'x,y\n5,6',
            originalFileName: 'b.csv',
        });

        // Add query to dsBlocked
        const wbId = 'wb-bulk-' + Date.now();
        const user = (await db.select().from(users).limit(1))[0]!;
        await db.insert(workbooks).values({ id: wbId, name: 'WB Bulk', ownerId: user.id });
        const qId = 'q-bulk-' + Date.now();
        await db.insert(queries)
            .values({
                id: qId,
                name: 'Active Query',
                workbookId: wbId,
                dataSourceId: dsBlocked.id,
                sql: 'SELECT 1',
            });

        const result = await bulkDeleteDataSources([ds1.id, ds2.id, dsBlocked.id]);
        expect(result.deleted).toContain(ds1.id);
        expect(result.deleted).toContain(ds2.id);
        expect(result.blocked).toHaveLength(1);
        expect(result.blocked[0].id).toBe(dsBlocked.id);
        expect(result.blocked[0].name).toBe('Blocked Source');
        expect(result.blocked[0].queryCount).toBe(1);

        // Verify ds1 and ds2 are gone from database
        const after = await listDataSources();
        expect(after.some((s) => s.id === ds1.id)).toBe(false);
        expect(after.some((s) => s.id === ds2.id)).toBe(false);
        expect(after.some((s) => s.id === dsBlocked.id)).toBe(true);

        // Clean up query, workbook, dsBlocked
        await db.delete(queries).where(eq(queries.id, qId));
        await db.delete(workbooks).where(eq(workbooks.id, wbId));
        await deleteDataSource(dsBlocked.id);
    });

    it('tests connection via API route handler', async () => {
        const testUser = (await db.select().from(users).where(eq(users.role, 'admin')).limit(1))[0] ?? (await db.select().from(users).limit(1))[0]!;
        setTestSessionUser(testUser);

        try {
            const { source } = await createCsvDataSource({
                name: 'API Test CSV',
                csvText: 'col1,col2\nv1,v2',
                originalFileName: 'api_test.csv',
                ownerId: testUser.id,
            });

            const req = new Request(`http://localhost/api/data-sources/${source.id}/test`, {
                method: 'POST',
            });
            const res = await testApi.POST(req, {
                params: Promise.resolve({ id: source.id }),
            });

            expect(res.status).toBe(200);
            const json = (await res.json()) as { data?: { ok: boolean; tableCount: number } };
            expect(json.data?.ok).toBe(true);
            expect(json.data?.tableCount).toBe(1);

            await deleteDataSource(source.id);
        } finally {
            setTestSessionUser(null);
        }
    });

    it('returns 409 with dependent query details when deleting data source via API', async () => {
        const testUser = (await db.select().from(users).where(eq(users.role, 'admin')).limit(1))[0] ?? (await db.select().from(users).limit(1))[0]!;
        setTestSessionUser(testUser);

        try {
            const { source } = await createCsvDataSource({
                name: 'API 409 Test Source',
                csvText: 'id,metric\n1,100',
                originalFileName: 'api_409.csv',
                ownerId: testUser.id,
            });

            const wbId = 'wb-api-409-' + Date.now();
            await db.insert(workbooks).values({ id: wbId, name: 'WB 409', ownerId: testUser.id });

            const qId = 'q-api-409-' + Date.now();
            await db.insert(queries).values({
                id: qId,
                name: 'Financial Audit Query',
                workbookId: wbId,
                dataSourceId: source.id,
                sql: 'SELECT 1',
            });

            // 1. Single delete via API returns 409 Conflict
            const req = new Request(`http://localhost/api/data-sources/${source.id}`, { method: 'DELETE' });
            const res = await detailApi.DELETE(req, { params: Promise.resolve({ id: source.id }) });
            expect(res.status).toBe(409);
            const body = (await res.json()) as { error?: string };
            expect(body.error).toContain('Financial Audit Query');

            // 2. Bulk delete via API reports it as blocked
            const bulkReq = new Request('http://localhost/api/data-sources', {
                method: 'DELETE',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ ids: [source.id] }),
            });
            const bulkRes = await dataSourcesApi.DELETE(bulkReq);
            expect(bulkRes.status).toBe(200);
            const bulkJson = (await bulkRes.json()) as { data?: { blocked: { id: string; name: string; queryCount: number }[] } };
            expect(bulkJson.data?.blocked).toEqual([
                expect.objectContaining({ id: source.id, name: 'API 409 Test Source', queryCount: 1 }),
            ]);

            // Clean up
            await db.delete(queries).where(eq(queries.id, qId));
            await db.delete(workbooks).where(eq(workbooks.id, wbId));
            await deleteDataSource(source.id);
        } finally {
            setTestSessionUser(null);
        }
    });
});
