import { eq, sum } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { dataStoreTables } from '@src/lib/db/schema/data-store';
import type { DataStoreQuotas } from './types';

export class QuotaExceededError extends Error {
    constructor(message: string) {
        super(message);
        this.name = 'QuotaExceededError';
    }
}

export function getMaxMbPerUser(): number {
    const envVal = process.env.DATASTORE_MAX_MB_PER_USER;
    if (envVal) {
        const parsed = parseInt(envVal, 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 2048; // 2 GB default
}

export function getMaxRowsPerTable(): number {
    const envVal = process.env.DATASTORE_MAX_ROWS_PER_TABLE;
    if (envVal) {
        const parsed = parseInt(envVal, 10);
        if (Number.isFinite(parsed) && parsed > 0) return parsed;
    }
    return 5_000_000; // 5M rows default
}

export async function getUserQuotas(userId: string): Promise<DataStoreQuotas> {
    const maxMb = getMaxMbPerUser();
    const maxRows = getMaxRowsPerTable();

    const [agg] = await db
        .select({
            totalBytes: sum(dataStoreTables.sizeBytes),
        })
        .from(dataStoreTables)
        .where(eq(dataStoreTables.ownerId, userId));

    const usedBytes = Number(agg?.totalBytes ?? 0);
    const usedMb = Math.round((usedBytes / (1024 * 1024)) * 100) / 100;

    const tables = await db
        .select({ id: dataStoreTables.id })
        .from(dataStoreTables)
        .where(eq(dataStoreTables.ownerId, userId));

    return {
        maxMbPerUser: maxMb,
        maxRowsPerTable: maxRows,
        usedBytes,
        usedMb,
        tableCount: tables.length,
    };
}

export async function assertUserCanSync(userId: string, _currentTableId?: string): Promise<void> {
    const quotas = await getUserQuotas(userId);
    const maxBytes = quotas.maxMbPerUser * 1024 * 1024;

    if (quotas.usedBytes >= maxBytes) {
        throw new QuotaExceededError(
            `Data Store storage quota exceeded (${quotas.usedMb} MB used of ${quotas.maxMbPerUser} MB allowed). Delete unused tables or upgrade storage.`
        );
    }
}

export function assertRowCountLimit(rowCount: number): void {
    const maxRows = getMaxRowsPerTable();
    if (rowCount > maxRows) {
        throw new QuotaExceededError(
            `Row limit exceeded for table (${rowCount.toLocaleString()} rows exceeds maximum of ${maxRows.toLocaleString()}).`
        );
    }
}
