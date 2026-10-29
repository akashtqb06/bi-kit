import { and, eq } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
    dataSources,
    workbooks,
    queries,
    charts,
    dashboards,
    schemaCache,
    type DataSource,
    type Workbook,
    type Query,
    type Chart,
    type Dashboard,
} from '@src/lib/db/schema';
import { newId } from '@src/lib/db/id';
import { getFinanceCatalogSnapshot } from '../virtual-tables/catalog';
import type { QueryDefinition } from '@src/lib/query-engine/definition';
import type { ChartConfigData, LayoutItem, DashboardFilter } from '@src/lib/schemas';
import '@src/lib/connectors/drivers/finance'; // Ensure finance driver is registered

export interface ProvisionResult {
    dataSource: DataSource;
    workbook: Workbook;
    dashboard: Dashboard;
    queries: Query[];
    charts: Chart[];
}

export const FINANCE_QUERY_DEFINITIONS: {
    name: string;
    definition: QueryDefinition;
}[] = [
    {
        name: 'Monthly Spend',
        definition: {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'type', op: '=', value: 'expense' }],
                    },
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'month_start' }],
                    aggregates: [{ fn: 'sum', column: 'amount', alias: 'spend' }],
                },
                {
                    type: 'order',
                    items: [{ column: 'month_start', dir: 'asc' }],
                },
            ],
        },
    },
    {
        name: 'Spend by Category',
        definition: {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'type', op: '=', value: 'expense' }],
                    },
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'category' }],
                    aggregates: [{ fn: 'sum', column: 'amount', alias: 'total_spend' }],
                },
                {
                    type: 'order',
                    items: [{ column: 'total_spend', dir: 'desc' }],
                },
            ],
        },
    },
    {
        name: 'Income vs Expense',
        definition: {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'type', op: 'in', value: ['income', 'expense'] }],
                    },
                },
                {
                    type: 'mutate',
                    name: 'income_amt',
                    expression: `CASE WHEN "type" = 'income' THEN "amount" ELSE 0.0 END`,
                },
                {
                    type: 'mutate',
                    name: 'expense_amt',
                    expression: `CASE WHEN "type" = 'expense' THEN "amount" ELSE 0.0 END`,
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'month_start' }],
                    aggregates: [
                        { fn: 'sum', column: 'income_amt', alias: 'income' },
                        { fn: 'sum', column: 'expense_amt', alias: 'expense' },
                    ],
                },
                {
                    type: 'order',
                    items: [{ column: 'month_start', dir: 'asc' }],
                },
            ],
        },
    },
    {
        name: 'Net Worth Trend',
        definition: {
            source: { table: 'net_worth_history' },
            steps: [
                {
                    type: 'order',
                    items: [{ column: 'date', dir: 'asc' }],
                },
            ],
        },
    },
    {
        name: 'Balances by Account',
        definition: {
            source: { table: 'account_balances' },
            steps: [
                {
                    type: 'order',
                    items: [{ column: 'balance', dir: 'desc' }],
                },
            ],
        },
    },
    {
        name: 'Credit Card Utilization',
        definition: {
            source: { table: 'account_balances' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'kind', op: '=', value: 'credit_card' }],
                    },
                },
                {
                    type: 'order',
                    items: [{ column: 'utilization', dir: 'desc' }],
                },
            ],
        },
    },
    {
        name: 'Top Payees',
        definition: {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [
                            { column: 'type', op: '=', value: 'expense' },
                            { column: 'payee', op: 'is not null' },
                        ],
                    },
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'payee' }],
                    aggregates: [{ fn: 'sum', column: 'amount', alias: 'total_spend' }],
                },
                {
                    type: 'order',
                    items: [{ column: 'total_spend', dir: 'desc' }],
                },
                {
                    type: 'limit',
                    value: 10,
                },
            ],
        },
    },
    {
        name: 'Savings Rate',
        definition: {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'filter',
                    conditions: {
                        logic: 'and',
                        items: [{ column: 'type', op: 'in', value: ['income', 'expense'] }],
                    },
                },
                {
                    type: 'mutate',
                    name: 'inc',
                    expression: `CASE WHEN "type" = 'income' THEN "amount" ELSE 0.0 END`,
                },
                {
                    type: 'mutate',
                    name: 'exp',
                    expression: `CASE WHEN "type" = 'expense' THEN "amount" ELSE 0.0 END`,
                },
                {
                    type: 'summarize',
                    groupBy: [],
                    aggregates: [
                        { fn: 'sum', column: 'inc', alias: 'total_income' },
                        { fn: 'sum', column: 'exp', alias: 'total_expense' },
                    ],
                },
                {
                    type: 'mutate',
                    name: 'savings_rate',
                    expression: `CASE WHEN "total_income" > 0 THEN ROUND((("total_income" - "total_expense") / "total_income") * 100.0, 1) ELSE 0.0 END`,
                },
            ],
        },
    },
    {
        name: 'Recent Transactions',
        definition: {
            source: { table: 'transactions' },
            steps: [
                {
                    type: 'order',
                    items: [
                        { column: 'date', dir: 'desc' },
                        { column: 'id', dir: 'desc' },
                    ],
                },
                {
                    type: 'limit',
                    value: 50,
                },
            ],
        },
    },
];

