import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { eq } from 'drizzle-orm';
import {
    chartConfigSchema,
    defaultChartConfig,
    type ChartConfigData,
    type ChartType,
} from '@src/lib/schemas';
import { aggregateChartData } from '@src/lib/charts/aggregate';
import { createChart, getChartPublic, updateChart } from '@src/lib/charts/service';
import { db } from '@src/lib/db';
import { queries, workbooks, dataSources, charts, users } from '@src/lib/db/schema';
import { nanoid } from 'nanoid';

describe('Frappe Insights Chart View & Editor Integration', () => {
    let testWorkbookId: string;
    let testQueryId: string;
    let testDataSourceId: string;
    let testChartId: string;

    const sampleOrdersData = [
        { id: 1, order_date: '2016-09-02T10:00:00Z', total_amount: 120, items_count: 2, status: 'completed' },
        { id: 2, order_date: '2016-09-15T14:30:00Z', total_amount: 280, items_count: 4, status: 'completed' },
        { id: 3, order_date: '2016-09-28T09:00:00Z', total_amount: 150, items_count: 1, status: 'pending' },
        { id: 4, order_date: '2016-10-04T11:20:00Z', total_amount: 450, items_count: 5, status: 'completed' },
        { id: 5, order_date: '2016-10-19T16:45:00Z', total_amount: 320, items_count: 3, status: 'pending' },
        { id: 6, order_date: '2016-11-12T13:10:00Z', total_amount: 600, items_count: 6, status: 'completed' },
    ];
    const columnNames = ['id', 'order_date', 'total_amount', 'items_count', 'status'];

    beforeEach(() => {
        // Setup a test workbook, data source, and query in SQLite
        testWorkbookId = 'wb_test_' + nanoid(6);
        testDataSourceId = 'ds_test_' + nanoid(6);
        testQueryId = 'q_test_' + nanoid(6);

        const testUser = db.select().from(users).get()!;

        db.insert(workbooks)
            .values({
                id: testWorkbookId,
                ownerId: testUser.id,
                name: 'Test Retail Workbook',
                description: 'Test environment for Frappe chart view',
            })
            .run();

        db.insert(dataSources)
            .values({
                id: testDataSourceId,
                ownerId: testUser.id,
                name: 'Test SQLite Source',
                type: 'sqlite',
                config: JSON.stringify({ path: ':memory:' }),
            })
            .run();

        db.insert(queries)
            .values({
                id: testQueryId,
                workbookId: testWorkbookId,
                name: 'Raw Orders Query',
                dataSourceId: testDataSourceId,
                mode: 'sql',
                definition: '[]',
                sql: 'SELECT * FROM orders',
            })
            .run();

        // Create an initial chart
        const initial = createChart({
            name: 'Orders Over Time',
            queryId: testQueryId,
            type: 'bar',
            config: {
                ...defaultChartConfig,
                xAxis: 'order_date',
                yAxis: ['total_amount'],
                seriesConfig: [
                    {
                        column: 'total_amount',
                        aggregation: 'sum',
                        label: 'Total Revenue',
                        type: 'bar',
                    },
                ],
            },
        });
        testChartId = initial.id;
    });

    afterEach(() => {
        if (testChartId) {
            db.delete(charts).where(eq(charts.id, testChartId)).run();
        }
        if (testQueryId) {
            db.delete(queries).where(eq(queries.id, testQueryId)).run();
        }
        if (testDataSourceId) {
            db.delete(dataSources).where(eq(dataSources.id, testDataSourceId)).run();
        }
        if (testWorkbookId) {
            db.delete(workbooks).where(eq(workbooks.id, testWorkbookId)).run();
        }
    });

    it('1. Switches between chart types: Bar, Line, Row, Donut, Number, Table', () => {
        const typesToTest: ChartType[] = ['bar', 'line', 'row', 'donut', 'number', 'table'];

        for (const targetType of typesToTest) {
            const updated = updateChart(testChartId, { type: targetType });
            expect(updated.type).toBe(targetType);

            // Verify persistence after reload
            const reloaded = getChartPublic(testChartId);
            expect(reloaded.type).toBe(targetType);
        }
    });

    it('2. Changes X column grain to month: groups dates and formats labels like "September, 2016"', () => {
        // Update config with xDateGrain: 'month'
        const updatedConfig: ChartConfigData = {
            ...defaultChartConfig,
            xAxis: 'order_date',
            xDateGrain: 'month',
            seriesConfig: [
                {
                    column: 'total_amount',
                    aggregation: 'sum',
                    label: 'Total Revenue',
                },
            ],
        };

        updateChart(testChartId, { config: updatedConfig });

        // Reload from DB and verify persisted config
        const reloaded = getChartPublic(testChartId);
        const parsed = chartConfigSchema.parse(reloaded.config);
        expect(parsed.xDateGrain).toBe('month');

        // Test aggregation on sample orders data
        const agg = aggregateChartData(sampleOrdersData, parsed, columnNames);

        // 3 distinct months: September 2016, October 2016, November 2016
        expect(agg.rows).toHaveLength(3);
        expect(agg.rows[0]['order_date']).toBe('September, 2016');
        expect(agg.rows[0]['total_amount']).toBe(550); // 120 + 280 + 150

        expect(agg.rows[1]['order_date']).toBe('October, 2016');
        expect(agg.rows[1]['total_amount']).toBe(770); // 450 + 320

        expect(agg.rows[2]['order_date']).toBe('November, 2016');
        expect(agg.rows[2]['total_amount']).toBe(600);
    });

    it('3. Adds a second series: updates preview and table with multiple metrics', () => {
        const configWithTwoSeries: ChartConfigData = {
            ...defaultChartConfig,
            xAxis: 'order_date',
            xDateGrain: 'month',
            seriesConfig: [
                {
                    column: 'total_amount',
                    aggregation: 'sum',
                    label: 'Total Revenue',
                    color: '#3b82f6',
                    type: 'bar',
                },
                {
                    column: 'items_count',
                    aggregation: 'avg',
                    label: 'Avg Items per Order',
                    color: '#10b981',
                    type: 'line',
                },
            ],
            yAxis: ['total_amount', 'items_count'],
        };

        updateChart(testChartId, { config: configWithTwoSeries });

        // Reload and verify
        const reloaded = getChartPublic(testChartId);
        const parsed = chartConfigSchema.parse(reloaded.config);
        expect(parsed.seriesConfig).toHaveLength(2);
        expect(parsed.seriesConfig[0].column).toBe('total_amount');
        expect(parsed.seriesConfig[1].column).toBe('items_count');
        expect(parsed.seriesConfig[1].aggregation).toBe('avg');

        // Perform aggregation
        const agg = aggregateChartData(sampleOrdersData, parsed, columnNames);
        expect(agg.columnNames).toEqual(['order_date', 'total_amount', 'items_count']);
        expect(agg.seriesKeys).toEqual(['total_amount', 'items_count']);

        // September values:
        // total_amount sum = 120 + 280 + 150 = 550
        // items_count avg = (2 + 4 + 1) / 3 = 7 / 3 ≈ 2.333
        expect(agg.rows[0]['order_date']).toBe('September, 2016');
        expect(agg.rows[0]['total_amount']).toBe(550);
        expect(agg.rows[0]['items_count']).toBe(2.333);
    });

    it('4. Toggles Stack: sets stacked: true and verifies persistence and preview', () => {
        const stackedConfig: ChartConfigData = {
            ...defaultChartConfig,
            xAxis: 'order_date',
            xDateGrain: 'month',
            stacked: true,
            seriesConfig: [
                { column: 'total_amount', aggregation: 'sum', label: 'Revenue' },
                { column: 'items_count', aggregation: 'sum', label: 'Items' },
            ],
        };

        updateChart(testChartId, { config: stackedConfig });

        // Reload from database
        const reloaded = getChartPublic(testChartId);
        const parsed = chartConfigSchema.parse(reloaded.config);
        expect(parsed.stacked).toBe(true);

        const agg = aggregateChartData(sampleOrdersData, parsed, columnNames);
        expect(agg.rows).toHaveLength(3);
        expect(agg.rows[0]['total_amount']).toBe(550);
        expect(agg.rows[0]['items_count']).toBe(7);
    });

    it('5. Donut chart aggregation: groups by category/label and sums values', () => {
        const donutConfig: ChartConfigData = {
            ...defaultChartConfig,
            donutLabelColumn: 'status',
            donutValueColumn: 'total_amount',
            showLegend: true,
        };

        updateChart(testChartId, { type: 'donut', config: donutConfig });

        const reloaded = getChartPublic(testChartId);
        expect(reloaded.type).toBe('donut');
        const parsed = chartConfigSchema.parse(reloaded.config);
        expect(parsed.donutLabelColumn).toBe('status');
        expect(parsed.donutValueColumn).toBe('total_amount');
    });

    it('6. Number card with decimals and comparison: validates config and formatting', () => {
        const numberConfig: ChartConfigData = {
            ...defaultChartConfig,
            numberValueColumn: 'total_amount',
            numberAggregation: 'sum',
            numberPrefix: '$',
            numberSuffix: ' USD',
            numberDecimals: 2,
            numberComparisonColumn: 'items_count',
        };

        updateChart(testChartId, { type: 'number', config: numberConfig });

        const reloaded = getChartPublic(testChartId);
        expect(reloaded.type).toBe('number');
        const parsed = chartConfigSchema.parse(reloaded.config);
        expect(parsed.numberPrefix).toBe('$');
        expect(parsed.numberSuffix).toBe(' USD');
        expect(parsed.numberDecimals).toBe(2);
        expect(parsed.numberComparisonColumn).toBe('items_count');
    });

    it('7. Switches chart type (Bar, Line, Donut, Number), changes X and Y columns, toggles Stack and persists', () => {
        // 1. Bar with X=order_date, Y=total_amount
        updateChart(testChartId, {
            type: 'bar',
            config: {
                ...defaultChartConfig,
                xAxis: 'order_date',
                yAxis: ['total_amount'],
                seriesConfig: [{ column: 'total_amount', aggregation: 'sum', label: 'Revenue' }],
                stacked: false,
            },
        });
        let chart = getChartPublic(testChartId);
        expect(chart.type).toBe('bar');
        expect(chartConfigSchema.parse(chart.config).xAxis).toBe('order_date');
        expect(chartConfigSchema.parse(chart.config).stacked).toBe(false);

        // 2. Line with X=order_date, Y=items_count, Stack=true
        updateChart(testChartId, {
            type: 'line',
            config: {
                ...defaultChartConfig,
                xAxis: 'order_date',
                yAxis: ['items_count'],
                seriesConfig: [{ column: 'items_count', aggregation: 'avg', label: 'Avg Items' }],
                stacked: true,
            },
        });
        chart = getChartPublic(testChartId);
        expect(chart.type).toBe('line');
        expect(chartConfigSchema.parse(chart.config).stacked).toBe(true);
        expect(chartConfigSchema.parse(chart.config).yAxis).toEqual(['items_count']);

        // 3. Donut with label=status, value=total_amount
        updateChart(testChartId, {
            type: 'donut',
            config: {
                ...defaultChartConfig,
                donutLabelColumn: 'status',
                donutValueColumn: 'total_amount',
            },
        });
        chart = getChartPublic(testChartId);
        expect(chart.type).toBe('donut');
        expect(chartConfigSchema.parse(chart.config).donutLabelColumn).toBe('status');
        expect(chartConfigSchema.parse(chart.config).donutValueColumn).toBe('total_amount');

        // 4. Number with value=total_amount
        updateChart(testChartId, {
            type: 'number',
            config: {
                ...defaultChartConfig,
                numberValueColumn: 'total_amount',
                numberAggregation: 'sum',
            },
        });
        chart = getChartPublic(testChartId);
        expect(chart.type).toBe('number');
        expect(chartConfigSchema.parse(chart.config).numberValueColumn).toBe('total_amount');
    });
});

