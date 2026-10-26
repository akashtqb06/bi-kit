import { describe, it, expect } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ChartTitle } from './chart-title';
import { ChartRenderer } from './chart-renderer';
import { defaultChartConfig, type ChartConfigData } from '@src/lib/schemas';

describe('ChartTitle and ChartRenderer Render Tests', () => {
    describe('ChartTitle Component', () => {
        it('renders title with correct styles and alignment', () => {
            const html = renderToString(
                <ChartTitle
                    title="Quarterly Revenue"
                    textStyle={{
                        title: {
                            fontFamily: 'playfair-display',
                            fontSize: 24,
                            fontWeight: 'bold',
                            align: 'center',
                            color: '#10b981',
                            show: true,
                        },
                        subtitle: {
                            text: '',
                            fontFamily: 'inherit',
                            fontSize: 12,
                        },
                        axisLabels: { fontFamily: 'inherit', fontSize: 12 },
                        legend: { fontFamily: 'inherit', fontSize: 12, show: true },
                        dataLabels: { fontFamily: 'inherit', fontSize: 11, fontWeight: 'medium' },
                        numberValue: { fontSize: 36, fontWeight: 'bold' },
                    }}
                />
            );

            expect(html).toContain('Quarterly Revenue');
            expect(html).toContain('Playfair Display');
            expect(html).toContain('font-size:24px');
            expect(html).toContain('color:#10b981');
            expect(html).toContain('text-center');
            expect(html).toContain('font-weight:700');
        });

        it('renders subtitle only when non-empty text is present', () => {
            const withSubtitleHtml = renderToString(
                <ChartTitle
                    title="Orders"
                    subtitle="2024 Year to Date"
                    textStyle={{
                        title: {
                            fontFamily: 'inherit',
                            fontSize: 16,
                            fontWeight: 'medium',
                            align: 'left',
                            show: true,
                        },
                        subtitle: {
                            text: '2024 Year to Date',
                            fontFamily: 'lora',
                            fontSize: 14,
                            color: '#6b7280',
                        },
                        axisLabels: { fontFamily: 'inherit', fontSize: 12 },
                        legend: { fontFamily: 'inherit', fontSize: 12, show: true },
                        dataLabels: { fontFamily: 'inherit', fontSize: 11, fontWeight: 'medium' },
                        numberValue: { fontSize: 36, fontWeight: 'bold' },
                    }}
                />
            );

            expect(withSubtitleHtml).toContain('Orders');
            expect(withSubtitleHtml).toContain('2024 Year to Date');
            expect(withSubtitleHtml).toContain('Lora');
            expect(withSubtitleHtml).toContain('font-size:14px');
            expect(withSubtitleHtml).toContain('color:#6b7280');

            const withoutSubtitleHtml = renderToString(
                <ChartTitle
                    title="Orders"
                    textStyle={{
                        title: {
                            fontFamily: 'inherit',
                            fontSize: 16,
                            fontWeight: 'medium',
                            align: 'left',
                            show: true,
                        },
                        subtitle: {
                            text: '',
                            fontFamily: 'inherit',
                            fontSize: 12,
                        },
                        axisLabels: { fontFamily: 'inherit', fontSize: 12 },
                        legend: { fontFamily: 'inherit', fontSize: 12, show: true },
                        dataLabels: { fontFamily: 'inherit', fontSize: 11, fontWeight: 'medium' },
                        numberValue: { fontSize: 36, fontWeight: 'bold' },
                    }}
                />
            );

            expect(withoutSubtitleHtml).toContain('Orders');
            expect(withoutSubtitleHtml).not.toContain('2024 Year to Date');
        });

        it('does not render title element when show is false', () => {
            const html = renderToString(
                <ChartTitle
                    title="Hidden Title"
                    textStyle={{
                        title: {
                            fontFamily: 'inherit',
                            fontSize: 14,
                            fontWeight: 'medium',
                            align: 'left',
                            show: false,
                        },
                        subtitle: {
                            text: '',
                            fontFamily: 'inherit',
                            fontSize: 12,
                        },
                        axisLabels: { fontFamily: 'inherit', fontSize: 12 },
                        legend: { fontFamily: 'inherit', fontSize: 12, show: true },
                        dataLabels: { fontFamily: 'inherit', fontSize: 11, fontWeight: 'medium' },
                        numberValue: { fontSize: 36, fontWeight: 'bold' },
                    }}
                />
            );

            expect(html).not.toContain('Hidden Title');
        });
    });

    describe('ChartRenderer Title Deduplication & Axis Styling', () => {
        const sampleData: Record<string, unknown>[] = [
            { category: 'Electronics', sales: 1200 },
            { category: 'Furniture', sales: 850 },
        ];

        const configWithStyles: ChartConfigData = {
            ...defaultChartConfig,
            title: 'Sales by Category',
            xAxis: 'category',
            yAxis: ['sales'],
            seriesConfig: [{ column: 'sales', aggregation: 'sum', label: 'Sales' }],
            textStyle: {
                title: {
                    fontFamily: 'playfair-display',
                    fontSize: 20,
                    fontWeight: 'bold',
                    align: 'center',
                    show: true,
                },
                axisLabels: {
                    fontFamily: 'jetbrains-mono',
                    fontSize: 14,
                    color: '#6366f1',
                },
            },
        };

        it('renders title when showTitle is true (default)', () => {
            const html = renderToString(
                <ChartRenderer
                    type="bar"
                    config={configWithStyles}
                    data={sampleData}
                    showTitle={true}
                />
            );

            // Exactly one title block rendered
            const occurrences = html.split('data-slot="chart-title"').length - 1;
            expect(occurrences).toBe(1);
            expect(html).toContain('Sales by Category');
            expect(html).toContain('Playfair Display');
        });

        it('does NOT render title when showTitle is false (external container renders title)', () => {
            const html = renderToString(
                <ChartRenderer
                    type="bar"
                    config={configWithStyles}
                    data={sampleData}
                    showTitle={false}
                />
            );

            // Title should not be rendered inside ChartRenderer
            expect(html).not.toContain('data-slot="chart-title"');
            expect(html).not.toContain('Sales by Category');
        });

        it('applies numberValue font size and weight to Number chart', () => {
            const numberConfig: ChartConfigData = {
                ...defaultChartConfig,
                title: 'Total Revenue',
                yAxis: ['sales'],
                textStyle: {
                    numberValue: {
                        fontSize: 48,
                        fontWeight: 'bold',
                    },
                },
            };

            const html = renderToString(
                <ChartRenderer
                    type="number"
                    config={numberConfig}
                    data={sampleData}
                    showTitle={true}
                />
            );

            expect(html).toContain('font-size:48px');
            expect(html).toContain('font-weight:700');
        });
    });
});
