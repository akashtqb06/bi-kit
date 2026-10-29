import { eq } from 'drizzle-orm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { db } from '@src/lib/db';
import { charts, dashboards, dataSources, folders, queries, users, workbooks, type User } from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import { SqliteConnector } from '@src/lib/connectors/sqlite-connector';
import type { SqlParam } from '@src/lib/connectors/types';
import { compile } from '@src/lib/query-engine/compiler';
import { queryDefinitionSchema, type QueryDefinition } from '@src/lib/query-engine/definition';
import { chartConfigSchema, type ChartConfigData, type LayoutItem } from '@src/lib/schemas';
import { APP_DB_PATH, SAMPLE_DB_PATH } from '@src/lib/db/paths';
import { assertTestIsolationGuard } from '@src/lib/db/guard';
import { seedUsers } from './users';

const adminSourceName = 'Demo Store';
const adminSourceSlug = 'demo-store';
const adminWorkbookName = 'Order Analysis';
const adminWorkbookSlug = 'order-analysis';
const adminDashboardName = 'Sales Overview';
const adminDashboardSlug = 'sales-overview';

const memberSourceName = 'Demo Store';
const memberSourceSlug = 'demo-store-member';
const memberWorkbookName = 'My First Workbook';
const memberWorkbookSlug = 'my-first-workbook';
const memberDashboardName = 'Member Overview';
const memberDashboardSlug = 'member-overview';

const adminQueryDefinitions: { name: string; definition: QueryDefinition }[] = [
    {
        name: 'Orders',
        definition: {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'summarize',
                    groupBy: [],
                    aggregates: [{ fn: 'count', column: 'order_id', alias: 'order_count' }],
                },
            ],
        },
    },
    {
        name: 'Delivered Orders',
        definition: {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'filter',
                    conditions: { logic: 'and', items: [{ column: 'order_status', op: '=', value: 'delivered' }] },
                },
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'order_items',
                    on: [{ left: 'order_id', right: 'order_id' }],
                },
                { type: 'mutate', name: 'order_value', expression: '"quantity" * "price"' },
            ],
        },
    },
    {
        name: 'Revenue by Month',
        definition: {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'filter',
                    conditions: { logic: 'and', items: [{ column: 'order_status', op: '=', value: 'delivered' }] },
                },
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'order_items',
                    on: [{ left: 'order_id', right: 'order_id' }],
                },
                { type: 'mutate', name: 'order_value', expression: '"quantity" * "price"' },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'order_purchase_timestamp', dateGrain: 'month' }],
                    aggregates: [
                        { fn: 'sum', column: 'order_value', alias: 'revenue' },
                        { fn: 'count_distinct', column: 'order_id', alias: 'order_count' },
                    ],
                },
                { type: 'order', items: [{ column: 'order_purchase_timestamp', dir: 'asc' }] },
            ],
        },
    },
    {
        name: 'Revenue by Category',
        definition: {
            source: { table: 'order_items' },
            steps: [
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'products',
                    on: [{ left: 'product_id', right: 'product_id' }],
                },
                { type: 'mutate', name: 'revenue', expression: '"quantity" * "price"' },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'category' }],
                    aggregates: [{ fn: 'sum', column: 'revenue', alias: 'revenue' }],
                },
                { type: 'order', items: [{ column: 'revenue', dir: 'desc' }] },
            ],
        },
    },
    {
        name: 'Customers by Region',
        definition: {
            source: { table: 'customers' },
            steps: [
                {
                    type: 'join',
                    joinType: 'inner',
                    table: 'orders',
                    on: [{ left: 'customer_id', right: 'customer_id' }],
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'region' }],
                    aggregates: [{ fn: 'count_distinct', column: 'customer_id', alias: 'customer_count' }],
                },
                { type: 'order', items: [{ column: 'customer_count', dir: 'desc' }] },
            ],
        },
    },
];

