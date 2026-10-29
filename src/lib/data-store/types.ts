import { z } from 'zod';

export const updateTableSettingsSchema = z.object({
    storeTable: z.string().min(1).regex(/^[a-zA-Z0-9_]+$/, 'Table name must contain only alphanumeric characters and underscores').optional(),
    schedule: z.enum(['manual', 'hourly', 'daily', 'weekly']).optional(),
    syncMode: z.enum(['full', 'incremental']).optional(),
    cursorColumn: z.string().nullable().optional(),
    indexedColumns: z.array(z.string()).optional(),
    includedColumns: z.array(z.string()).nullable().optional(),
});

export type UpdateTableSettingsInput = z.infer<typeof updateTableSettingsSchema>;

export const createDataStoreTablesSchema = z.object({
    dataSourceId: z.string().min(1),
    tables: z.array(
        z.object({
            sourceTable: z.string().min(1),
            schedule: z.enum(['manual', 'hourly', 'daily', 'weekly']).default('manual'),
            syncMode: z.enum(['full', 'incremental']).default('full'),
            cursorColumn: z.string().optional(),
        })
    ).min(1),
});

export type CreateDataStoreTablesInput = z.infer<typeof createDataStoreTablesSchema>;

export interface TableSyncResult {
    tableId: string;
    status: 'success' | 'error' | 'cancelled';
    rowsSynced: number;
    sizeBytes: number;
    durationMs: number;
    error?: string;
}

export interface SyncProgressCallback {
    (rowsSynced: number, status: 'running' | 'success' | 'error' | 'cancelled'): void;
}

export interface DataStoreQuotas {
    maxMbPerUser: number;
    maxRowsPerTable: number;
    usedBytes: number;
    usedMb: number;
    tableCount: number;
}
