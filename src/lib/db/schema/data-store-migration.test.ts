import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

describe('Data Store Migration on PGlite', () => {
    it('successfully applies all PostgreSQL migrations including data store tables on a fresh PGlite database', async () => {
        const pglite = new PGlite();
        const db = drizzle(pglite);
        const migrationsFolder = path.join(process.cwd(), 'src/lib/db/migrations');

        // Run migrations against fresh PGlite database
        await expect(migrate(db, { migrationsFolder })).resolves.not.toThrow();

        // Verify data store tables exist in public schema
        const result = await pglite.query<{ table_name: string }>(`
            SELECT table_name
            FROM information_schema.tables
            WHERE table_schema = 'public'
            ORDER BY table_name;
        `);

        const tableNames = result.rows.map((r) => r.table_name);

        expect(tableNames).toContain('data_store_tables');
        expect(tableNames).toContain('data_store_syncs');

        // Verify columns on data_store_tables
        const colResult = await pglite.query<{ column_name: string }>(`
            SELECT column_name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = 'data_store_tables';
        `);
        const colNames = colResult.rows.map((r) => r.column_name);

        expect(colNames).toContain('id');
        expect(colNames).toContain('owner_id');
        expect(colNames).toContain('data_source_id');
        expect(colNames).toContain('query_id');
        expect(colNames).toContain('kind');
        expect(colNames).toContain('source_table');
        expect(colNames).toContain('store_schema');
        expect(colNames).toContain('store_table');
        expect(colNames).toContain('columns');
        expect(colNames).toContain('row_count');
        expect(colNames).toContain('size_bytes');
        expect(colNames).toContain('status');
        expect(colNames).toContain('last_synced_at');
        expect(colNames).toContain('last_error');
        expect(colNames).toContain('schedule');
        expect(colNames).toContain('sync_mode');
        expect(colNames).toContain('cursor_column');
        expect(colNames).toContain('last_watermark');

        await pglite.close();
    });
});