const adminChartDefinitions: {
    name: string;
    queryName: string;
    type: 'bar' | 'line' | 'donut' | 'number' | 'row';
    config: Partial<ChartConfigData>;
    layout: Omit<LayoutItem, 'i' | 'chartId'>;
}[] = [
    {
        name: 'Total Orders',
        queryName: 'Orders',
        type: 'number',
        config: {
            title: 'Total Orders',
            numberValueColumn: 'order_count',
            numberAggregation: 'first',
            numberFormat: 'number',
        },
        layout: { x: 0, y: 0, w: 3, h: 3 },
    },
    {
        name: 'Revenue by Month',
        queryName: 'Revenue by Month',
        type: 'bar',
        config: {
            title: 'Revenue by Month',
            xAxis: 'order_purchase_timestamp',
            yAxis: ['revenue'],
            seriesConfig: [{ column: 'revenue', aggregation: 'sum' }],
            numberFormat: 'currency',
        },
        layout: { x: 0, y: 3, w: 6, h: 5 },
    },
    {
        name: 'Revenue Trend',
        queryName: 'Revenue by Month',
        type: 'line',
        config: {
            title: 'Revenue Trend',
            xAxis: 'order_purchase_timestamp',
            yAxis: ['revenue'],
            seriesConfig: [{ column: 'revenue', aggregation: 'sum' }],
            numberFormat: 'currency',
        },
        layout: { x: 6, y: 3, w: 6, h: 5 },
    },
    {
        name: 'Revenue by Category',
        queryName: 'Revenue by Category',
        type: 'donut',
        config: {
            title: 'Revenue by Category',
            donutLabelColumn: 'category',
            donutValueColumn: 'revenue',
            numberFormat: 'currency',
        },
        layout: { x: 0, y: 8, w: 6, h: 5 },
    },
    {
        name: 'Customers by Region',
        queryName: 'Customers by Region',
        type: 'row',
        config: {
            title: 'Customers by Region',
            xAxis: 'region',
            yAxis: ['customer_count'],
            seriesConfig: [{ column: 'customer_count', aggregation: 'sum' }],
        },
        layout: { x: 6, y: 8, w: 6, h: 5 },
    },
];

const memberQueryDefinitions: { name: string; definition: QueryDefinition }[] = [
    {
        name: 'Customer Count by Region',
        definition: {
            source: { table: 'customers' },
            steps: [
                {
                    type: 'summarize',
                    groupBy: [{ column: 'region' }],
                    aggregates: [{ fn: 'count', column: 'customer_id', alias: 'customer_count' }],
                },
                { type: 'order', items: [{ column: 'customer_count', dir: 'desc' }] },
            ],
        },
    },
];

const memberChartDefinitions: {
    name: string;
    queryName: string;
    type: 'bar' | 'line' | 'donut' | 'number' | 'row';
    config: Partial<ChartConfigData>;
    layout: Omit<LayoutItem, 'i' | 'chartId'>;
}[] = [
    {
        name: 'Customers by Region',
        queryName: 'Customer Count by Region',
        type: 'row',
        config: {
            title: 'Customers by Region',
            xAxis: 'region',
            yAxis: ['customer_count'],
            seriesConfig: [{ column: 'customer_count', aggregation: 'sum' }],
        },
        layout: { x: 0, y: 0, w: 12, h: 6 },
    },
];

