import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
    escapeCsvField,
    slugifyTitle,
    registerChartRefetcher,
    refreshChart,
    openInWorkbook,
    openDashboardInWorkbook,
    downloadChartCsv,
} from './chart-actions';

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
});
