import { existsSync, mkdtempSync, rmSync } from 'node:fs';
import path from 'node:path';
import { tmpdir } from 'node:os';
import Database from 'better-sqlite3';
import { afterAll, describe, expect, it, vi } from 'vitest';

const testSessionState = vi.hoisted(() => ({
    user: null as any,
}));

function setTestSessionUser(user: any): void {
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
const appDatabaseDirectory = mkdtempSync(path.join(tmpdir(), 'bi-kit-workflow-'));
process.env.APP_DB_PATH = path.join(appDatabaseDirectory, 'app.db');
const { DATA_DIR, CSV_DIR } = await import('@src/lib/db/paths');

const { runMigrations, resetConnection } = await import('@src/lib/db');
runMigrations();
const { seedUsers } = await import('../../../scripts/seed/users');
const { admin } = await seedUsers();
setTestSessionUser(admin);


const dataSourcesApi = await import('@src/app/api/data-sources/route');
const deleteDataSourceApi = await import('@src/app/api/data-sources/[id]/route');
const uploadCsvDataSourceApi = await import('@src/app/api/data-sources/upload/route');
const dataSourceSchemaApi = await import('@src/app/api/data-sources/[id]/schema/route');
const workbooksApi = await import('@src/app/api/workbooks/route');
const deleteWorkbookApi = await import('@src/app/api/workbooks/[id]/route');
const queriesApi = await import('@src/app/api/queries/route');
const runQueryApi = await import('@src/app/api/queries/run/route');
const deleteQueryApi = await import('@src/app/api/queries/[id]/route');
const chartsApi = await import('@src/app/api/charts/route');
const deleteChartApi = await import('@src/app/api/charts/[id]/route');
const dashboardsApi = await import('@src/app/api/dashboards/route');
const dashboardApi = await import('@src/app/api/dashboards/[id]/route');

interface IdResponse {
    id: string;
}

interface DataSourceResponse extends IdResponse {
    name: string;
}

interface QueryResponse extends IdResponse {
    definition: string;
    mode: 'builder' | 'sql';
}

interface ChartResponse extends IdResponse {
    name: string;
    type: string;
    config: Record<string, unknown>;
}

interface DashboardResponse extends IdResponse {
    name: string;
    layout: { i: string; chartId: string; x: number; y: number; w: number; h: number }[];
}

interface QueryRunResponse {
    columns: { name: string; type: string }[];
    rows: (string | number | null)[][];
    rowCount: number;
    truncated: boolean;
    sql: string;
}

async function readData<T>(response: Response): Promise<T> {
    expect(response.ok).toBe(true);
    const payload: unknown = await response.json();
    if (typeof payload !== 'object' || payload === null || !('data' in payload)) {
        throw new Error('Expected an API response with a data property.');
    }
    return payload.data as T;
}

function postJson(url: string, body: unknown): Request {
    return new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

afterAll(() => {
    setTestSessionUser(null);
    rmSync(appDatabaseDirectory, { recursive: true, force: true });
    if (previousDatabasePath) {
        process.env.APP_DB_PATH = previousDatabasePath;
    }
    resetConnection();
});

describe('saved BI workflow', () => {
    it('creates a source, runs a filtered summary, saves charts, and persists dashboard layout', async () => {
        const sourceDirectory = mkdtempSync(path.join(DATA_DIR, '.workflow-source-'));
        const sourcePath = path.join(sourceDirectory, 'orders.db');
        const sourceDatabase = new Database(sourcePath);
        sourceDatabase.exec(
            'CREATE TABLE orders (id INTEGER PRIMARY KEY, category TEXT NOT NULL, amount REAL NOT NULL, status TEXT NOT NULL)'
        );
        const insertOrder = sourceDatabase.prepare('INSERT INTO orders (category, amount, status) VALUES (?, ?, ?)');
        insertOrder.run('Electronics', 80, 'completed');
        insertOrder.run('Electronics', 120, 'completed');
        insertOrder.run('Office', 30, 'completed');
        insertOrder.run('Electronics', 200, 'cancelled');
        sourceDatabase.close();

        let dataSourceId: string | undefined;
        let csvDataSourceId: string | undefined;
        let workbookId: string | undefined;
        let queryId: string | undefined;
        const chartIds: string[] = [];
        let dashboardId: string | undefined;

        try {
            const dataSourceResponse = await dataSourcesApi.POST(
                postJson('http://localhost/api/data-sources', {
                    name: 'Workflow Orders',
                    type: 'sqlite',
                    config: { path: sourcePath },
                })
            );
            expect(dataSourceResponse.status).toBe(201);
            const dataSource = await readData<DataSourceResponse>(dataSourceResponse);
            dataSourceId = dataSource.id;
            expect(dataSource.name).toBe('Workflow Orders');
            expect(dataSource).not.toHaveProperty('config');

            const workbookResponse = await workbooksApi.POST(
                postJson('http://localhost/api/workbooks', {
                    name: 'Workflow Workbook',
                })
            );
            expect(workbookResponse.status).toBe(201);
            workbookId = (await readData<IdResponse>(workbookResponse)).id;

            const definition = {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'status', op: '=', value: 'completed' }],
                        },
                    },
                    {
                        type: 'summarize',
                        groupBy: [{ column: 'category' }],
                        aggregates: [{ fn: 'sum', column: 'amount', alias: 'revenue' }],
                    },
                    { type: 'order', items: [{ column: 'category', dir: 'asc' }] },
                ],
            };

            const queryResponse = await queriesApi.POST(
                postJson('http://localhost/api/queries', {
                    workbookId,
                    dataSourceId,
                    name: 'Completed Revenue by Category',
                    mode: 'builder',
                    definition: JSON.stringify(definition),
                })
            );
            expect(queryResponse.status).toBe(201);
            const query = await readData<QueryResponse>(queryResponse);
            queryId = query.id;
            expect(query.mode).toBe('builder');
            expect(JSON.parse(query.definition)).toEqual(definition);

            const blockedDeleteResponse = await deleteDataSourceApi.DELETE(
                new Request(`http://localhost/api/data-sources/${dataSourceId}`, { method: 'DELETE' }),
                { params: Promise.resolve({ id: dataSourceId }) }
            );
            expect(blockedDeleteResponse.status).toBe(409);
            const blockedDeletePayload = (await blockedDeleteResponse.json()) as { error: string };
            expect(blockedDeletePayload.error).toContain('1 dependent query uses it');
            expect(blockedDeletePayload.error).toContain('"Completed Revenue by Category"');

            const csvFormData = new FormData();
            csvFormData.set('name', 'Workflow CSV');
            csvFormData.set('file', new Blob(['category,amount\nOffice,30\n'], { type: 'text/csv' }), 'workflow.csv');
            const csvSourceResponse = await uploadCsvDataSourceApi.POST(
                new Request('http://localhost/api/data-sources/upload', {
                    method: 'POST',
                    body: csvFormData,
                })
            );
            expect(csvSourceResponse.status).toBe(201);
            const csvSource = await readData<{ source: DataSourceResponse; rowCount: number }>(csvSourceResponse);
            csvDataSourceId = csvSource.source.id;

            const csvSchemaResponse = await dataSourceSchemaApi.GET(
                new Request(`http://localhost/api/data-sources/${csvDataSourceId}/schema`),
                { params: Promise.resolve({ id: csvDataSourceId }) }
            );
            expect(csvSchemaResponse.status).toBe(200);
            const csvCachePath = path.join(CSV_DIR, `${csvDataSourceId}.db`);
            expect(existsSync(csvCachePath)).toBe(true);

            const csvDeleteResponse = await deleteDataSourceApi.DELETE(
                new Request(`http://localhost/api/data-sources/${csvDataSourceId}`, { method: 'DELETE' }),
                { params: Promise.resolve({ id: csvDataSourceId }) }
            );
            expect(csvDeleteResponse.status).toBe(200);
            expect(existsSync(csvCachePath)).toBe(false);
            csvDataSourceId = undefined;

            const runResponse = await runQueryApi.POST(
                postJson('http://localhost/api/queries/run', {
                    dataSourceId,
                    mode: 'builder',
                    definition,
                })
            );
            const result = await readData<QueryRunResponse>(runResponse);
            expect(result.columns.map((column) => column.name)).toEqual(['category', 'revenue']);
            expect(result.rows).toEqual([
                ['Electronics', 200],
                ['Office', 30],
            ]);
            expect(result.rowCount).toBe(2);
            expect(result.truncated).toBe(false);
            expect(result.sql).toContain('GROUP BY 1');

            const firstChartResponse = await chartsApi.POST(
                postJson('http://localhost/api/charts', {
                    name: 'Revenue by Category',
                    queryId,
                    type: 'bar',
                    config: { xAxis: 'category', yAxis: ['revenue'] },
                })
            );
            expect(firstChartResponse.status).toBe(201);
            const firstChart = await readData<ChartResponse>(firstChartResponse);
            chartIds.push(firstChart.id);
            expect(firstChart.config).toMatchObject({
                xAxis: 'category',
                yAxis: ['revenue'],
            });

            const secondChartResponse = await chartsApi.POST(
                postJson('http://localhost/api/charts', {
                    name: 'Revenue Table',
                    queryId,
                    type: 'table',
                    config: {},
                })
            );
            expect(secondChartResponse.status).toBe(201);
            const secondChart = await readData<ChartResponse>(secondChartResponse);
            chartIds.push(secondChart.id);

            const dashboardResponse = await dashboardsApi.POST(
                postJson('http://localhost/api/dashboards', {
                    workbookId,
                    name: 'Revenue Dashboard',
                })
            );
            expect(dashboardResponse.status).toBe(201);
            dashboardId = (await readData<IdResponse>(dashboardResponse)).id;

            const arrangedLayout = [
                { i: 'revenue-chart', chartId: firstChart.id, x: 2, y: 0, w: 7, h: 5 },
                { i: 'revenue-table', chartId: secondChart.id, x: 0, y: 5, w: 9, h: 4 },
            ];
            const saveLayoutResponse = await dashboardApi.PUT(
                postJson(`http://localhost/api/dashboards/${dashboardId}`, {
                    name: 'Revenue Dashboard',
                    layout: arrangedLayout,
                }),
                { params: Promise.resolve({ id: dashboardId }) }
            );
            expect(saveLayoutResponse.status).toBe(200);
            expect((await readData<DashboardResponse>(saveLayoutResponse)).layout).toEqual(arrangedLayout);

            const reloadResponse = await dashboardApi.GET(
                new Request(`http://localhost/api/dashboards/${dashboardId}`),
                { params: Promise.resolve({ id: dashboardId }) }
            );
            const reloadedDashboard = await readData<DashboardResponse>(reloadResponse);
            expect(reloadedDashboard.name).toBe('Revenue Dashboard');
            expect(reloadedDashboard.layout).toEqual(arrangedLayout);
        } finally {
            try {
                if (dashboardId) {
                    await dashboardApi.DELETE(
                        new Request(`http://localhost/api/dashboards/${dashboardId}`, {
                            method: 'DELETE',
                        }),
                        { params: Promise.resolve({ id: dashboardId }) }
                    );
                }
                for (const chartId of chartIds) {
                    await deleteChartApi.DELETE(
                        new Request(`http://localhost/api/charts/${chartId}`, {
                            method: 'DELETE',
                        }),
                        { params: Promise.resolve({ id: chartId }) }
                    );
                }
                if (queryId) {
                    await deleteQueryApi.DELETE(
                        new Request(`http://localhost/api/queries/${queryId}`, {
                            method: 'DELETE',
                        }),
                        { params: Promise.resolve({ id: queryId }) }
                    );
                }
                if (workbookId) {
                    await deleteWorkbookApi.DELETE(
                        new Request(`http://localhost/api/workbooks/${workbookId}`, {
                            method: 'DELETE',
                        }),
                        { params: Promise.resolve({ id: workbookId }) }
                    );
                }
                if (dataSourceId) {
                    await deleteDataSourceApi.DELETE(
                        new Request(`http://localhost/api/data-sources/${dataSourceId}`, {
                            method: 'DELETE',
                        }),
                        { params: Promise.resolve({ id: dataSourceId }) }
                    );
                }
                if (csvDataSourceId) {
                    await deleteDataSourceApi.DELETE(
                        new Request(`http://localhost/api/data-sources/${csvDataSourceId}`, {
                            method: 'DELETE',
                        }),
                        { params: Promise.resolve({ id: csvDataSourceId }) }
                    );
                }
            } finally {
                rmSync(sourceDirectory, { recursive: true, force: true });
            }
        }
    });
});
