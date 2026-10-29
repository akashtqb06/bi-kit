import { describe, it, expect, beforeAll, vi } from 'vitest';
import { db } from '@src/lib/db';
import { users, dataSources, workbooks, queries } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import { materializeQuery, dropMaterializedQuery, getMaterializedQueryInfo } from '../service';
import { executeDbQuery } from '../sync-engine';
import { eq } from 'drizzle-orm';
import * as runQueryApi from '@src/app/api/queries/run/route';

vi.mock('@src/lib/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@src/lib/auth/session')>();
    return {
        ...actual,
        getSession: vi.fn(async () => {
            const { db } = await import('@src/lib/db');
            const { users } = await import('@src/lib/db/schema');
            const [adminUser] = await db.select().from(users).limit(1);
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

function postJson(url: string, body: unknown): Request {
    return new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('Materialized Query in Data Store', () => {
    let testUserId: string;
    let testWorkbookId: string;
    let sqliteSourceId: string;
    let queryId: string;

    beforeAll(async () => {
        const [existingUser] = await db.select().from(users).limit(1);
        testUserId = existingUser ? existingUser.id : newId();

        // Find existing sample sqlite dataSource
        const [existingDs] = await db.select().from(dataSources).where(eq(dataSources.type, 'sqlite')).limit(1);
        if (!existingDs) throw new Error('Expected seeded SQLite data source');
        sqliteSourceId = existingDs.id;

        // Create workbook
        testWorkbookId = newId();
        await db.insert(workbooks).values({
            id: testWorkbookId,
            ownerId: testUserId,
            name: 'Test Workbook',
        });

        // Create query
        queryId = newId();
        await db.insert(queries).values({
            id: queryId,
            workbookId: testWorkbookId,
            name: 'Top Customers Test',
            dataSourceId: sqliteSourceId,
            mode: 'sql',
            sql: 'SELECT customer_id, name FROM customers LIMIT 5',
        });
    });

    it('materializes a query into a store table and updates metadata', async () => {
        const tableRecord = await materializeQuery(testUserId, queryId);
        if (tableRecord.status === 'error') {
            console.error('Materialize error:', tableRecord.lastError);
        }

        expect(tableRecord.kind).toBe('query');
        expect(tableRecord.queryId).toBe(queryId);
        expect(tableRecord.storeTable).toContain('query_');
        expect(tableRecord.status).toBe('synced');
        expect(tableRecord.rowCount).toBe(5);

        // Verify physical table in schema
        const checkRes = await executeDbQuery(
            `SELECT * FROM "${tableRecord.storeSchema}"."${tableRecord.storeTable}"`
        );
        expect(checkRes.rowCount).toBe(5);
        expect(checkRes.rows[0]).toHaveProperty('name');
    });

    it('getMaterializedQueryInfo returns store table info when enabled', async () => {
        const info = await getMaterializedQueryInfo(queryId);
        expect(info).not.toBeNull();
        expect(info?.queryId).toBe(queryId);
        expect(info?.status).toBe('synced');
    });

    it('fast-path execution: runQueryApi returns isStored true directly from store table', async () => {
        const req = postJson('http://localhost/api/queries/run', {
            queryId,
            dataSourceId: sqliteSourceId,
            mode: 'sql',
            sql: 'SELECT customer_id, name FROM customers LIMIT 5',
        });

        const res = await runQueryApi.POST(req);
        expect(res.status).toBe(200);
        const json = await res.json();

        expect(json.data.isStored).toBe(true);
        expect(json.data.rowCount).toBe(5);
        expect(json.data.lastSyncedAt).toBeDefined();
    });

    it('dropMaterializedQuery drops the physical table and deletes metadata record', async () => {
        const infoBefore = await getMaterializedQueryInfo(queryId);
        expect(infoBefore).not.toBeNull();

        await dropMaterializedQuery(testUserId, queryId);

        const infoAfter = await getMaterializedQueryInfo(queryId);
        expect(infoAfter).toBeNull();

        // Verify physical table dropped
        if (infoBefore) {
            const checkRes = await executeDbQuery(`
                SELECT to_regclass($1) AS reg
            `, [`"${infoBefore.storeSchema}"."${infoBefore.storeTable}"`]);
            expect(checkRes.rows[0]?.reg).toBeNull();
        }
    });
});