export const FINANCE_CHART_DEFINITIONS: {
    name: string;
    queryName: string;
    type: 'bar' | 'line' | 'donut' | 'number' | 'row' | 'table';
    config: Partial<ChartConfigData>;
}[] = [
    {
        name: 'Savings Rate',
        queryName: 'Savings Rate',
        type: 'number',
        config: {
            title: 'Savings Rate',
            numberValueColumn: 'savings_rate',
            numberFormat: 'percent',
            numberSuffix: '%',
        },
    },
    {
        name: 'Credit Card Utilization',
        queryName: 'Credit Card Utilization',
        type: 'row',
        config: {
            title: 'Credit Card Utilization',
            xAxis: 'name',
            yAxis: ['utilization'],
        },
    },
    {
        name: 'Spend by Category',
        queryName: 'Spend by Category',
        type: 'donut',
        config: {
            title: 'Spend by Category',
            donutLabelColumn: 'category',
            donutValueColumn: 'total_spend',
        },
    },
    {
        name: 'Net Worth Trend',
        queryName: 'Net Worth Trend',
        type: 'line',
        config: {
            title: 'Net Worth Trend',
            xAxis: 'date',
            yAxis: ['net_worth'],
        },
    },
    {
        name: 'Monthly Spend',
        queryName: 'Monthly Spend',
        type: 'bar',
        config: {
            title: 'Monthly Spend',
            xAxis: 'month_start',
            yAxis: ['spend'],
        },
    },
    {
        name: 'Income vs Expense',
        queryName: 'Income vs Expense',
        type: 'bar',
        config: {
            title: 'Income vs Expense',
            xAxis: 'month_start',
            yAxis: ['income', 'expense'],
        },
    },
    {
        name: 'Balances by Account',
        queryName: 'Balances by Account',
        type: 'row',
        config: {
            title: 'Balances by Account',
            xAxis: 'name',
            yAxis: ['balance'],
        },
    },
    {
        name: 'Top Payees',
        queryName: 'Top Payees',
        type: 'row',
        config: {
            title: 'Top Payees',
            xAxis: 'payee',
            yAxis: ['total_spend'],
        },
    },
    {
        name: 'Recent Transactions',
        queryName: 'Recent Transactions',
        type: 'table',
        config: {
            title: 'Recent Transactions',
        },
    },
];

/**
 * Idempotently provisions the personal finance workspace for a user:
 * 1. "My Finance" data source (built-in finance connector)
 * 2. "Personal Finance" workbook
 * 3. 9 reporting queries
 * 4. 8 visual charts + 1 transactions table
 * 5. "Money Overview" dashboard with 12-column layout and date range filter
 */
