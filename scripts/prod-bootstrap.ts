import pg from 'pg';
import { randomBytes, scrypt as scryptCallback } from 'node:crypto';
import {
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../src/lib/finance/constants';
import { getDeterministicCategoryColor } from '../src/lib/finance/colors';

function generateId(): string {
  return randomBytes(12).toString('hex');
}

const COST = 2 ** 15;
const BLOCK_SIZE = 8;
const PARALLELIZATION = 1;
const SALT_LENGTH = 16;
const KEY_LENGTH = 64;
const MAX_MEMORY = 64 * 1024 * 1024;

function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_LENGTH);
  return new Promise((resolve, reject) => {
    scryptCallback(
      password,
      salt,
      KEY_LENGTH,
      { N: COST, r: BLOCK_SIZE, p: PARALLELIZATION, maxmem: MAX_MEMORY },
      (error, key) => {
        if (error) reject(error);
        else {
          resolve(
            `scrypt$${COST}$${BLOCK_SIZE}$${PARALLELIZATION}$${salt.toString('base64url')}$${(key as Buffer).toString('base64url')}`
          );
        }
      }
    );
  });
}

async function runBootstrap() {
  const dbUrl = process.env.DATABASE_URL;
  if (!dbUrl) {
    console.error('❌ DATABASE_URL is not set.');
    process.exit(1);
  }

  const client = new pg.Client({ connectionString: dbUrl });
  await client.connect();

  try {
    // 1. Ensure system categories exist idempotently
    const now = new Date();
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      const existing = await client.query(
        'SELECT id FROM fin_categories WHERE name = $1 AND is_system = true LIMIT 1',
        [name]
      );
      if (existing.rowCount === 0) {
        const color = getDeterministicCategoryColor(name);
        await client.query(
          `INSERT INTO fin_categories (id, user_id, name, type, color, is_system, created_at, updated_at)
           VALUES ($1, NULL, $2, 'expense', $3, true, $4, $4)`,
          [generateId(), name, color, now]
        );
      }
    }

    for (const name of DEFAULT_INCOME_CATEGORIES) {
      const existing = await client.query(
        'SELECT id FROM fin_categories WHERE name = $1 AND is_system = true LIMIT 1',
        [name]
      );
      if (existing.rowCount === 0) {
        const color = getDeterministicCategoryColor(name);
        await client.query(
          `INSERT INTO fin_categories (id, user_id, name, type, color, is_system, created_at, updated_at)
           VALUES ($1, NULL, $2, 'income', $3, true, $4, $4)`,
          [generateId(), name, color, now]
        );
      }
    }

    // 1b. Idempotent category color backfill for any existing categories with null color
    const nullCats = await client.query(
      'SELECT id, name FROM fin_categories WHERE color IS NULL'
    );
    if (nullCats.rowCount && nullCats.rowCount > 0) {
      console.log(`🎨 Backfilling colors for ${nullCats.rowCount} category record(s)...`);
      for (const row of nullCats.rows) {
        const color = getDeterministicCategoryColor(row.name);
        await client.query(
          'UPDATE fin_categories SET color = $1, updated_at = $2 WHERE id = $3 AND color IS NULL',
          [color, now, row.id]
        );
      }
      console.log(`✅ Category colors backfilled successfully.`);
    }

    // 2. Check if users already exist
    const countRes = await client.query('SELECT COUNT(*)::int AS count FROM users');
    const userCount = countRes.rows[0]?.count ?? 0;

    if (userCount > 0) {
      console.log(`ℹ️ Database already initialized (${userCount} user(s) found). Skipping admin bootstrap.`);
      return;
    }

    // 3. First-run bootstrap
    const adminEmail = (
      process.env.BOOTSTRAP_ADMIN_EMAIL ||
      process.env.SEED_ADMIN_EMAIL ||
      'admin@example.com'
    ).trim().toLowerCase();

    const adminName = (
      process.env.BOOTSTRAP_ADMIN_NAME ||
      process.env.SEED_ADMIN_NAME ||
      'Admin'
    ).trim();

    const adminPassword =
      process.env.BOOTSTRAP_ADMIN_PASSWORD ||
      process.env.SEED_ADMIN_PASSWORD;

    if (!adminPassword) {
      console.error('❌ First-run bootstrap requires BOOTSTRAP_ADMIN_PASSWORD environment variable.');
      process.exit(1);
    }

    console.log(`⏳ First-run: Creating bootstrap admin account for ${adminEmail}...`);
    const passwordHash = await hashPassword(adminPassword);
    const adminId = generateId();

    await client.query(
      `INSERT INTO users (id, email, name, password_hash, role, status, created_at, updated_at)
       VALUES ($1, $2, $3, $4, 'admin', 'active', $5, $5)`,
      [adminId, adminEmail, adminName, passwordHash, now]
    );

    console.log(`✅ Admin account created successfully (${adminEmail}).`);

    // 4. Demo data seed check
    if (process.env.SEED_DEMO === 'true') {
      console.log('🌱 SEED_DEMO=true detected: seeding demo datasets...');
      // If demo seed is requested
    } else {
      console.log('🔒 Production mode: no demo data seeded (SEED_DEMO is not true).');
    }
  } finally {
    await client.end();
  }
}

runBootstrap().catch((err) => {
  console.error('❌ Bootstrap failed:', err);
  process.exit(1);
});

