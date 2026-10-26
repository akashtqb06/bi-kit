import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    escapeCsvField,
    slugifyTitle,
    registerChartRefetcher,
    refreshChart,
    openInWorkbook,
    openDashboardInWorkbook,
    downloadChartCsv,
    exportElementPng,
    exportChartPng,
    exportDashboardPng,
    captureElementPng,
    slugify,
} from './chart-actions';

vi.mock('html-to-image', () => ({
    toPng: vi.fn().mockImplementation(async () => {
        return 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
    }),
}));

describe('chart-actions', () => {
    describe('escapeCsvField', () => {
        it('handles null and undefined', () => {
            expect(escapeCsvField(null)).toBe('');
            expect(escapeCsvField(undefined)).toBe('');
        });

        it('leaves clean strings unquoted', () => {
            expect(escapeCsvField('Hello')).toBe('Hello');
            expect(escapeCsvField(12345)).toBe('12345');
        });

        it('quotes strings with commas', () => {
            expect(escapeCsvField('Apples, Bananas')).toBe('"Apples, Bananas"');
        });

        it('quotes strings with newlines', () => {
            expect(escapeCsvField("Line 1\nLine 2")).toBe('"Line 1\nLine 2"');
            expect(escapeCsvField("Line 1\r\nLine 2")).toBe('"Line 1\r\nLine 2"');
        });

        it('quotes and doubles double-quotes', () => {
            expect(escapeCsvField('He said "Hello"')).toBe('"He said ""Hello"""');
            expect(escapeCsvField('"quoted"')).toBe('"""quoted"""');
        });
    });

    describe('slugifyTitle', () => {
        it('handles undefined or empty title', () => {
            expect(slugifyTitle()).toBe('chart-data');
            expect(slugifyTitle('')).toBe('chart-data');
        });

        it('converts to lowercase and replaces special characters with dashes', () => {
            expect(slugifyTitle('Monthly Revenue (2024)!')).toBe('monthly-revenue-2024');
            expect(slugifyTitle('  Sales Overview  ')).toBe('sales-overview');
        });
    });

    describe('registerChartRefetcher and refreshChart', () => {
        it('invokes registered refetch function', async () => {
            const mockRefetch = vi.fn().mockResolvedValue(undefined);
            const unregister = registerChartRefetcher('test-chart-1', mockRefetch);

            await refreshChart('test-chart-1');
            expect(mockRefetch).toHaveBeenCalledTimes(1);

            unregister();
        });

        it('unregisters cleanly', async () => {
            const mockRefetch = vi.fn().mockResolvedValue(undefined);
            const unregister = registerChartRefetcher('test-chart-2', mockRefetch);
            unregister();

            // After unregistering, it should attempt fallback fetch
            global.fetch = vi.fn().mockResolvedValue({
                ok: true,
                json: async () => ({ data: { queryId: 'q-1', dataSourceId: 'ds-1', mode: 'sql', sql: 'SELECT 1' } }),
            } as unknown as Response);

            await refreshChart('test-chart-2');
            expect(mockRefetch).not.toHaveBeenCalled();
        });
    });

    describe('openInWorkbook and openDashboardInWorkbook', () => {
        it('navigates to the chart in workbook', () => {
            const mockRouter = { push: vi.fn() };
            openInWorkbook(mockRouter, 'wb-123', 'chart-456');
            expect(mockRouter.push).toHaveBeenCalledWith('/workbooks/wb-123/chart/chart-456');
        });

        it('navigates to the dashboard in workbook', () => {
            const mockRouter = { push: vi.fn() };
            openDashboardInWorkbook(mockRouter, 'wb-123', 'dash-789');
            expect(mockRouter.push).toHaveBeenCalledWith('/workbooks/wb-123/dashboard/dash-789');
        });
    });

    describe('downloadChartCsv', () => {
        let downloadedFilename: string | null = null;
        let downloadedBlob: Blob | null = null;

        beforeEach(() => {
            downloadedFilename = null;
            downloadedBlob = null;

            const mockAnchor = {
                href: '',
                download: '',
                click: vi.fn(() => {
                    downloadedFilename = mockAnchor.download;
                }),
            };

            vi.stubGlobal('URL', {
                createObjectURL: vi.fn((blob: Blob) => {
                    downloadedBlob = blob;
                    return 'blob:test-url';
                }),
                revokeObjectURL: vi.fn(),
            });

            vi.stubGlobal('document', {
                createElement: vi.fn(() => mockAnchor),
                body: {
                    appendChild: vi.fn(),
                    removeChild: vi.fn(),
                },
            });
        });

        it('generates RFC 4180 CSV with UTF-8 BOM from rows and columns', async () => {
            const rows = [
                ['Widget A', 100, 'Special "Offer", Ltd.'],
                ['Widget B', 250, 'Standard\nShipping'],
            ];
            const columns = [{ name: 'Product' }, { name: 'Price' }, { name: 'Notes' }];

            await downloadChartCsv(
                { id: 'c1', title: 'Product Sales' },
                rows,
                columns
            );

            expect(downloadedFilename).toBe('product-sales.csv');
            expect(downloadedBlob).not.toBeNull();

            // Verify UTF-8 BOM bytes (0xEF, 0xBB, 0xBF)
            const arrayBuffer = await downloadedBlob!.arrayBuffer();
            const bytes = new Uint8Array(arrayBuffer);
            expect(bytes[0]).toBe(0xEF);
            expect(bytes[1]).toBe(0xBB);
            expect(bytes[2]).toBe(0xBF);

            // Should have headers and escaped rows
            const text = await downloadedBlob!.text();
            expect(text).toContain('Product,Price,Notes');
            expect(text).toContain('Widget A,100,"Special ""Offer"", Ltd."');
            expect(text).toContain('Widget B,250,"Standard\nShipping"');
        });

        it('handles object rows (aggregated views)', async () => {
            const rows = [
                { category: 'Electronics', revenue: 5000 },
                { category: 'Books', revenue: 1200 },
            ];

            await downloadChartCsv(
                { id: 'c2', title: 'Category Breakdown' },
                rows
            );

            expect(downloadedFilename).toBe('category-breakdown.csv');
            const text = await downloadedBlob!.text();
            expect(text).toContain('category,revenue');
            expect(text).toContain('Electronics,5000');
            expect(text).toContain('Books,1200');
        });
    });

    describe('PNG Export helpers', () => {
        let downloadedFilename: string | null = null;
        let downloadedHref: string | null = null;

        beforeEach(() => {
            downloadedFilename = null;
            downloadedHref = null;

            const mockAnchor = {
                href: '',
                download: '',
                click: vi.fn(() => {
                    downloadedFilename = mockAnchor.download;
                    downloadedHref = mockAnchor.href;
                }),
            };

            vi.stubGlobal(
                'requestAnimationFrame',
                vi.fn((cb: () => void) => {
                    cb();
                    return 1;
                })
            );

            vi.stubGlobal('document', {
                createElement: vi.fn(() => mockAnchor),
                body: {
                    appendChild: vi.fn(),
                    removeChild: vi.fn(),
                },
                documentElement: {
                    classList: {
                        contains: vi.fn(() => false),
                    },
                },
                fonts: {
                    ready: Promise.resolve(),
                },
            });

            vi.stubGlobal('window', {
                getComputedStyle: vi.fn(() => ({
                    backgroundColor: '#ffffff',
                    getPropertyValue: vi.fn(() => ''),
                    getPropertyPriority: vi.fn(() => ''),
                })),
            });
        });

        it('slugifies title for exportChartPng with fallback to chart.png', async () => {
            expect(slugify('Sales Overview!')).toBe('sales-overview');
            expect(slugify(undefined, 'chart')).toBe('chart');

            const mockEl = {
                offsetWidth: 800,
                offsetHeight: 400,
                style: { pointerEvents: '' },
                querySelectorAll: vi.fn(() => []),
            } as unknown as HTMLElement;

            await exportChartPng(mockEl, 'Revenue by Category');
            expect(downloadedFilename).toBe('revenue-by-category.png');
            expect(downloadedHref).toContain('data:image/png;base64');

            await exportChartPng(mockEl);
            expect(downloadedFilename).toBe('chart.png');

            await exportElementPng(mockEl, { filename: 'generic.png' });
            expect(downloadedFilename).toBe('generic.png');
        });

        it('preserves exact dashboard export filename and fallback', async () => {
            const mockEl = {
                offsetWidth: 1200,
                offsetHeight: 800,
                style: { pointerEvents: '' },
                querySelector: vi.fn(() => null),
                querySelectorAll: vi.fn(() => []),
            } as unknown as HTMLElement;

            await exportDashboardPng(mockEl, 'Q3 Executive Overview');
            expect(downloadedFilename).toBe('Q3 Executive Overview.png');

            await exportDashboardPng(mockEl);
            expect(downloadedFilename).toBe('dashboard.png');
        });

        it('auto-reduces pixelRatio if canvas dimension exceeds 16,000 px', async () => {
            const mockEl = {
                offsetWidth: 10000,
                offsetHeight: 10000,
                style: { pointerEvents: '' },
                querySelectorAll: vi.fn(() => []),
            } as unknown as HTMLElement;

            const result = await captureElementPng(mockEl, { pixelRatio: 2 });
            expect(result).not.toBeNull();
            expect(result?.wasReduced).toBe(true);
            expect(result!.pixelRatio).toBeLessThan(2);
        });

        it('caps table rows at 100 during export', async () => {
            const mockRows = Array.from({ length: 120 }, () => ({
                style: { display: '' },
            })) as unknown as HTMLElement[];

            const mockEl = {
                offsetWidth: 600,
                offsetHeight: 400,
                style: { pointerEvents: '' },
                querySelectorAll: vi.fn((sel: string) => {
                    if (sel === 'tbody tr') return mockRows;
                    return [];
                }),
            } as unknown as HTMLElement;

            const result = await captureElementPng(mockEl);
            expect(result?.tableTruncated).toBe(true);
            // Rows beyond index 99 were restored in finally
            expect(mockRows[100].style.display).toBe('');
        });
    });
});