async function seedWorkbookEntities(params: {
    owner: User;
    sourceName: string;
    sourceSlug: string;
    workbookName: string;
    workbookSlug: string;
    dashboardName: string;
    dashboardSlug: string;
    queriesList: { name: string; definition: QueryDefinition }[];
    chartsList: {
        name: string;
        queryName: string;
        type: 'bar' | 'line' | 'donut' | 'number' | 'row';
        config: Partial<ChartConfigData>;
        layout: Omit<LayoutItem, 'i' | 'chartId'>;
    }[];
}): Promise<{ sourceId: string; workbookId: string; queryCount: number; chartCount: number; dashboardId: string }> {
    const {
        owner,
        sourceName,
        sourceSlug,
        workbookName,
        workbookSlug,
        dashboardName,
        dashboardSlug,
        queriesList,
        chartsList,
    } = params;

    // 1. Data Source (Upsert by stable slug)
    const existingSourceList = await db
        .select()
        .from(dataSources)
        .where(eq(dataSources.slug, sourceSlug));
    const existingSource = existingSourceList[0];

    const sourceId = existingSource?.id ?? newId();
    const now = new Date();

    const managedRel = `files/${sourceId}/data.db`;
    const dataDir = process.env.DATA_DIR || path.resolve(process.cwd(), 'data');
    const managedAbs = path.join(dataDir, managedRel);
    fs.mkdirSync(path.dirname(managedAbs), { recursive: true });
    fs.copyFileSync(SAMPLE_DB_PATH, managedAbs);

    const sourceConfig = {
        managedPath: managedRel,
        fileName: 'sample.db',
        importedAt: now.toISOString(),
        size: fs.statSync(managedAbs).size,
    };

    if (existingSource) {
        await db.update(dataSources)
            .set({
                ownerId: owner.id,
                name: sourceName,
                slug: sourceSlug,
                type: 'sqlite',
                status: 'ok',
                lastTestedAt: now,
                config: sourceConfig,
                updatedAt: now,
            })
            .where(eq(dataSources.id, sourceId));
    } else {
        await db.insert(dataSources)
            .values({
                id: sourceId,
                ownerId: owner.id,
                name: sourceName,
                slug: sourceSlug,
                type: 'sqlite',
                status: 'ok',
                lastTestedAt: now,
                config: sourceConfig,
                createdAt: now,
                updatedAt: now,
            });
    }

    // 2. Workbook (Upsert by stable slug)
    const existingWorkbookList = await db
        .select()
        .from(workbooks)
        .where(eq(workbooks.slug, workbookSlug));
    const existingWorkbook = existingWorkbookList[0];

    const workbookId = existingWorkbook?.id ?? newId();

    if (existingWorkbook) {
        await db.update(workbooks)
            .set({
                ownerId: owner.id,
                name: workbookName,
                slug: workbookSlug,
                description: `${workbookName} - Seeded workbook for ${owner.name}`,
                updatedAt: now,
            })
            .where(eq(workbooks.id, workbookId));

        // Clear existing children to prevent duplicates upon re-seeding
        await db.delete(charts).where(eq(charts.workbookId, workbookId));
        await db.delete(queries).where(eq(queries.workbookId, workbookId));
        await db.delete(dashboards).where(eq(dashboards.workbookId, workbookId));
        await db.delete(folders).where(eq(folders.workbookId, workbookId));
    } else {
        await db.insert(workbooks)
            .values({
                id: workbookId,
                ownerId: owner.id,
                name: workbookName,
                slug: workbookSlug,
                description: `${workbookName} - Seeded workbook for ${owner.name}`,
            });
    }

    // Folders (Order Analysis demo: "Revenue" folders for Queries and Charts)
    let queryRevenueFolderId: string | null = null;
    let chartRevenueFolderId: string | null = null;

    if (workbookSlug === adminWorkbookSlug) {
        queryRevenueFolderId = newId();
        await db.insert(folders)
            .values({
                id: queryRevenueFolderId,
                workbookId,
                kind: 'query',
                name: 'Revenue',
                position: 0,
            });

        chartRevenueFolderId = newId();
        await db.insert(folders)
            .values({
                id: chartRevenueFolderId,
                workbookId,
                kind: 'chart',
                name: 'Revenue',
                position: 0,
            });
    }

    // 3. Queries
    const queryIds = new Map<string, string>();
    for (const { name, definition } of queriesList) {
        const id = newId();
        queryIds.set(name, id);
        const queryFolderId =
            queryRevenueFolderId && (name === 'Revenue by Month' || name === 'Revenue by Category')
                ? queryRevenueFolderId
                : null;

        await db.insert(queries)
            .values({
                id,
                workbookId,
                name,
                dataSourceId: sourceId,
                mode: 'builder',
                definition,
                sql: '',
                folderId: queryFolderId,
                position: 0,
            });
    }

    // 4. Charts & Dashboard layout
    const layout: LayoutItem[] = [];
    for (const chart of chartsList) {
        const queryId = queryIds.get(chart.queryName);
        if (!queryId) throw new Error(`Missing seeded query: ${chart.queryName}`);
        const id = newId();
        const revenueChartNames = ['Revenue by Month', 'Revenue Trend', 'Revenue by Category'];
        const chartFolderId =
            chartRevenueFolderId && revenueChartNames.includes(chart.name)
                ? chartRevenueFolderId
                : null;

        await db.insert(charts)
            .values({
                id,
                workbookId,
                queryId,
                name: chart.name,
                type: chart.type,
                config: chartConfigSchema.parse(chart.config) as Record<string, unknown>,
                folderId: chartFolderId,
                position: 0,
            });
        layout.push({ i: id, chartId: id, ...chart.layout });
    }

    // 5. Dashboard
    const dashboardId = newId();
    await db.insert(dashboards)
        .values({
            id: dashboardId,
            ownerId: owner.id,
            workbookId,
            name: dashboardName,
            slug: dashboardSlug,
            layout,
            filters: [],
            autoRefresh: 'off',
        });

    return {
        sourceId,
        workbookId,
        queryCount: queriesList.length,
        chartCount: chartsList.length,
        dashboardId,
    };
}

