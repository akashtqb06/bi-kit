import { describe, it, expect } from 'vitest';
import {
    normalizeTextStyle,
    chartConfigSchema,
    defaultChartConfig,
    type ChartConfigData,
    type ChartTextStyle,
} from '@src/lib/schemas';
import {
    FONT_OPTIONS,
    getFontFamily,
    resolveFontFamilyName,
    collectChartFonts,
    collectDashboardFonts,
} from '@src/lib/fonts';

describe('Chart Text Styling & Fonts Unit Tests', () => {
    describe('normalizeTextStyle', () => {
        it('fills complete defaults for legacy configs without textStyle', () => {
            const legacyConfig: ChartConfigData = {
                ...defaultChartConfig,
                xAxis: 'category',
                yAxis: ['revenue'],
            };

            const style = normalizeTextStyle(legacyConfig);
            expect(style).toEqual({
                title: {
                    fontFamily: 'inherit',
                    fontSize: 14,
                    fontWeight: 'medium',
                    align: 'left',
                    color: undefined,
                    show: true,
                },
                subtitle: {
                    text: undefined,
                    fontFamily: 'inherit',
                    fontSize: 12,
                    color: undefined,
                },
                axisLabels: {
                    fontFamily: 'inherit',
                    fontSize: 12,
                    color: undefined,
                },
                legend: {
                    fontFamily: 'inherit',
                    fontSize: 12,
                    color: undefined,
                    show: true,
                },
                dataLabels: {
                    fontFamily: 'inherit',
                    fontSize: 11,
                    fontWeight: 'normal',
                    color: undefined,
                },
                numberValue: {
                    fontSize: 36,
                    fontWeight: 'semibold',
                },
            });
        });

        it('clamps font sizes below min and above max', () => {
            const configWithExtremes: ChartConfigData = {
                ...defaultChartConfig,
                textStyle: {
                    title: { fontSize: 999 },
                    subtitle: { fontSize: 2 },
                    axisLabels: { fontSize: 100 },
                    legend: { fontSize: 4 },
                    dataLabels: { fontSize: 99 },
                    numberValue: { fontSize: 5 },
                },
            };

            const style = normalizeTextStyle(configWithExtremes);
            expect(style.title.fontSize).toBe(48); // max 48
            expect(style.subtitle.fontSize).toBe(8); // min 8
            expect(style.axisLabels.fontSize).toBe(24); // max 24
            expect(style.legend.fontSize).toBe(8); // min 8
            expect(style.dataLabels.fontSize).toBe(24); // max 24
            expect(style.numberValue.fontSize).toBe(20); // min 20

            const configWithTooSmallTitle: ChartConfigData = {
                ...defaultChartConfig,
                textStyle: {
                    title: { fontSize: 6 },
                    numberValue: { fontSize: 200 },
                },
            };
            const style2 = normalizeTextStyle(configWithTooSmallTitle);
            expect(style2.title.fontSize).toBe(12); // min 12
            expect(style2.numberValue.fontSize).toBe(96); // max 96
        });

        it('preserves valid custom values and merges missing properties with defaults', () => {
            const customConfig: ChartConfigData = {
                ...defaultChartConfig,
                textStyle: {
                    title: {
                        fontFamily: 'playfair-display',
                        fontSize: 22,
                        fontWeight: 'bold',
                        align: 'center',
                        color: '#ff0000',
                        show: true,
                    },
                    subtitle: {
                        text: 'Monthly performance',
                        fontFamily: 'lora',
                        fontSize: 13,
                    },
                    axisLabels: {
                        fontSize: 10,
                        color: 'var(--muted-foreground)',
                    },
                },
            };

            const style = normalizeTextStyle(customConfig);
            expect(style.title.fontFamily).toBe('playfair-display');
            expect(style.title.fontSize).toBe(22);
            expect(style.title.fontWeight).toBe('bold');
            expect(style.title.align).toBe('center');
            expect(style.title.color).toBe('#ff0000');
            expect(style.subtitle.text).toBe('Monthly performance');
            expect(style.subtitle.fontFamily).toBe('lora');
            expect(style.subtitle.fontSize).toBe(13);
            expect(style.axisLabels.fontSize).toBe(10);
            expect(style.axisLabels.color).toBe('var(--muted-foreground)');
            // Default preserved for untouched fields
            expect(style.legend.show).toBe(true);
            expect(style.numberValue.fontSize).toBe(36);
        });

        it('handles null and undefined config gracefully', () => {
            const styleNull = normalizeTextStyle(null as unknown as ChartConfigData);
            expect(styleNull.title.fontSize).toBe(14);
            const styleUndefined = normalizeTextStyle(undefined as unknown as ChartConfigData);
            expect(styleUndefined.title.fontSize).toBe(14);
        });
    });

    describe('getFontFamily and FONT_OPTIONS', () => {
        it('exports curated font options covering required fonts', () => {
            const fontIds = FONT_OPTIONS.map((f) => f.id);
            expect(fontIds).toContain('inherit');
            expect(fontIds).toContain('inter');
            expect(fontIds).toContain('roboto');
            expect(fontIds).toContain('open-sans');
            expect(fontIds).toContain('poppins');
            expect(fontIds).toContain('lora');
            expect(fontIds).toContain('merriweather');
            expect(fontIds).toContain('playfair-display');
            expect(fontIds).toContain('jetbrains-mono');
            expect(fontIds).toContain('system-ui');
            expect(fontIds).toContain('serif');
            expect(fontIds).toContain('monospace');
        });

        it('resolves inherit to application font-family stack', () => {
            const family = getFontFamily('inherit');
            expect(family).toContain('var(--font-sans)');
            expect(family).toContain('system-ui');
        });

        it('resolves named fonts with proper fallback stacks', () => {
            expect(getFontFamily('playfair-display')).toContain('Playfair Display');
            expect(getFontFamily('playfair-display')).toContain('serif');

            expect(getFontFamily('jetbrains-mono')).toContain('JetBrains Mono');
            expect(getFontFamily('jetbrains-mono')).toContain('monospace');

            expect(getFontFamily('poppins')).toContain('Poppins');
            expect(getFontFamily('poppins')).toContain('sans-serif');
        });

        it('resolves generic stacks', () => {
            expect(getFontFamily('system-ui')).toContain('system-ui');
            expect(getFontFamily('serif')).toContain('Georgia');
            expect(getFontFamily('monospace')).toContain('monospace');
        });

        it('resolves clean font names via resolveFontFamilyName', () => {
            expect(resolveFontFamilyName('playfair-display')).toBe('Playfair Display');
            expect(resolveFontFamilyName('jetbrains-mono')).toBe('JetBrains Mono');
            expect(resolveFontFamilyName('inherit')).toBe('inherit');
            expect(resolveFontFamilyName('unknown-font')).toBe('unknown-font');
        });
    });

    describe('chartConfigSchema validation', () => {
        it('accepts existing legacy chart configs without textStyle', () => {
            const parsed = chartConfigSchema.safeParse({
                xAxis: 'month',
                yAxis: ['sales'],
                seriesConfig: [{ column: 'sales', aggregation: 'sum' }],
            });
            expect(parsed.success).toBe(true);
            if (parsed.success) {
                expect(parsed.data.textStyle).toBeUndefined();
            }
        });

        it('accepts chart configs with valid textStyle', () => {
            const validStyle: ChartTextStyle = {
                title: {
                    fontFamily: 'poppins',
                    fontSize: 18,
                    fontWeight: 'bold',
                    align: 'center',
                    color: '#22c55e',
                    show: true,
                },
                subtitle: {
                    text: 'Quarterly breakdown',
                    fontSize: 12,
                },
                axisLabels: {
                    fontSize: 14,
                },
                legend: {
                    show: false,
                },
            };

            const parsed = chartConfigSchema.safeParse({
                xAxis: 'quarter',
                yAxis: ['profit'],
                textStyle: validStyle,
            });
            expect(parsed.success).toBe(true);
        });

        it('rejects invalid enum values for weight or align', () => {
            const invalidAlign = chartConfigSchema.safeParse({
                textStyle: {
                    title: {
                        align: 'justified', // not allowed
                    },
                },
            });
            expect(invalidAlign.success).toBe(false);

            const invalidWeight = chartConfigSchema.safeParse({
                textStyle: {
                    title: {
                        fontWeight: 'ultra-heavy', // not allowed
                    },
                },
            });
            expect(invalidWeight.success).toBe(false);
        });
    });

    describe('collectChartFonts and collectDashboardFonts', () => {
        it('collects web fonts used in chart textStyle and ignores system/inherit stacks', () => {
            const config: ChartConfigData = {
                ...defaultChartConfig,
                textStyle: {
                    title: { fontFamily: 'playfair-display' },
                    subtitle: { fontFamily: 'lora' },
                    axisLabels: { fontFamily: 'inherit' },
                    legend: { fontFamily: 'system-ui' },
                    dataLabels: { fontFamily: 'jetbrains-mono' },
                },
            };

            const fonts = collectChartFonts(config);
            expect(fonts).toContain('Playfair Display');
            expect(fonts).toContain('Lora');
            expect(fonts).toContain('JetBrains Mono');
            expect(fonts).not.toContain('inherit');
            expect(fonts).not.toContain('system-ui');
        });

        it('deduplicates fonts used across multiple textStyle properties', () => {
            const config: ChartConfigData = {
                ...defaultChartConfig,
                textStyle: {
                    title: { fontFamily: 'poppins' },
                    subtitle: { fontFamily: 'poppins' },
                    axisLabels: { fontFamily: 'poppins' },
                    legend: { fontFamily: 'poppins' },
                    dataLabels: { fontFamily: 'poppins' },
                },
            };

            const fonts = collectChartFonts(config);
            expect(fonts).toEqual(['Poppins']);
        });

        it('returns empty array when only default inherit or system fonts are configured', () => {
            const config: ChartConfigData = {
                ...defaultChartConfig,
                textStyle: {
                    title: { fontFamily: 'inherit' },
                    subtitle: { fontFamily: 'inherit' },
                    axisLabels: { fontFamily: 'monospace' },
                    legend: { fontFamily: 'serif' },
                },
            };

            const fonts = collectChartFonts(config);
            expect(fonts).toEqual([]);
        });

        it('collects and deduplicates fonts across multiple dashboard charts', () => {
            const charts = [
                {
                    config: {
                        ...defaultChartConfig,
                        textStyle: { title: { fontFamily: 'playfair-display' } },
                    },
                },
                {
                    config: JSON.stringify({
                        textStyle: {
                            title: { fontFamily: 'playfair-display' },
                            axisLabels: { fontFamily: 'inter' },
                        },
                    }),
                },
                {
                    config: {
                        textStyle: { dataLabels: { fontFamily: 'roboto' } },
                    },
                },
            ];

            const dashboardFonts = collectDashboardFonts(charts);
            expect(dashboardFonts).toContain('Playfair Display');
            expect(dashboardFonts).toContain('Inter');
            expect(dashboardFonts).toContain('Roboto');
            expect(dashboardFonts).toHaveLength(3);
        });
    });
});
