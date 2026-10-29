import pg from 'pg';

async function main() {
  const name = process.argv[2];
  if (!name) {
    console.error('Usage: tsx scripts/create-local-db.ts <name>');
    process.exit(1);
  }

  const cleanName = name.replace(/[^a-zA-Z0-9_]/g, '_').toLowerCase();
  const dbName = cleanName.startsWith('bikit_') ? cleanName : `bikit_${cleanName}`;

  // Connect to default 'postgres' database to create the new database
  const baseUrl =
    process.env.PG_BASE_URL ||
    process.env.DATABASE_URL ||
    'postgres://postgres:bi_password_123!@localhost:5432/postgres';

  const url = new URL(baseUrl);
  url.pathname = '/postgres';

  const client = new pg.Client({
    connectionString: url.toString(),
  });

  try {
    await client.connect();
    const res = await client.query(
      `SELECT 1 FROM pg_database WHERE datname = $1`,
      [dbName]
    );

    if (res.rowCount && res.rowCount > 0) {
      console.log(`Database "${dbName}" already exists.`);
    } else {
      await client.query(`CREATE DATABASE "${dbName}"`);
      console.log(`Successfully created database "${dbName}".`);
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`Warning: Could not connect to Postgres to create database "${dbName}": ${message}`);
    console.log(`If using PGlite or Docker, ensure PostgreSQL is reachable.`);
  } finally {
    await client.end().catch(() => {});
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

