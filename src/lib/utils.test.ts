import { describe, it, expect, vi } from 'vitest';
import {
    formatRelativeTime,
    formatDate,
    slugify,
    slugifyTitle,
    escapeCsvField,
    buildCsvContent,
    downloadCsv,
} from './utils';

describe('src/lib/utils', () => {
    describe('formatRelativeTime', () => {
        it('returns fallback for null or undefined', () => {
            expect(formatRelativeTime(null)).toBe('—');
            expect(formatRelativeTime(undefined)).toBe('—');
            expect(formatRelativeTime(null, 'Never')).toBe('Never');
        });

        it('returns fallback for invalid dates', () => {
            expect(formatRelativeTime('invalid-date')).toBe('—');
        });

        it('formats valid dates relative to now', () => {
            const fiveMinutesAgo = new Date(Date.now() - 5 * 60 * 1000);
            expect(formatRelativeTime(fiveMinutesAgo)).toContain('minute');
        });
    });

    describe('formatDate', () => {
        it('returns fallback for null or undefined', () => {
            expect(formatDate(null)).toBe('—');
            expect(formatDate(undefined)).toBe('—');
            expect(formatDate(null, 'yyyy-MM-dd', 'N/A')).toBe('N/A');
        });

        it('formats valid dates according to pattern', () => {
            const date = new Date('2024-05-15T12:00:00Z');
            expect(formatDate(date, 'yyyy-MM-dd')).toBe('2024-05-15');
        });
    });

    describe('slugify', () => {
        it('handles null, undefined, or empty string', () => {
            expect(slugify()).toBe('item');
            expect(slugify('')).toBe('item');
            expect(slugify('', 'custom')).toBe('custom');
        });

        it('converts to lowercase and cleans non-alphanumeric characters', () => {
            expect(slugify('Monthly Revenue (2024)!')).toBe('monthly-revenue-2024');
            expect(slugify('  Sales Overview  ')).toBe('sales-overview');
            expect(slugify('---leading-trailing---')).toBe('leading-trailing');
        });
    });

    describe('slugifyTitle', () => {
        it('defaults to chart-data for empty titles', () => {
            expect(slugifyTitle()).toBe('chart-data');
            expect(slugifyTitle('')).toBe('chart-data');
            expect(slugifyTitle('My Cool Chart')).toBe('my-cool-chart');
        });
    });

    describe('escapeCsvField', () => {
        it('handles null and undefined', () => {
            expect(escapeCsvField(null)).toBe('');
            expect(escapeCsvField(undefined)).toBe('');
        });

        it('leaves clean strings unquoted', () => {
            expect(escapeCsvField('hello')).toBe('hello');
            expect(escapeCsvField(12345)).toBe('12345');
        });

        it('quotes strings with commas, quotes, or newlines', () => {
            expect(escapeCsvField('a,b')).toBe('"a,b"');
            expect(escapeCsvField('line1\nline2')).toBe('"line1\nline2"');
            expect(escapeCsvField('say "hi"')).toBe('"say ""hi"""');
        });
    });

    describe('buildCsvContent', () => {
        it('builds CSV with BOM and proper escaping', () => {
            const headers = ['Name', 'Details'];
            const rows = [
                ['Alice', 'Likes apples, oranges'],
                ['Bob', 'Said "Hi"'],
            ];
            const csv = buildCsvContent(headers, rows);
            expect(csv.startsWith('\uFEFF')).toBe(true);
            expect(csv).toContain('"Likes apples, oranges"');
            expect(csv).toContain('"Said ""Hi"""');
        });

        it('supports column object headers and custom line endings', () => {
            const headers = [{ name: 'Col1' }, { name: 'Col2' }];
            const rows = [['1', '2']];
            const csv = buildCsvContent(headers, rows, { withBom: false, lineEnding: '\n' });
            expect(csv.startsWith('\uFEFF')).toBe(false);
            expect(csv).toBe('Col1,Col2\n1,2');
        });
    });

    describe('downloadCsv', () => {
        it('creates a download link and triggers click', () => {
            const clickSpy = vi.fn();
            const mockAnchor = {
                href: '',
                download: '',
                click: clickSpy,
            };

            vi.stubGlobal('URL', {
                createObjectURL: vi.fn(() => 'blob:test-url'),
                revokeObjectURL: vi.fn(),
            });

            vi.stubGlobal('document', {
                createElement: vi.fn(() => mockAnchor),
                body: {
                    appendChild: vi.fn(),
                    removeChild: vi.fn(),
                },
            });

            downloadCsv('test-export', 'col1,col2\n1,2');
            expect(clickSpy).toHaveBeenCalled();
            expect(mockAnchor.download).toBe('test-export.csv');
            vi.unstubAllGlobals();
        });
    });
});
