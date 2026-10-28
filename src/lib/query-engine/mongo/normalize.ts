import { ObjectId, Decimal128, Binary, Long } from 'mongodb';

export function getDotPathValue(obj: unknown, path: string): unknown {
    if (obj === null || obj === undefined) return null;
    if (typeof obj !== 'object') return null;

    const record = obj as Record<string, unknown>;
    if (path in record) {
        return record[path];
    }

    const segments = path.split('.');
    let curr: unknown = obj;
    for (const seg of segments) {
        if (curr === null || curr === undefined || typeof curr !== 'object') {
            return null;
        }
        curr = (curr as Record<string, unknown>)[seg];
    }
    return curr ?? null;
}

export function normalizeBsonValue(val: unknown): unknown {
    if (val === null || val === undefined) {
        return null;
    }

    if (val instanceof ObjectId) {
        return val.toHexString();
    }

    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val.toISOString();
    }

    if (val instanceof Decimal128) {
        const num = parseFloat(val.toString());
        return isNaN(num) ? val.toString() : num;
    }

    if (val instanceof Long) {
        return val.toNumber();
    }

    if (typeof val === 'bigint') {
        const num = Number(val);
        return Number.isSafeInteger(num) ? num : val.toString();
    }

    if (val instanceof Binary || Buffer.isBuffer(val)) {
        const buf = Buffer.isBuffer(val) ? val : val.buffer;
        return `base64:${buf.toString('base64')}`;
    }

    if (Array.isArray(val)) {
        return JSON.stringify(val.map(normalizeBsonValue));
    }

    if (typeof val === 'object') {
        // Plain object or nested document
        const out: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
            out[k] = normalizeBsonValue(v);
        }
        return JSON.stringify(out);
    }

    return val;
}

/**
 * Extract columns and format rows from MongoDB documents.
 */
function extractDocumentPaths(obj: unknown, prefix = '', depth = 1, set: Set<string>): void {
    if (obj === null || obj === undefined || depth > 3) return;

    if (
        obj instanceof ObjectId ||
        obj instanceof Date ||
        obj instanceof Decimal128 ||
        obj instanceof Long ||
        obj instanceof Binary ||
        Buffer.isBuffer(obj) ||
        Array.isArray(obj) ||
        typeof obj !== 'object'
    ) {
        if (prefix) set.add(prefix);
        return;
    }

    const rec = obj as Record<string, unknown>;
    const keys = Object.keys(rec);
    if (keys.length === 0) {
        if (prefix) set.add(prefix);
        return;
    }

    for (const key of keys) {
        const fullPath = prefix ? `${prefix}.${key}` : key;
        const val = rec[key];
        if (
            val &&
            typeof val === 'object' &&
            !(val instanceof ObjectId) &&
            !(val instanceof Date) &&
            !(val instanceof Decimal128) &&
            !(val instanceof Long) &&
            !(val instanceof Binary) &&
            !Array.isArray(val) &&
            !Buffer.isBuffer(val) &&
            depth < 3
        ) {
            extractDocumentPaths(val, fullPath, depth + 1, set);
        } else {
            set.add(fullPath);
        }
    }
}

export function formatMongoResults(
    documents: Record<string, unknown>[],
    expectedColumns?: string[]
): { columns: string[]; rows: unknown[][] } {
    if (documents.length === 0) {
        return {
            columns: expectedColumns || [],
            rows: [],
        };
    }

    // Determine columns if not explicitly provided
    let columns = expectedColumns;
    if (!columns || columns.length === 0) {
        const colSet = new Set<string>();
        // Scan up to first 20 documents to collect column names
        for (const doc of documents.slice(0, 20)) {
            extractDocumentPaths(doc, '', 1, colSet);
        }
        columns = Array.from(colSet);
    }

    const rows: unknown[][] = [];
    for (const doc of documents) {
        const row: unknown[] = [];
        for (const col of columns) {
            const rawVal = getDotPathValue(doc, col);
            row.push(normalizeBsonValue(rawVal));
        }
        rows.push(row);
    }

    return { columns, rows };
}
