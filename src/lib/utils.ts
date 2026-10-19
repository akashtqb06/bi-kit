import { formatDistanceToNow, format } from 'date-fns';

// ---------------------------------------------------------------------------
// Date Formatting
// ---------------------------------------------------------------------------

/**
 * Formats a date relative to now (e.g., "5 minutes ago", "3 days ago").
 * Returns fallback if the date is null, undefined, or invalid.
 */
export function formatRelativeTime(
    date: Date | string | number | null | undefined,
    fallback = '—'
): string {
    if (!date) return fallback;
    try {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return fallback;
        return formatDistanceToNow(parsed, { addSuffix: true });
    } catch {
        return fallback;
    }
}

/**
 * Formats a date with a date-fns pattern.
 * Defaults to readable format (e.g., "Apr 29, 2024").
 */
export function formatDate(
    date: Date | string | number | null | undefined,
    pattern = 'PPP',
    fallback = '—'
): string {
    if (!date) return fallback;
    try {
        const parsed = new Date(date);
        if (Number.isNaN(parsed.getTime())) return fallback;
        return format(parsed, pattern);
    } catch {
        return fallback;
    }
}

// ---------------------------------------------------------------------------
// Slug Generation
// ---------------------------------------------------------------------------

/**
 * Generates a clean URL-friendly and filename-safe slug from a string.
 */
export function slugify(text?: string, fallback = 'item'): string {
    if (!text) return fallback;
    const slug = text
        .toLowerCase()
        .trim()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
    return slug || fallback;
}

/**
 * Generates a clean slug specifically for charts/dashboards (defaults to 'chart-data').
 */
export function slugifyTitle(title?: string): string {
    return slugify(title, 'chart-data');
}

// ---------------------------------------------------------------------------
// CSV Helpers
// ---------------------------------------------------------------------------

/**
 * Escapes a single CSV value according to RFC 4180.
 * If the value contains commas, double quotes, or newlines, it is enclosed
 * in double quotes, and any internal double quotes are doubled ("").
 */
export function escapeCsvField(val: unknown): string {
    if (val === null || val === undefined) return '';
    const str = String(val);
    if (/[",\r\n]/.test(str)) {
        return `"${str.replace(/"/g, '""')}"`;
    }
    return str;
}

export interface BuildCsvOptions {
    lineEnding?: '\n' | '\r\n';
    withBom?: boolean;
}

/**
 * Builds CSV string content from headers and row arrays.
 * Handles escaping and optional UTF-8 BOM for Excel compatibility.
 */
export function buildCsvContent(
    headers: (string | { name: string })[],
    rows: unknown[][],
    options: BuildCsvOptions = {}
): string {
    const { lineEnding = '\r\n', withBom = true } = options;
    const headerLine = headers
        .map((h) => (typeof h === 'string' ? h : h.name))
        .map(escapeCsvField)
        .join(',');
    const rowLines = rows.map((row) => row.map(escapeCsvField).join(','));
    const content = (headerLine ? [headerLine, ...rowLines] : rowLines).join(lineEnding);
    return withBom ? '\uFEFF' + content : content;
}

/**
 * Triggers a browser download for CSV content via temporary <a> anchor.
 */
export function downloadCsv(filename: string, content: string): void {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename.endsWith('.csv') ? filename : `${filename}.csv`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