export async function seedSampleWorkbook(targetUserId?: string): Promise<void> {
    assertTestIsolationGuard(APP_DB_PATH);
    const startedAt = performance.now();

    if (!fs.existsSync(SAMPLE_DB_PATH)) {
        throw new Error(`Sample database is missing at ${SAMPLE_DB_PATH}; run the demo data seed first.`);
    }
    fs.mkdirSync(path.dirname(APP_DB_PATH), { recursive: true });

    // If specific target user requested (e.g. from UI 'Load sample data')
    if (targetUserId) {
        let [user] = await db.select().from(users).where(eq(users.id, targetUserId));
        if (!user) {
            const seeded = await seedUsers();
            user = seeded.admin;
        }

        const isUserAdmin = user.role === 'admin';
        const sourceSlug = isUserAdmin ? adminSourceSlug : `${adminSourceSlug}-${user.id}`;
        const workbookSlug = isUserAdmin ? adminWorkbookSlug : `${adminWorkbookSlug}-${user.id}`;
        const dashboardSlug = isUserAdmin ? adminDashboardSlug : `${adminDashboardSlug}-${user.id}`;

        await seedWorkbookEntities({
            owner: user,
            sourceName: adminSourceName,
            sourceSlug,
            workbookName: adminWorkbookName,
            workbookSlug,
            dashboardName: adminDashboardName,
            dashboardSlug,
            queriesList: adminQueryDefinitions,
            chartsList: adminChartDefinitions,
        });

        console.log(`Seeded sample workbook for user ${user.email} (${user.id}) in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`);
        return;
    }

    // Full seed mode: ensure users exist
    let [admin] = await db.select().from(users).where(eq(users.email, (process.env.SEED_ADMIN_EMAIL ?? 'admin@example.com').trim().toLowerCase()));
    let [member] = await db.select().from(users).where(eq(users.email, (process.env.SEED_DEMO_USER_EMAIL ?? 'member@example.com').trim().toLowerCase()));

    if (!admin || !member) {
        const seeded = await seedUsers();
        admin = seeded.admin;
        member = seeded.member;
    }

    // Seed Admin Workbook & Entities
    await seedWorkbookEntities({
        owner: admin,
        sourceName: adminSourceName,
        sourceSlug: adminSourceSlug,
        workbookName: adminWorkbookName,
        workbookSlug: adminWorkbookSlug,
        dashboardName: adminDashboardName,
        dashboardSlug: adminDashboardSlug,
        queriesList: adminQueryDefinitions,
        chartsList: adminChartDefinitions,
    });

    // Seed Member Workbook & Entities
    await seedWorkbookEntities({
        owner: member,
        sourceName: memberSourceName,
        sourceSlug: memberSourceSlug,
        workbookName: memberWorkbookName,
        workbookSlug: memberWorkbookSlug,
        dashboardName: memberDashboardName,
        dashboardSlug: memberDashboardSlug,
        queriesList: memberQueryDefinitions,
        chartsList: memberChartDefinitions,
    });

    // Execute every seeded query through SqliteConnector to verify correctness and non-empty results
    const connector = new SqliteConnector(SAMPLE_DB_PATH);
    const schema = connector.getSchema();
    try {
        const allQueryDefs = [...adminQueryDefinitions, ...memberQueryDefinitions];
        for (const queryDef of allQueryDefs) {
            const parsed = queryDefinitionSchema.parse(queryDef.definition);
            const compiled = compile(parsed, { schema });
            const result = await connector.execute(compiled.sql, compiled.params as SqlParam[], {
                limit: 1000,
                timeoutMs: 10000,
            });
            if (result.rowCount === 0) {
                throw new Error(`Seeded query returned zero rows: "${queryDef.name}"`);
            }
            console.log(`Validated seeded query "${queryDef.name}": ${result.rowCount.toLocaleString()} rows`);
        }
    } finally {
        connector.close();
    }

    // Assert final counts
    const adminSources = await db.select().from(dataSources).where(eq(dataSources.ownerId, admin.id));
    const adminWorkbooks = await db.select().from(workbooks).where(eq(workbooks.ownerId, admin.id));
    const adminDashboards = await db.select().from(dashboards).where(eq(dashboards.ownerId, admin.id));

    const memberSources = await db.select().from(dataSources).where(eq(dataSources.ownerId, member.id));
    const memberWorkbooks = await db.select().from(workbooks).where(eq(workbooks.ownerId, member.id));
    const memberDashboards = await db.select().from(dashboards).where(eq(dashboards.ownerId, member.id));

    const adminWbId = adminWorkbooks[0]?.id;
    let adminQueries = adminWbId ? await db.select().from(queries).where(eq(queries.workbookId, adminWbId)) : [];
    const adminCharts = adminWbId ? await db.select().from(charts).where(eq(charts.workbookId, adminWbId)) : [];

    const memberWbId = memberWorkbooks[0]?.id;
    const memberQueries = memberWbId ? await db.select().from(queries).where(eq(queries.workbookId, memberWbId)) : [];
    const memberCharts = memberWbId ? await db.select().from(charts).where(eq(charts.workbookId, memberWbId)) : [];

    // Optional external databases seeding
    if (process.env.SEED_EXTERNAL === 'true' && adminWbId) {
        console.log('SEED_EXTERNAL=true: creating external demo sources and queries...');
        const pgId = newId();
        const pgConfig = {
            host: process.env.PG_HOST || 'localhost',
            port: Number(process.env.PG_PORT || 5433),
            database: process.env.PG_DATABASE || 'bikit_dev',
            username: process.env.PG_USER || 'postgres',
            password: process.env.PG_PASSWORD || 'bi_password_123!',
            ssl: 'disable',
        };
        await db.insert(dataSources)
            .values({
                id: pgId,
                ownerId: admin.id,
                name: 'PostgreSQL Demo',
                slug: 'postgresql-demo',
                type: 'postgres',
                config: pgConfig,
                status: 'ok',
            });

        await db.insert(queries)
            .values({
                id: newId(),
                workbookId: adminWbId,
                dataSourceId: pgId,
                name: 'PostgreSQL Customers',
                mode: 'sql',
                definition: { source: { table: 'customers' }, steps: [] },
                sql: 'SELECT customer_id, name, city, state, region FROM "customers" LIMIT 50',
            });

        const mysqlId = newId();
        const mysqlConfig = {
            host: process.env.MYSQL_HOST || 'localhost',
            port: Number(process.env.MYSQL_PORT || 3307),
            database: process.env.MYSQL_DATABASE || 'bikit_dev',
            username: process.env.MYSQL_USER || 'mysql',
            password: process.env.MYSQL_PASSWORD || 'bi_password_123!',
            ssl: 'disable',
        };
        await db.insert(dataSources)
            .values({
                id: mysqlId,
                ownerId: admin.id,
                name: 'MySQL Demo',
                slug: 'mysql-demo',
                type: 'mysql',
                config: mysqlConfig,
                status: 'ok',
            });

        await db.insert(queries)
            .values({
                id: newId(),
                workbookId: adminWbId,
                dataSourceId: mysqlId,
                name: 'MySQL Products',
                mode: 'sql',
                definition: { source: { table: 'products' }, steps: [] },
                sql: 'SELECT product_id, name, category, price FROM `products` LIMIT 50',
            });

        const mongoId = newId();
        const mongoConfig = {
            mode: 'host',
            host: process.env.MONGO_HOST || 'localhost',
            port: Number(process.env.MONGO_PORT || 27018),
            database: process.env.MONGO_DATABASE || 'bikit_dev',
            username: process.env.MONGO_USER || 'mongoadmin',
            password: process.env.MONGO_PASSWORD || 'bi_password_123!',
            authSource: 'admin',
        };
        await db.insert(dataSources)
            .values({
                id: mongoId,
                ownerId: admin.id,
                name: 'MongoDB Demo',
                slug: 'mongodb-demo',
                type: 'mongodb',
                config: mongoConfig,
                status: 'ok',
            });

        await db.insert(queries)
            .values({
                id: newId(),
                workbookId: adminWbId,
                dataSourceId: mongoId,
                name: 'MongoDB Reviews Pipeline',
                mode: 'pipeline',
                definition: { source: { table: 'reviews' }, steps: [] },
                sql: '[\n  {\n    "$match": { "score": { "$gte": 4 } }\n  },\n  {\n    "$limit": 50\n  }\n]',
            });

        adminQueries = await db.select().from(queries).where(eq(queries.workbookId, adminWbId));
    }

    const expectedAdminSources = process.env.SEED_EXTERNAL === 'true' ? 4 : 1;
    const expectedAdminQueries = process.env.SEED_EXTERNAL === 'true' ? 8 : 5;

    if (
        adminSources.length !== expectedAdminSources ||
        adminWorkbooks.length !== 1 ||
        adminQueries.length !== expectedAdminQueries ||
        adminCharts.length !== 5 ||
        adminDashboards.length !== 1 ||
        memberSources.length !== 1 ||
        memberWorkbooks.length !== 1 ||
        memberQueries.length !== 1 ||
        memberCharts.length !== 1 ||
        memberDashboards.length !== 1
    ) {
        console.error('Seeding count assertion failed!');
        console.error(`Admin: sources=${adminSources.length} (exp 1), workbooks=${adminWorkbooks.length} (exp 1), queries=${adminQueries.length} (exp 5), charts=${adminCharts.length} (exp 5), dashboards=${adminDashboards.length} (exp 1)`);
        console.error(`Member: sources=${memberSources.length} (exp 1), workbooks=${memberWorkbooks.length} (exp 1), queries=${memberQueries.length} (exp 1), charts=${memberCharts.length} (exp 1), dashboards=${memberDashboards.length} (exp 1)`);
        throw new Error('Seeding assertion failed: expected exact entity counts for admin and member.');
    }

    console.log(
        `Seeded admin (${admin.email}) and member (${member.email}) workbooks and verified all 6 queries in ${((performance.now() - startedAt) / 1000).toFixed(1)}s.`
    );
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    seedSampleWorkbook()
        .then(() => {
            process.exit(0);
        })
        .catch((error: unknown) => {
            console.error('Sample workbook seed failed:', error);
            process.exit(1);
        });
}
