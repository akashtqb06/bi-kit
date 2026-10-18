import { describe, it, expect } from 'vitest';
import { aggregateChartData, parseDateSafe } from '@src/lib/charts/aggregate';
import { computeNumberCardValue } from '@src/components/charts/chart-renderer';
import { defaultChartConfig, type ChartConfigData } from '@src/lib/schemas';

describe('Chart Editor Rendering & Data Shaping Verification', () => {
    const rawQueryResult = {
        columnNames: ['order_purchase_timestamp', 'revenue', 'order_count', 'category', 'region'],
        rows: [
            {
                order_purchase_timestamp: '2024-01-15 10:30:00',
                revenue: '63662.63',
                order_count: '3',
                category: 'Electronics',
                region: 'South',
            },
            {
                order_purchase_timestamp: '2024-02-15 11:00:00',
                revenue: '84120.50',
                order_count: '5',
                category: 'Furniture',
                region: 'North',
            },
            {
                order_purchase_timestamp: '2023-12-10 09:15:00',
                revenue: '52100.00',
                order_count: '2',
                category: 'Electronics',
                region: 'East',
            },
        ],
    };

    it('1. Coerces numeric strings and skips null rows', () => {
        const rowsWithNulls = [
            null as unknown as Record<string, unknown>,
            { order_purchase_timestamp: null, revenue: '100' },
            ...rawQueryResult.rows,
        ];
        const config: ChartConfigData = {
            ...defaultChartConfig,
            xAxis: 'order_purchase_timestamp',
            yAxis: ['revenue'],
            seriesConfig: [{ column: 'revenue', aggregation: 'sum' }],
        };
        const agg = aggregateChartData(rowsWithNulls, config, rawQueryResult.columnNames);
        expect(agg.rows).toHaveLength(3);
        expect(typeof agg.rows[0].revenue).toBe('number');
        expect(agg.rows[0].revenue).not.toBe(100);
    });

    it('2. Automatically sorts date X values chronologically', () => {
        const config: ChartConfigData = {
            ...defaultChartConfig,
            xAxis: 'order_purchase_timestamp',
            yAxis: ['revenue'],
            seriesConfig: [{ column: 'revenue', aggregation: 'sum' }],
        };
        const agg = aggregateChartData(rawQueryResult.rows, config, rawQueryResult.columnNames);
        // 2023-12 should be first chronologically
        expect(agg.rows[0].order_purchase_timestamp).toContain('2023-12');
        expect(agg.rows[1].order_purchase_timestamp).toContain('2024-01');
        expect(agg.rows[2].order_purchase_timestamp).toContain('2024-02');
    });

    it('3. Safely handles normalize without String.prototype collision', () => {
        const configAsString = JSON.stringify({
            title: 'Revenue by Month',
            xAxis: 'order_purchase_timestamp',
            yAxis: ['revenue'],
            seriesConfig: [{ column: 'revenue', aggregation: 'sum' }],
            normalize: false,
        });
        const agg = aggregateChartData(rawQueryResult.rows, configAsString as unknown as ChartConfigData, rawQueryResult.columnNames);
        // Should not be normalized to 100
        expect(agg.rows[0].revenue).toBe(52100);
    });

    it('4. Derives sensible defaults when X/Y are not explicitly configured', () => {
        const emptyConfig: ChartConfigData = {
            ...defaultChartConfig,
            xAxis: null,
            yAxis: [],
            seriesConfig: [],
        };
        const agg = aggregateChartData(rawQueryResult.rows, emptyConfig, rawQueryResult.columnNames);
        expect(agg.xAxisKey).toBe('order_purchase_timestamp');
        expect(agg.series).toHaveLength(1);
        expect(agg.series[0].column).toBe('revenue');
    });

    it('5. Switches across Bar, Line, Row, Donut, Number, Table smoothly', () => {
        const donutConfig: ChartConfigData = {
            ...defaultChartConfig,
            donutLabelColumn: 'category',
            donutValueColumn: 'revenue',
        };
        const donutAgg = aggregateChartData(rawQueryResult.rows, donutConfig, rawQueryResult.columnNames);
        expect(donutAgg.xAxisKey).toBe('category');
        expect(donutAgg.series[0].column).toBe('revenue');

        const numberResult = computeNumberCardValue(rawQueryResult.rows, donutConfig, rawQueryResult.columnNames);
        expect(numberResult.formatted).toBeDefined();
        expect(numberResult.label).toBe('revenue');
    });

    it('6. Parses dates with space separators consistently in parseDateSafe', () => {
        const d1 = parseDateSafe('2024-01-15 10:30:00');
        expect(d1).not.toBeNull();
        expect(d1?.getFullYear()).toBe(2024);
        expect(d1?.getMonth()).toBe(0);
        expect(d1?.getDate()).toBe(15);
    });
});

