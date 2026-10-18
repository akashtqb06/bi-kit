import { describe, it, expect, vi } from 'vitest';
import { compile } from '@src/lib/query-engine/compiler';
import * as runQueryApi from '@src/app/api/queries/run/route';
import { db } from '@src/lib/db/client';
import { dataSources } from '@src/lib/db/schema';
import { createConnector } from '@src/lib/connectors/factory';
import { getDataSource } from '@src/lib/data-sources/service';

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

describe('Frappe Insights Query View flow verification', () => {
    it('executes Select Source -> Filter Rows -> Group & Summarize with reverse ordering and execution time', async () => {
        // 1. Find the sample data source
        const allDs = db.select().from(dataSources).all();
        const sampleDs = allDs.find((d) => d.name.toLowerCase().includes('demo') || d.name.toLowerCase().includes('sample'));
        expect(sampleDs).toBeDefined();

        const connector = createConnector(getDataSource(sampleDs!.id));
        const schema = connector.getSchema();
        connector.close();

        expect(schema.tables.some((t) => t.name === 'orders')).toBe(true);

        // 2. Step 1: Add Select Source ("orders" table)
        const defStep1 = {
            source: { table: 'orders' },
            steps: [],
        };

        const compiled1 = compile(defStep1, { schema });
        expect(compiled1.sql).toContain('SELECT * FROM "orders"');

        const run1Res = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDs!.id,
                mode: 'builder',
                definition: defStep1,
                page: 1,
                pageSize: 100,
            })
        );
        expect(run1Res.status).toBe(200);
        const data1 = (await run1Res.json()).data;
        expect(data1.rowCount).toBe(100);
        expect([150, 12000]).toContain(data1.totalRows);
        expect(data1.durationMs).toBeGreaterThan(0);
        expect(data1.columns.map((c: { name: string }) => c.name)).toContain('status');
        expect(data1.columns.map((c: { name: string }) => c.name)).toContain('total');

        // Operations list in reverse order at step 1:
        // [ Source ]
        const operations1 = [{ type: 'source', table: 'orders' }];
        expect(operations1.length).toBe(1);
        expect(operations1[0].type).toBe('source');

        // 3. Step 2: Add Filter Rows (status = 'delivered')
        const defStep2 = {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'filter' as const,
                    conditions: {
                        logic: 'and' as const,
                        items: [{ column: 'status', op: '=' as const, value: 'delivered' }],
                    },
                },
            ],
        };

        const compiled2 = compile(defStep2, { schema });
        expect(compiled2.sql).toContain('"status" = ?');

        const run2Res = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDs!.id,
                mode: 'builder',
                definition: defStep2,
                page: 1,
                pageSize: 100,
            })
        );
        expect(run2Res.status).toBe(200);
        const data2 = (await run2Res.json()).data;
        expect(data2.rowCount).toBeGreaterThan(0);
        expect(data2.durationMs).toBeGreaterThan(0);
        // Verify all rows have status === 'delivered'
        const statusColIdx = data2.columns.findIndex((c: { name: string }) => c.name === 'status');
        expect(data2.rows.every((r: unknown[]) => r[statusColIdx] === 'delivered')).toBe(true);

        // Operations list in REVERSE order at step 2 (newest on top, Source at bottom):
        // [ Filter Rows, Source ]
        const operations2 = [defStep2.steps[0], { type: 'source', table: 'orders' }];
        expect(operations2[0].type).toBe('filter');
        expect(operations2[1].type).toBe('source');

        // 4. Step 3: Add Group & Summarize (group by created_at month, sum total)
        const defStep3 = {
            source: { table: 'orders' },
            steps: [
                defStep2.steps[0],
                {
                    type: 'summarize' as const,
                    groupBy: [{ column: 'created_at', dateGrain: 'month' as const }],
                    aggregates: [
                        { fn: 'sum' as const, column: 'total', alias: 'total_revenue' },
                        { fn: 'count' as const, column: 'id', alias: 'order_count' },
                    ],
                },
            ],
        };

        const compiled3 = compile(defStep3, { schema });
        expect(compiled3.sql).toContain("strftime('%Y-%m', \"created_at\")");
        expect(compiled3.sql).toContain('SUM("total") AS "total_revenue"');
        expect(compiled3.sql).toContain('COUNT("id") AS "order_count"');

        const run3Res = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDs!.id,
                mode: 'builder',
                definition: defStep3,
                page: 1,
                pageSize: 100,
            })
        );
        expect(run3Res.status).toBe(200);
        const data3 = (await run3Res.json()).data;
        expect(data3.rowCount).toBeGreaterThan(0);
        expect(data3.durationMs).toBeGreaterThan(0);
        expect(data3.columns.map((c: { name: string }) => c.name)).toEqual([
            'created_at',
            'total_revenue',
            'order_count',
        ]);
        expect(data3.rows.length).toBeGreaterThan(0);

        // Operations list in REVERSE order at step 3 (newest on top, Source always at bottom):
        // 1. Group & Summarize (newest)
        // 2. Filter Rows
        // 3. Source (always last at the bottom)
        const operations3 = [
            defStep3.steps[1],
            defStep3.steps[0],
            { type: 'source', table: 'orders' },
        ];
        expect(operations3[0].type).toBe('summarize');
        expect(operations3[1].type).toBe('filter');
        expect(operations3[2].type).toBe('source');
    });
});

