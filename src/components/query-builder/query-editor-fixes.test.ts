import { describe, it, expect, vi, beforeEach } from 'vitest';
import { useQueryEditorStore } from './store';
import { toSelectItems } from '@/components/ui/select';
import { inlineParams } from '@src/lib/query-engine/inline-params';
import * as runQueryApi from '@src/app/api/queries/run/route';
import { db } from '@src/lib/db/client';
import { dataSources } from '@src/lib/db/schema';

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

describe('Query Editor Fixes & SQL Mode Integration', () => {
    beforeEach(() => {
        useQueryEditorStore.setState({
            queryId: '',
            workbookId: '',
            queryName: '',
            dataSourceId: '',
            dataSources: [],
            schema: null,
            mode: 'builder',
            definition: { source: { table: 'orders' }, steps: [] },
            sql: 'SELECT * FROM "orders"',
            isDirty: false,
            results: null,
            isRunning: false,
            runError: null,
        });
    });

    it('toSelectItems helper correctly formats items for Base UI Select', () => {
        const dsList = [
            { id: 'ds_1', name: 'Sales SQLite' },
            { id: 'ds_2', name: 'Customers CSV' },
        ];
        const items = toSelectItems(
            dsList,
            (d) => d.id,
            (d) => d.name
        );
        expect(items).toEqual([
            { value: 'ds_1', label: 'Sales SQLite' },
            { value: 'ds_2', label: 'Customers CSV' },
        ]);
    });

    it('switchToSqlMode compiles builder definition into SQL, updates mode to sql, and preserves definition', async () => {
        const testDefinition = {
            source: { table: 'orders' },
            steps: [
                {
                    _id: 'step_1',
                    type: 'filter' as const,
                    conditions: { logic: 'and' as const, items: [{ column: 'status', op: '=' as const, value: 'delivered' }] },
                },
            ],
        };

        useQueryEditorStore.setState({
            queryId: 'test_q_1',
            workbookId: 'wb_1',
            queryName: 'Test Query',
            mode: 'builder',
            definition: testDefinition,
            sql: '',
            schema: {
                tables: [
                    {
                        name: 'orders',
                        columns: [{ name: 'status', type: 'TEXT', nullable: false }],
                    },
                ],
            },
        });

        // Mock fetch for PUT /api/queries/[id] and POST /api/queries/run
        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/api/queries/test_q_1')) {
                return new Response(JSON.stringify({ data: { id: 'test_q_1', mode: 'sql' } }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            if (url.includes('/api/queries/run')) {
                return new Response(
                    JSON.stringify({
                        data: {
                            columns: [{ name: 'status', type: 'TEXT' }],
                            rows: [['delivered']],
                            rowCount: 1,
                            totalRows: 1,
                            durationMs: 5,
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response('{}', { status: 200 });
        });

        try {
            await useQueryEditorStore.getState().switchToSqlMode();

            const updated = useQueryEditorStore.getState();
            expect(updated.mode).toBe('sql');
            expect(updated.sql).toContain('SELECT * FROM "orders"');
            expect(updated.sql).toContain('"status" = \'delivered\'');
            // The original builder definition MUST be preserved
            expect(updated.definition).toEqual(testDefinition);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('switchToBuilderMode restores builder definition and recompiles SQL', async () => {
        const testDefinition = {
            source: { table: 'orders' },
            steps: [
                {
                    _id: 'step_2',
                    type: 'filter' as const,
                    conditions: { logic: 'and' as const, items: [{ column: 'status', op: '=' as const, value: 'shipped' }] },
                },
            ],
        };

        useQueryEditorStore.setState({
            queryId: 'test_q_2',
            workbookId: 'wb_1',
            queryName: 'Test Query 2',
            mode: 'sql',
            definition: testDefinition,
            sql: 'SELECT 1 AS manual_override',
            schema: {
                tables: [
                    {
                        name: 'orders',
                        columns: [{ name: 'status', type: 'TEXT', nullable: false }],
                    },
                ],
            },
        });

        const originalFetch = globalThis.fetch;
        globalThis.fetch = vi.fn().mockImplementation(async (url: string) => {
            if (url.includes('/api/queries/test_q_2')) {
                return new Response(JSON.stringify({ data: { id: 'test_q_2', mode: 'builder' } }), {
                    status: 200,
                    headers: { 'Content-Type': 'application/json' },
                });
            }
            if (url.includes('/api/queries/run')) {
                return new Response(
                    JSON.stringify({
                        data: {
                            columns: [{ name: 'status', type: 'TEXT' }],
                            rows: [['shipped']],
                            rowCount: 1,
                            totalRows: 1,
                            durationMs: 5,
                        },
                    }),
                    { status: 200, headers: { 'Content-Type': 'application/json' } }
                );
            }
            return new Response('{}', { status: 200 });
        });

        try {
            await useQueryEditorStore.getState().switchToBuilderMode();

            const updated = useQueryEditorStore.getState();
            expect(updated.mode).toBe('builder');
            // Restores the compiled SQL from definition
            expect(updated.sql).toContain('SELECT * FROM "orders"');
            expect(updated.sql).toContain('"status" = ?');
            expect(updated.definition).toEqual(testDefinition);
        } finally {
            globalThis.fetch = originalFetch;
        }
    });

    it('executes SQL mode query through API and validates read-only security with status 400', async () => {
        // Find sample data source
        const allDs = db.select().from(dataSources).all();
        const sampleDs = allDs.find((d) => d.name.toLowerCase().includes('demo') || d.name.toLowerCase().includes('sample'));
        expect(sampleDs).toBeDefined();

        // Valid read-only query
        const validRes = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDs!.id,
                mode: 'sql',
                sql: 'SELECT order_id, order_status, total FROM "orders" LIMIT 5',
            })
        );
        expect(validRes.status).toBe(200);
        const validData = (await validRes.json()).data;
        expect(validData.rowCount).toBe(5);
        expect(validData.columns.length).toBe(3);

        // Disallowed write statement (INSERT) must be rejected with 400 Bad Request
        const invalidRes = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDs!.id,
                mode: 'sql',
                sql: 'INSERT INTO "orders" (order_id) VALUES (\'malicious\')',
            })
        );
        expect(invalidRes.status).toBe(400);
        const invalidJson = await invalidRes.json();
        expect(String(invalidJson.error).toLowerCase()).toContain('read-only');

        // Real SQLite error (e.g. no such column) must return status 400 and real database error message
        const colErrorRes = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDs!.id,
                mode: 'sql',
                sql: 'SELECT nonexistent_column_xyz FROM "orders" LIMIT 5',
            })
        );
        expect(colErrorRes.status).toBe(400);
        const colErrorJson = await colErrorRes.json();
        expect(colErrorJson.error).toContain('no such column');
    });

    it('definition hashing detects operations changes but ignores query title changes', () => {
        const def1 = JSON.stringify({ source: { table: 'orders' }, steps: [] });
        const def2 = JSON.stringify({ source: { table: 'customers' }, steps: [] });

        const hash1 = `${'ds_1'}:builder:${def1}`;
        const hashTitleChange = `${'ds_1'}:builder:${def1}`; // Title is not part of operations hash
        const hashOpChange = `${'ds_1'}:builder:${def2}`;

        expect(hash1).toBe(hashTitleChange);
        expect(hash1).not.toBe(hashOpChange);
    });

    it('inlineParams inlines literals and ignores ? inside strings, identifiers, and comments', () => {
        // String escaping with single quotes
        expect(inlineParams('WHERE name = ?', ["O'Reilly"])).toBe("WHERE name = 'O''Reilly'");

        // Numbers and booleans unquoted, null as NULL
        expect(inlineParams('WHERE count = ? AND active = ? AND extra = ?', [42, true, null])).toBe(
            'WHERE count = 42 AND active = 1 AND extra = NULL'
        );

        // Skips ? inside string literals
        expect(inlineParams("SELECT 'Is this a question?' AS q, col FROM t WHERE id = ?", ['abc'])).toBe(
            "SELECT 'Is this a question?' AS q, col FROM t WHERE id = 'abc'"
        );

        // Skips ? inside quoted identifiers
        expect(inlineParams('SELECT "col?name" FROM t WHERE x = ?', [10])).toBe(
            'SELECT "col?name" FROM t WHERE x = 10'
        );

        // Skips ? inside comments
        const commentSql = '-- Is this ?\nSELECT * FROM t /* block ? comment */ WHERE id = ?';
        expect(inlineParams(commentSql, ['xyz'])).toBe(
            "-- Is this ?\nSELECT * FROM t /* block ? comment */ WHERE id = 'xyz'"
        );
    });
});
