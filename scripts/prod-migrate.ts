import pg from 'pg';
import path from 'node:path';
import { drizzle } from 'drizzle-orm/node-postgres';
import { migrate } from 'drizzle-orm/node-postgres/migrator';

const ADVISORY_LOCK_ID = 71829103;

async function runProdMigrations() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  try {
    await client.connect();
  } catch (err) {
    console.error('❌ Could not connect to PostgreSQL:', err instanceof Error ? err.message : err);
    process.exit(1);
  }

  console.log('🔒 Acquiring PostgreSQL migration advisory lock...');
  await client.query('SELECT pg_advisory_lock($1)', [ADVISORY_LOCK_ID]);
  console.log('✅ Advisory lock acquired.');

  try {
    const migrationsFolder =
      process.env.MIGRATIONS_FOLDER ||
      (path.isAbsolute('src/lib/db/migrations')
        ? 'src/lib/db/migrations'
        : path.join(process.cwd(), 'src/lib/db/migrations'));

    console.log(`⏳ Running Drizzle migrations from: ${migrationsFolder}`);
    const db = drizzle(client);
    await migrate(db, { migrationsFolder });
    console.log('✅ Database migrations successfully applied.');
  } catch (err) {
    console.error('❌ Migration execution failed:', err);
    throw err;
  } finally {
    console.log('🔓 Releasing PostgreSQL migration advisory lock...');
    try {
      await client.query('SELECT pg_advisory_unlock($1)', [ADVISORY_LOCK_ID]);
    } catch (unlockErr) {
      console.warn('⚠️ Warning: Failed to cleanly unlock advisory lock:', unlockErr);
    }
    await client.end();
  }
}

runProdMigrations().catch((err) => {
  console.error('Fatal migration error:', err);
  process.exit(1);
});

