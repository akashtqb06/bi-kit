import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import Database from 'better-sqlite3';
import path from 'node:path';
import fs from 'node:fs';
import { db } from '@src/lib/db';
import { users, dataSources } from '@src/lib/db/schema';
import { dataStoreTables } from '@src/lib/db/schema/data-store';
import { eq } from 'drizzle-orm';
import { newId } from '@src/lib/db/id';
import { DATA_DIR } from '@src/lib/db/paths';
import { syncTable, executeDbQuery } from '../sync-engine';
import { getStoreSchemaName } from '../service';
import { mapSourceTypeToPg } from '../types-mapping';
import { assertRowCountLimit, QuotaExceededError } from '../quotas';
import { runDueSchedules } from '../scheduler';

describe('Data Store Sync Engine', () => {
    let testUserId: string;
    let sqliteSourceId: string;
    let customDbPath: string;
    let customDb: Database.Database;

    beforeAll(async () => {
        // Find or create test user
        const [existingUser] = await db.select().from(users).limit(1);
        testUserId = existingUser ? existingUser.id : newId();
        if (!existingUser) {
            await db.insert(users).values({
                id: testUserId,
                email: 'sync-test@example.com',
                name: 'Sync Test User',
                passwordHash: 'hash',
            });
        }

        // Create a custom SQLite fixture database in DATA_DIR
        customDbPath = path.join(DATA_DIR, 'sync-fixture.db');
        customDb = new Database(customDbPath);
        customDb.exec(`
            CREATE TABLE products (
                id INTEGER PRIMARY KEY,
                name TEXT NOT NULL,
                price REAL NOT NULL,
                is_active INTEGER DEFAULT 1,
                updated_at TEXT NOT NULL
            );
            INSERT INTO products (id, name, price, is_active, updated_at) VALUES
                (1, 'Product A', 10.50, 1, '2026-01-01T10:00:00Z'),
                (2, 'Product B', 25.00, 1, '2026-01-02T10:00:00Z'),
                (3, 'Product C', 99.99, 0, '2026-01-03T10:00:00Z');
        `);

        // Register custom SQLite dataSource
        sqliteSourceId = newId();
        await db.insert(dataSources).values({
            id: sqliteSourceId,
            ownerId: testUserId,
            name: 'Fixture SQLite',
            type: 'sqlite',
            config: { managedPath: customDbPath },
            status: 'ok',
        });
    });

    afterAll(async () => {
        try {
            customDb.close();
            if (fs.existsSync(customDbPath)) fs.unlinkSync(customDbPath);
        } catch {}
    });

    it('successfully performs a full sync with atomic swap and correct row counts and values', async () => {
        const storeSchema = getStoreSchemaName(testUserId);
        const storeTable = 'products_test_live';

        const [tableRecord] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: testUserId,
                dataSourceId: sqliteSourceId,
                kind: 'table',
                sourceTable: 'products',
                storeSchema,
                storeTable,
                schedule: 'manual',
                syncMode: 'full',
                status: 'pending',
            })
            .returning();

        const result = await syncTable(tableRecord.id, { forceFull: true });
        expect(result.status).toBe('success');
        expect(result.rowsSynced).toBe(3);

        // Verify data in PostgreSQL/PGlite store table
        const queryRes = await executeDbQuery(`SELECT * FROM "${storeSchema}"."${storeTable}" ORDER BY id ASC`);
        expect(queryRes.rowCount).toBe(3);
        expect(queryRes.rows[0].name).toBe('Product A');
        expect(Number(queryRes.rows[0].price)).toBe(10.50);
        expect(queryRes.rows[2].name).toBe('Product C');

        // Verify status in data_store_tables
        const [updated] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, tableRecord.id));
        expect(updated.status).toBe('synced');
        expect(updated.rowCount).toBe(3);
        expect(updated.lastSyncedAt).not.toBeNull();
    });

    it('atomic swap: keeps existing live table data untouched when a subsequent sync fails', async () => {
        const storeSchema = getStoreSchemaName(testUserId);
        const storeTable = 'products_atomic_swap';

        // 1. Initial successful sync
        const [tableRecord] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: testUserId,
                dataSourceId: sqliteSourceId,
                kind: 'table',
                sourceTable: 'products',
                storeSchema,
                storeTable,
                schedule: 'manual',
                syncMode: 'full',
                status: 'pending',
            })
            .returning();

        const firstResult = await syncTable(tableRecord.id, { forceFull: true });
        expect(firstResult.status).toBe('success');

        // Check live table has 3 rows
        const checkBefore = await executeDbQuery(`SELECT COUNT(*)::bigint AS count FROM "${storeSchema}"."${storeTable}"`);
        expect(Number(checkBefore.rows[0].count)).toBe(3);

        // 2. Change sourceTable to an invalid table name to force a sync failure
        await db
            .update(dataStoreTables)
            .set({ sourceTable: 'non_existent_table' })
            .where(eq(dataStoreTables.id, tableRecord.id));

        const secondResult = await syncTable(tableRecord.id, { forceFull: true });
        expect(secondResult.status).toBe('error');

        // 3. Verify original live table is completely untouched!
        const checkAfter = await executeDbQuery(`SELECT COUNT(*)::bigint AS count FROM "${storeSchema}"."${storeTable}"`);
        expect(Number(checkAfter.rows[0].count)).toBe(3);

        // Table status should reflect error, but live table remains intact
        const [errorTable] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, tableRecord.id));
        expect(errorTable.status).toBe('error');
        expect(errorTable.lastError).toContain('non_existent_table');
    });

    it('incremental sync: upserts new rows based on cursor column and updates high-water mark', async () => {
        const storeSchema = getStoreSchemaName(testUserId);
        const storeTable = 'products_incremental';

        // 1. Initial sync
        const [tableRecord] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: testUserId,
                dataSourceId: sqliteSourceId,
                kind: 'table',
                sourceTable: 'products',
                storeSchema,
                storeTable,
                schedule: 'manual',
                syncMode: 'incremental',
                cursorColumn: 'updated_at',
                status: 'pending',
            })
            .returning();

        const firstResult = await syncTable(tableRecord.id, { forceFull: true });
        expect(firstResult.status).toBe('success');
        expect(firstResult.rowsSynced).toBe(3);

        // Watermark should be the latest updated_at
        const [syncedTable] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, tableRecord.id));
        expect(syncedTable.lastWatermark).toBe('2026-01-03T10:00:00Z');

        // 2. Add a new product to SQLite with higher watermark
        customDb.prepare(`
            INSERT INTO products (id, name, price, is_active, updated_at)
            VALUES (4, 'Product D', 49.95, 1, '2026-01-04T12:00:00Z')
        `).run();

        // 3. Run incremental sync
        const incResult = await syncTable(tableRecord.id);
        expect(incResult.status).toBe('success');
        expect(incResult.rowsSynced).toBe(1);

        // Verify live store table now has 4 rows
        const queryRes = await executeDbQuery(`SELECT * FROM "${storeSchema}"."${storeTable}" ORDER BY id ASC`);
        expect(queryRes.rowCount).toBe(4);
        expect(queryRes.rows[3].name).toBe('Product D');

        // Check new watermark
        const [updatedTable] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, tableRecord.id));
        expect(updatedTable.lastWatermark).toBe('2026-01-04T12:00:00Z');
    });

    it('enforces table row limits and quota rejections cleanly', () => {
        const originalEnv = process.env.DATASTORE_MAX_ROWS_PER_TABLE;
        try {
            process.env.DATASTORE_MAX_ROWS_PER_TABLE = '100';
            expect(() => assertRowCountLimit(50)).not.toThrow();
            expect(() => assertRowCountLimit(150)).toThrow(QuotaExceededError);
        } finally {
            if (originalEnv) {
                process.env.DATASTORE_MAX_ROWS_PER_TABLE = originalEnv;
            } else {
                delete process.env.DATASTORE_MAX_ROWS_PER_TABLE;
            }
        }
    });

    it('maps source types to PostgreSQL types correctly', () => {
        expect(mapSourceTypeToPg('INTEGER')).toBe('integer');
        expect(mapSourceTypeToPg('INT8')).toBe('bigint');
        expect(mapSourceTypeToPg('BIGINT')).toBe('bigint');
        expect(mapSourceTypeToPg('REAL')).toBe('double precision');
        expect(mapSourceTypeToPg('FLOAT')).toBe('double precision');
        expect(mapSourceTypeToPg('BOOLEAN')).toBe('boolean');
        expect(mapSourceTypeToPg('DATETIME')).toBe('timestamp with time zone');
        expect(mapSourceTypeToPg('JSON')).toBe('jsonb');
        expect(mapSourceTypeToPg('TEXT')).toBe('text');
        expect(mapSourceTypeToPg('VARCHAR')).toBe('text');
    });

    it('scheduler: selects due hourly/daily tables and ignores manual tables', async () => {
        const storeSchema = getStoreSchemaName(testUserId);
        const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);

        // Hourly due table
        const [dueTable] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: testUserId,
                dataSourceId: sqliteSourceId,
                kind: 'table',
                sourceTable: 'products',
                storeSchema,
                storeTable: 'products_sched_due',
                schedule: 'hourly',
                syncMode: 'full',
                status: 'synced',
                lastSyncedAt: twoHoursAgo,
            })
            .returning();

        // Manual table
        const [manualTable] = await db
            .insert(dataStoreTables)
            .values({
                ownerId: testUserId,
                dataSourceId: sqliteSourceId,
                kind: 'table',
                sourceTable: 'products',
                storeSchema,
                storeTable: 'products_sched_manual',
                schedule: 'manual',
                syncMode: 'full',
                status: 'synced',
                lastSyncedAt: twoHoursAgo,
            })
            .returning();

        const runResult = await runDueSchedules({ timeBudgetMs: 30000, concurrency: 1 });
        expect(runResult.processed).toBeGreaterThanOrEqual(1);

        // Due table should have an updated lastSyncedAt
        const [refreshedDue] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, dueTable.id));
        expect(refreshedDue.lastSyncedAt?.getTime()).toBeGreaterThan(twoHoursAgo.getTime());

        // Manual table should still have the old lastSyncedAt
        const [refreshedManual] = await db
            .select()
            .from(dataStoreTables)
            .where(eq(dataStoreTables.id, manualTable.id));
        expect(refreshedManual.lastSyncedAt?.getTime()).toBe(twoHoursAgo.getTime());
    });
});
