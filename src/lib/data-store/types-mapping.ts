import type { DataStoreColumnMeta } from '@src/lib/db/schema/data-store';
import type { ColumnSnapshot } from '@src/lib/connectors/types';

export function mapSourceTypeToPg(type: string, nativeType?: string): string {
    const norm = (nativeType || type || '').toLowerCase().trim();

    if (norm.includes('int8') || norm.includes('bigint')) {
        return 'bigint';
    }
    if (norm.includes('int') || norm.includes('serial') || norm === 'integer') {
        return 'integer';
    }
    if (
        norm.includes('float') ||
        norm.includes('double') ||
        norm.includes('real') ||
        norm.includes('numeric') ||
        norm.includes('decimal')
    ) {
        return 'double precision';
    }
    if (norm.includes('bool')) {
        return 'boolean';
    }
    if (norm.includes('timestamp') || norm.includes('datetime')) {
        return 'timestamp with time zone';
    }
    if (norm === 'date') {
        return 'date';
    }
    if (norm.includes('json') || norm.includes('array')) {
        return 'jsonb';
    }
    return 'text';
}

export function sanitizeIdent(name: string): string {
    // Preserve letters, numbers, underscores; replace everything else with _
    const cleaned = name.replace(/[^a-zA-Z0-9_]/g, '_');
    if (/^[0-9]/.test(cleaned)) {
        return `_${cleaned}`;
    }
    return cleaned.toLowerCase() || 'col';
}

export function quoteIdent(ident: string): string {
    return `"${ident.replace(/"/g, '""')}"`;
}

export function normalizeColumnSnapshots(
    columns: ColumnSnapshot[],
    pkColumns: string[] = []
): DataStoreColumnMeta[] {
    const pkSet = new Set(pkColumns.map((c) => c.toLowerCase()));

    return columns.map((col) => {
        const pgType = mapSourceTypeToPg(col.type, col.nativeType);
        const isPk = pkSet.has(col.name.toLowerCase()) || Boolean(col.isPrimaryKey);

        return {
            name: col.name,
            type: col.type,
            nativeType: pgType,
            nullable: col.nullable ?? true,
            isPk,
            isIndexed: isPk,
            included: true,
        };
    });
}

