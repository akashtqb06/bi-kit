import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { PGlite } from '@electric-sql/pglite';
import { drizzle } from 'drizzle-orm/pglite';
import { migrate } from 'drizzle-orm/pglite/migrator';

describe('Finance Migration on PGlite', () => {
  it('successfully applies all PostgreSQL migrations on a fresh PGlite database', async () => {
    const pglite = new PGlite();
    const db = drizzle(pglite);
    const migrationsFolder = path.join(process.cwd(), 'src/lib/db/migrations');

    // Run the migrations against the fresh PGlite database
    await expect(migrate(db, { migrationsFolder })).resolves.not.toThrow();

    // Verify finance tables exist and can be queried
    const result = await pglite.query<{ table_name: string }>(`
      SELECT table_name
      FROM information_schema.tables
      WHERE table_schema = 'public'
      ORDER BY table_name;
    `);

    const tableNames = result.rows.map((r) => r.table_name);

    expect(tableNames).toContain('fin_accounts');
    expect(tableNames).toContain('fin_categories');
    expect(tableNames).toContain('fin_transactions');
    expect(tableNames).toContain('fin_valuations');
    expect(tableNames).toContain('fin_budgets');
    expect(tableNames).toContain('fin_recurring_rules');
    expect(tableNames).toContain('fin_user_settings');

    // Verify CHECK constraints are active
    const checkConstraints = await pglite.query<{ conname: string }>(`
      SELECT conname
      FROM pg_constraint
      WHERE contype = 'c';
    `);

    const constraintNames = checkConstraints.rows.map((r) => r.conname);
    expect(constraintNames).toContain('fin_transactions_amount_check');
    expect(constraintNames).toContain('fin_transactions_transfer_check');

    await pglite.close();
  });
});

