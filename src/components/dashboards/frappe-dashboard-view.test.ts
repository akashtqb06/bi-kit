import { describe, it, expect } from 'vitest';
import { sanitizeLayout } from './dashboard-grid';
import { computeNumberCardValue } from '../charts/chart-renderer';
import { defaultChartConfig, type ChartConfigData, type LayoutItem } from '@src/lib/schemas';

describe('Frappe Dashboard & Sleek View Tests', () => {
    describe('Layout Sanitizer', () => {
        it('clamps minimum dimensions to minW=2, minH=2 and keeps within 12 columns', () => {
            const raw: LayoutItem[] = [
                { i: 'tile_1', chartId: 'c1', x: 0, y: 0, w: 1, h: 1 },
                { i: 'tile_2', chartId: 'c2', x: 11, y: 0, w: 4, h: 2 },
            ];
            const sanitized = sanitizeLayout(raw);
            expect(sanitized).toHaveLength(2);

            // tile_1 clamped to w=2, h=2
            expect(sanitized[0].w).toBe(2);
            expect(sanitized[0].h).toBe(2);

            // tile_2 width clamped to fit within 12 columns (x: 10, w: 2 or similar)
            expect(sanitized[1].x + sanitized[1].w).toBeLessThanOrEqual(12);
            expect(sanitized[1].w).toBeGreaterThanOrEqual(2);
            expect(sanitized[1].h).toBeGreaterThanOrEqual(2);
        });

        it('resolves overlapping items by pushing them down', () => {
            const overlapping: LayoutItem[] = [
                { i: 'a', chartId: 'ca', x: 0, y: 0, w: 6, h: 4 },
                { i: 'b', chartId: 'cb', x: 2, y: 1, w: 6, h: 4 }, // overlaps with a
            ];
            const sanitized = sanitizeLayout(overlapping);
            expect(sanitized).toHaveLength(2);

            const a = sanitized.find((item) => item.i === 'a')!;
            const b = sanitized.find((item) => item.i === 'b')!;

            // b must be pushed below a (y >= a.y + a.h = 4)
            expect(b.y).toBeGreaterThanOrEqual(a.y + a.h);
        });

        it('preserves clean non-overlapping multi-row layouts', () => {
            const clean: LayoutItem[] = [
                { i: 'kpi1', chartId: 'c1', x: 0, y: 0, w: 3, h: 3 },
                { i: 'kpi2', chartId: 'c2', x: 3, y: 0, w: 3, h: 3 },
                { i: 'kpi3', chartId: 'c3', x: 6, y: 0, w: 3, h: 3 },
                { i: 'kpi4', chartId: 'c4', x: 9, y: 0, w: 3, h: 3 },
                { i: 'chart1', chartId: 'c5', x: 0, y: 3, w: 6, h: 5 },
                { i: 'chart2', chartId: 'c6', x: 6, y: 3, w: 6, h: 5 },
            ];
            const sanitized = sanitizeLayout(clean);
            expect(sanitized).toEqual(clean);
        });

        it('handles empty layout without error', () => {
            expect(sanitizeLayout([])).toEqual([]);
        });

        it('compacts widgets vertically upward to remove accidental gaps', () => {
            const withGap: LayoutItem[] = [
                { i: 'tile_1', chartId: 'c1', x: 0, y: 10, w: 6, h: 4 },
            ];
            const sanitized = sanitizeLayout(withGap);
            expect(sanitized[0].y).toBe(0);
        });

        it('sanitizes text and filter widgets with minimum dimensions', () => {
            const mixed: LayoutItem[] = [
                { i: 'text_1', widgetType: 'text', text: 'Hello', x: 0, y: 0, w: 1, h: 0 },
                { i: 'filter_1', widgetType: 'filter', filterId: 'f1', x: 2, y: 0, w: 1, h: 0 },
            ];
            const sanitized = sanitizeLayout(mixed);
            expect(sanitized[0].w).toBeGreaterThanOrEqual(2);
            expect(sanitized[0].h).toBeGreaterThanOrEqual(1);
            expect(sanitized[1].w).toBeGreaterThanOrEqual(2);
            expect(sanitized[1].h).toBeGreaterThanOrEqual(1);
        });

        it('is idempotent: running sanitizeLayout multiple times produces identical result', () => {
            const raw: LayoutItem[] = [
                { i: 'a', chartId: 'ca', x: 0, y: 0, w: 6, h: 4 },
                { i: 'b', chartId: 'cb', x: 2, y: 1, w: 6, h: 4 },
                { i: 'c', widgetType: 'text', text: 'Test', x: 0, y: 15, w: 12, h: 2 },
            ];
            const firstPass = sanitizeLayout(raw);
            const secondPass = sanitizeLayout(firstPass);
            expect(secondPass).toEqual(firstPass);
        });
    });

    describe('Number Card (Frappe Style)', () => {
        it('formats integers without decimals (e.g. 150, not 150.00)', () => {
            const rows = [{ val: 150 }];
            const config: ChartConfigData = {
                ...defaultChartConfig,
                numberValueColumn: 'val',
                numberAggregation: 'first',
                numberFormat: 'number',
            };
            const res = computeNumberCardValue(rows, config, ['val']);
            expect(res.formatted).toBe('150');
        });

        it('formats large numbers (>= 100,000) using compact notation', () => {
            const rows = [{ val: 150000 }];
            const config: ChartConfigData = {
                ...defaultChartConfig,
                numberValueColumn: 'val',
                numberAggregation: 'first',
                numberFormat: 'number',
            };
            const res = computeNumberCardValue(rows, config, ['val']);
            expect(res.formatted).toBe('150K');
        });

        it('computes time delta and sparkline when date column is present', () => {
            const rows = [
                { order_date: '2023-01-01', revenue: 1000 },
                { order_date: '2023-02-01', revenue: 1250 },
                { order_date: '2023-03-01', revenue: 1500 },
            ];
            const config: ChartConfigData = {
                ...defaultChartConfig,
                xAxis: 'order_date',
                numberValueColumn: 'revenue',
                numberAggregation: 'first',
                numberFormat: 'currency',
            };
            const res = computeNumberCardValue(rows, config, ['order_date', 'revenue']);

            // Sparkline data should have all 3 points
            expect(res.sparklineData).toBeDefined();
            expect(res.sparklineData).toHaveLength(3);
            expect(res.sparklineData![0].value).toBe(1000);
            expect(res.sparklineData![2].value).toBe(1500);

            // Time delta between March (1500) and February (1250) -> +20%
            expect(res.timeDelta).toBeDefined();
            expect(res.timeDelta?.isPositive).toBe(true);
            expect(res.timeDelta?.diffPct).toBe(20);
        });

        it('shows negative delta when latest period decreased', () => {
            const rows = [
                { order_date: '2023-01-01', count: 200 },
                { order_date: '2023-02-01', count: 150 },
            ];
            const config: ChartConfigData = {
                ...defaultChartConfig,
                xAxis: 'order_date',
                numberValueColumn: 'count',
                numberAggregation: 'first',
            };
            const res = computeNumberCardValue(rows, config, ['order_date', 'count']);

            expect(res.timeDelta).toBeDefined();
            expect(res.timeDelta?.isPositive).toBe(false);
            expect(res.timeDelta?.diffPct).toBe(25); // -25%
        });
    });

    describe('Default Widget Dimensions by Type', () => {
        it('assigns correct default sizes for all chart types', async () => {
            const { getDefaultDimensionsForChartType } = await import('./dashboard-editor');
            expect(getDefaultDimensionsForChartType('number')).toEqual({ w: 3, h: 3 });
            expect(getDefaultDimensionsForChartType('bar')).toEqual({ w: 6, h: 8 });
            expect(getDefaultDimensionsForChartType('line')).toEqual({ w: 6, h: 8 });
            expect(getDefaultDimensionsForChartType('row')).toEqual({ w: 6, h: 8 });
            expect(getDefaultDimensionsForChartType('area')).toEqual({ w: 6, h: 8 });
            expect(getDefaultDimensionsForChartType('donut')).toEqual({ w: 4, h: 8 });
            expect(getDefaultDimensionsForChartType('pie')).toEqual({ w: 4, h: 8 });
            expect(getDefaultDimensionsForChartType('table')).toEqual({ w: 12, h: 9 });
        });
    });
});

