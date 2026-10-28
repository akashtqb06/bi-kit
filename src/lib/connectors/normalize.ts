import type { QueryResult } from './types';

/**
 * Normalizes an arbitrary value returned by a database driver to a JSON-safe,
 * engine-independent primitive or structure:
 * - BigInt -> number when within [MIN_SAFE_INTEGER, MAX_SAFE_INTEGER], otherwise string
 * - Decimal -> number
 * - Date -> ISO string
 * - Buffer / Uint8Array -> base64 marker { __type: 'binary', base64: string }
 * - Nested objects / arrays -> deeply normalized plain JSON
 * - Driver-specific wrapper objects -> plain JSON or converted primitives
 */
export function normalizeValue(val: unknown): unknown {
    if (val === null || val === undefined) {
        return null;
    }

    if (typeof val === 'bigint') {
        if (val >= BigInt(Number.MIN_SAFE_INTEGER) && val <= BigInt(Number.MAX_SAFE_INTEGER)) {
            return Number(val);
        }
        return val.toString();
    }

    if (typeof val === 'number') {
        return Number.isFinite(val) ? val : null;
    }

    if (typeof val === 'boolean' || typeof val === 'string') {
        return val;
    }

    if (val instanceof Date) {
        return isNaN(val.getTime()) ? null : val.toISOString();
    }

    if (Buffer.isBuffer(val) || val instanceof Uint8Array) {
        return {
            __type: 'binary',
            base64: Buffer.from(val).toString('base64'),
        };
    }

    if (Array.isArray(val)) {
        return val.map((item) => normalizeValue(item));
    }

    if (typeof val === 'object') {
        const anyVal = val as Record<string, unknown>;

        // Decimal-like objects (e.g. decimal.js, bignumber, pg numeric, mssql decimal)
        if (typeof anyVal.toNumber === 'function') {
            try {
                return (anyVal.toNumber as () => number)();
            } catch {
                return Number(String(val));
            }
        }
        if (anyVal.isDecimal || anyVal._isBigNumber) {
            return Number(String(val));
        }

        // Generic object: deeply clone and normalize properties
        const result: Record<string, unknown> = {};
        for (const [k, v] of Object.entries(anyVal)) {
            result[k] = normalizeValue(v);
        }
        return result;
    }

    return String(val);
}

export function normalizeRows(rows: unknown[][]): unknown[][] {
    return rows.map((row) => row.map((cell) => normalizeValue(cell)));
}

export function normalizeQueryResult(result: QueryResult): QueryResult {
    return {
        ...result,
        rows: normalizeRows(result.rows),
        rowCount: result.rows.length,
    };
}