export async function provisionFinanceWorkspace(userId: string): Promise<ProvisionResult> {
    const now = new Date();

    // 1. Get or create "My Finance" DataSource
    const [existingDs] = await db
        .select()
        .from(dataSources)
        .where(and(eq(dataSources.type, 'finance'), eq(dataSources.ownerId, userId)))
        .limit(1);

    let dataSource: DataSource;
    if (existingDs) {
        dataSource = existingDs;
    } else {
        const [createdDs] = await db
            .insert(dataSources)
            .values({
                id: newId(),
                ownerId: userId,
                name: 'My Finance',
                slug: `my-finance-${userId}`,
                type: 'finance',
                config: { isBuiltin: true, userId },
                status: 'ok',
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        dataSource = createdDs;
    }

    // Pre-warm schema cache for data source
    const snapshot = getFinanceCatalogSnapshot();
    await db
        .insert(schemaCache)
        .values({
            dataSourceId: dataSource.id,
            snapshot,
            fetchedAt: now,
        })
        .onConflictDoUpdate({
            target: schemaCache.dataSourceId,
            set: {
                snapshot,
                fetchedAt: now,
            },
        });

    // 2. Get or create "Personal Finance" Workbook
    const [existingWb] = await db
        .select()
        .from(workbooks)
        .where(and(eq(workbooks.name, 'Personal Finance'), eq(workbooks.ownerId, userId)))
        .limit(1);

    let workbook: Workbook;
    if (existingWb) {
        workbook = existingWb;
    } else {
        const [createdWb] = await db
            .insert(workbooks)
            .values({
                id: newId(),
                ownerId: userId,
                name: 'Personal Finance',
                slug: `personal-finance-${userId}`,
                description: 'Personal finance overview and financial health analytics',
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        workbook = createdWb;
    }

    // 3. Get or create Queries
    const existingQueries = await db
        .select()
        .from(queries)
        .where(eq(queries.workbookId, workbook.id));

    const queryMap = new Map<string, Query>();
    for (const q of existingQueries) {
        queryMap.set(q.name, q);
    }

    const createdQueries: Query[] = [];
    for (const qDef of FINANCE_QUERY_DEFINITIONS) {
        let q = queryMap.get(qDef.name);
        if (!q) {
            const [inserted] = await db
                .insert(queries)
                .values({
                    id: newId(),
                    workbookId: workbook.id,
                    dataSourceId: dataSource.id,
                    name: qDef.name,
                    mode: 'builder',
                    definition: qDef.definition,
                    sql: '',
                    createdBy: userId,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            q = inserted;
            queryMap.set(qDef.name, q);
        }
        createdQueries.push(q);
    }

    // 4. Get or create Charts
    const existingCharts = await db
        .select()
        .from(charts)
        .where(eq(charts.workbookId, workbook.id));

    const chartMap = new Map<string, Chart>();
    for (const c of existingCharts) {
        chartMap.set(c.name, c);
    }

    const createdCharts: Chart[] = [];
    for (const cDef of FINANCE_CHART_DEFINITIONS) {
        let c = chartMap.get(cDef.name);
        const query = queryMap.get(cDef.queryName);
        if (!query) continue;

        if (!c) {
            const [inserted] = await db
                .insert(charts)
                .values({
                    id: newId(),
                    workbookId: workbook.id,
                    queryId: query.id,
                    name: cDef.name,
                    type: cDef.type,
                    config: cDef.config,
                    createdBy: userId,
                    createdAt: now,
                    updatedAt: now,
                })
                .returning();
            c = inserted;
            chartMap.set(cDef.name, c);
        }
        createdCharts.push(c);
    }

    // 5. Get or create "Money Overview" Dashboard
    const [existingDash] = await db
        .select()
        .from(dashboards)
        .where(and(eq(dashboards.workbookId, workbook.id), eq(dashboards.name, 'Money Overview')))
        .limit(1);

    let dashboard: Dashboard;
    if (existingDash) {
        dashboard = existingDash;
    } else {
        // Construct 12-column layout
        const layout: LayoutItem[] = [
            {
                i: chartMap.get('Savings Rate')?.id ?? 'savings-rate',
                chartId: chartMap.get('Savings Rate')?.id,
                widgetType: 'chart',
                chartType: 'number',
                title: 'Savings Rate',
                x: 0,
                y: 0,
                w: 6,
                h: 4,
            },
            {
                i: chartMap.get('Credit Card Utilization')?.id ?? 'cc-utilization',
                chartId: chartMap.get('Credit Card Utilization')?.id,
                widgetType: 'chart',
                chartType: 'row',
                title: 'Credit Card Utilization',
                x: 6,
                y: 0,
                w: 6,
                h: 4,
            },
            {
                i: chartMap.get('Net Worth Trend')?.id ?? 'net-worth-trend',
                chartId: chartMap.get('Net Worth Trend')?.id,
                widgetType: 'chart',
                chartType: 'line',
                title: 'Net Worth Trend',
                x: 0,
                y: 4,
                w: 7,
                h: 7,
            },
            {
                i: chartMap.get('Spend by Category')?.id ?? 'spend-category',
                chartId: chartMap.get('Spend by Category')?.id,
                widgetType: 'chart',
                chartType: 'donut',
                title: 'Spend by Category',
                x: 7,
                y: 4,
                w: 5,
                h: 7,
            },
            {
                i: chartMap.get('Monthly Spend')?.id ?? 'monthly-spend',
                chartId: chartMap.get('Monthly Spend')?.id,
                widgetType: 'chart',
                chartType: 'bar',
                title: 'Monthly Spend',
                x: 0,
                y: 11,
                w: 6,
                h: 6,
            },
            {
                i: chartMap.get('Income vs Expense')?.id ?? 'income-expense',
                chartId: chartMap.get('Income vs Expense')?.id,
                widgetType: 'chart',
                chartType: 'bar',
                title: 'Income vs Expense',
                x: 6,
                y: 11,
                w: 6,
                h: 6,
            },
            {
                i: chartMap.get('Balances by Account')?.id ?? 'account-balances',
                chartId: chartMap.get('Balances by Account')?.id,
                widgetType: 'chart',
                chartType: 'row',
                title: 'Balances by Account',
                x: 0,
                y: 17,
                w: 6,
                h: 6,
            },
            {
                i: chartMap.get('Top Payees')?.id ?? 'top-payees',
                chartId: chartMap.get('Top Payees')?.id,
                widgetType: 'chart',
                chartType: 'row',
                title: 'Top Payees',
                x: 6,
                y: 17,
                w: 6,
                h: 6,
            },
            {
                i: chartMap.get('Recent Transactions')?.id ?? 'recent-transactions',
                chartId: chartMap.get('Recent Transactions')?.id,
                widgetType: 'chart',
                chartType: 'table',
                title: 'Recent Transactions',
                x: 0,
                y: 23,
                w: 12,
                h: 8,
            },
        ];

        const filters: DashboardFilter[] = [
            {
                id: 'date-filter',
                name: 'Date Range',
                column: 'date',
                type: 'date_range',
            },
        ];

        const [createdDash] = await db
            .insert(dashboards)
            .values({
                id: newId(),
                workbookId: workbook.id,
                ownerId: userId,
                name: 'Money Overview',
                slug: `money-overview-${userId}`,
                layout,
                filters,
                createdBy: userId,
                createdAt: now,
                updatedAt: now,
            })
            .returning();
        dashboard = createdDash;
    }

    return {
        dataSource,
        workbook,
        dashboard,
        queries: createdQueries,
        charts: createdCharts,
    };
}
