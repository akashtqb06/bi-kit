import fs from 'node:fs';
import path from 'node:path';
import { eq, inArray } from 'drizzle-orm';
import { db as defaultDb } from '@src/lib/db';
import { users } from '@src/lib/db/schema';
import {
  finAccounts,
  finCategories,
  finTransactions,
  finValuations,
  finBudgets,
  finRecurringRules,
} from '@src/lib/db/schema/finance';
import { generateFinanceData, type PersonaName } from '@src/lib/finance/testdata/generator';
import { computeOracleExpectations } from '@src/lib/finance/testdata/oracle';

export interface SeedFinanceOptions {
  persona?: PersonaName;
  userEmail?: string;
  months?: number;
  size?: 'small' | 'large';
  relative?: boolean;
}

/**
 * Returns a working Drizzle database client.
 * Tries the primary PostgreSQL connection first; if unreachable (ECONNREFUSED / EPERM),
 * falls back seamlessly to PGlite with auto-migrated schema.
 */
async function resolveDbClient() {
  try {
    await defaultDb.select().from(users).limit(1);
    return defaultDb;
  } catch (_err: unknown) {
    console.log('PostgreSQL connection not reachable, falling back to embedded PGlite...');
    const { PGlite } = await import('@electric-sql/pglite');
    const { drizzle } = await import('drizzle-orm/pglite');
    const schema = await import('@src/lib/db/schema');
    const finSchema = await import('@src/lib/db/schema/finance');

    const pglite = new PGlite();

    // Execute schema migrations
    const initSqlPath = path.resolve(process.cwd(), 'src/lib/db/migrations/0000_init.sql');
    if (fs.existsSync(initSqlPath)) {
      const initSql = fs.readFileSync(initSqlPath, 'utf8');
      for (const stmt of initSql.split('--> statement-breakpoint')) {
        if (stmt.trim()) await pglite.exec(stmt);
      }
    }

    const finSqlPath = path.resolve(process.cwd(), 'src/lib/db/migrations/0001_real_dark_phoenix.sql');
    if (fs.existsSync(finSqlPath)) {
      const finSql = fs.readFileSync(finSqlPath, 'utf8');
      for (const stmt of finSql.split('--> statement-breakpoint')) {
        if (stmt.trim()) await pglite.exec(stmt);
      }
    }

    const drizzleDb = drizzle(pglite, { schema: { ...schema, ...finSchema } });
    return drizzleDb as unknown as typeof defaultDb;
  }
}

export async function seedFinanceDatabase(options: SeedFinanceOptions = {}) {
  const persona: PersonaName = options.persona || 'salaried-urban';
  const email = (options.userEmail || 'member@example.com').trim().toLowerCase();
  const months = options.months ?? 24;
  const size = options.size || 'small';
  const relative = Boolean(options.relative);

  console.log(`\n======================================================`);
  console.log(`Seeding Finance Data`);
  console.log(`  Persona:  ${persona}`);
  console.log(`  User:     ${email}`);
  console.log(`  Months:   ${months}`);
  console.log(`  Size:     ${size}`);
  console.log(`  Relative: ${relative}`);
  console.log(`======================================================\n`);

  const db = await resolveDbClient();

  // 1. Find or create user
  let userList = await db.select().from(users).where(eq(users.email, email)).limit(1);
  let user = userList[0];
  if (!user) {
    const existingUsers = await db.select().from(users).limit(1);
    if (existingUsers.length > 0) {
      user = existingUsers[0];
    } else {
      const userId = 'usr_member_default';
      await db.insert(users).values({
        id: userId,
        email,
        name: 'Demo Member',
        passwordHash: 'seeded_hash',
        role: 'member',
        status: 'active',
      });
      userList = await db.select().from(users).where(eq(users.email, email)).limit(1);
      user = userList[0];
    }
  }

  const userId = user.id;

  // 2. Idempotent Cleanup: Delete existing finance records for this user
  console.log(`Cleaning up existing finance records for user ${userId}...`);

  // Delete transactions
  await db.delete(finTransactions).where(eq(finTransactions.userId, userId));

  // Find user's accounts to delete valuations
  const existingAccounts = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(eq(finAccounts.userId, userId));
  const existingAccountIds = existingAccounts.map((a) => a.id);

  if (existingAccountIds.length > 0) {
    await db.delete(finValuations).where(inArray(finValuations.accountId, existingAccountIds));
  }

  // Delete budgets & recurring rules
  await db.delete(finBudgets).where(eq(finBudgets.userId, userId));
  await db.delete(finRecurringRules).where(eq(finRecurringRules.userId, userId));

  // Delete accounts & categories
  await db.delete(finAccounts).where(eq(finAccounts.userId, userId));
  await db.delete(finCategories).where(eq(finCategories.userId, userId));

  console.log(`Existing finance data cleared.`);

  // 3. Generate data
  console.log(`Generating deterministic dataset for ${persona}...`);
  const data = generateFinanceData({
    persona,
    userId,
    months,
    size,
    relative,
  });

  // 4. Insert Categories
  console.log(`Inserting ${data.categories.length} categories...`);
  const categoriesToInsert = data.categories.map((c) => ({
    id: c.id,
    userId: null,
    name: c.name,
    type: c.type,
    parentId: c.parentId || null,
    icon: c.icon || null,
    color: c.color || null,
    isSystem: true,
    createdAt: new Date(c.createdAt),
    updatedAt: new Date(c.updatedAt),
  }));

  for (const cat of categoriesToInsert) {
    const existing = await db
      .select({ id: finCategories.id })
      .from(finCategories)
      .where(eq(finCategories.id, cat.id))
      .limit(1);
    if (!existing.length) {
      await db.insert(finCategories).values(cat);
    }
  }

  // 5. Insert Accounts
  console.log(`Inserting ${data.accounts.length} accounts...`);
  const accountsToInsert = data.accounts.map((a) => ({
    id: a.id,
    userId,
    name: a.name,
    kind: a.kind,
    class: a.class,
    currency: a.currency,
    creditLimit: a.creditLimit || null,
    isActive: a.isActive,
    metadata: a.metadata || {},
    createdAt: new Date(a.createdAt),
    updatedAt: new Date(a.updatedAt),
  }));
  await db.insert(finAccounts).values(accountsToInsert);

  // 6. Insert Transactions in Batches
  console.log(`Inserting ${data.transactions.length} transactions...`);
  const CHUNK_SIZE = 2000;
  for (let i = 0; i < data.transactions.length; i += CHUNK_SIZE) {
    const chunk = data.transactions.slice(i, i + CHUNK_SIZE).map((t) => ({
      id: t.id,
      userId,
      accountId: t.accountId,
      toAccountId: t.toAccountId || null,
      categoryId: t.categoryId || null,
      date: t.date,
      type: t.type,
      amount: t.amount,
      signedAmount: t.signedAmount,
      payee: t.payee || null,
      note: t.note || null,
      tags: t.tags || null,
      clientRequestId: t.clientRequestId || null,
      importHash: t.importHash || null,
      isRecurring: t.isRecurring,
      recurringRuleId: t.recurringRuleId || null,
      deletedAt: t.deletedAt ? new Date(t.deletedAt) : null,
      createdAt: new Date(t.createdAt),
      updatedAt: new Date(t.updatedAt),
    }));

    await db.insert(finTransactions).values(chunk);
    if (data.transactions.length > 5000) {
      console.log(`  Inserted ${Math.min(i + CHUNK_SIZE, data.transactions.length)} / ${data.transactions.length}`);
    }
  }

  // 7. Insert Valuations
  if (data.valuations.length > 0) {
    console.log(`Inserting ${data.valuations.length} valuations...`);
    const valChunk = data.valuations.map((v) => ({
      id: v.id,
      accountId: v.accountId,
      date: v.date,
      value: v.value,
      costBasis: v.costBasis || null,
      note: v.note || null,
      createdAt: new Date(v.createdAt),
      updatedAt: new Date(v.updatedAt),
    }));
    await db.insert(finValuations).values(valChunk);
  }

  // 8. Insert Budgets
  if (data.budgets.length > 0) {
    console.log(`Inserting ${data.budgets.length} budgets...`);
    const budgetChunk = data.budgets.map((b) => ({
      id: b.id,
      userId,
      categoryId: b.categoryId,
      amount: b.amount,
      period: b.period,
      startDate: b.startDate,
      endDate: b.endDate || null,
      createdAt: new Date(b.createdAt),
      updatedAt: new Date(b.updatedAt),
    }));
    await db.insert(finBudgets).values(budgetChunk);
  }

  // 9. Insert Recurring Rules
  if (data.recurringRules.length > 0) {
    console.log(`Inserting ${data.recurringRules.length} recurring rules...`);
    const rulesChunk = data.recurringRules.map((r) => ({
      id: r.id,
      userId,
      accountId: r.accountId,
      toAccountId: r.toAccountId || null,
      categoryId: r.categoryId || null,
      type: r.type,
      amount: r.amount,
      payee: r.payee || null,
      note: r.note || null,
      frequency: r.frequency,
      interval: r.interval,
      startDate: r.startDate,
      endDate: r.endDate || null,
      nextOccurrence: r.nextOccurrence,
      isActive: r.isActive,
      createdAt: new Date(r.createdAt),
      updatedAt: new Date(r.updatedAt),
    }));
    await db.insert(finRecurringRules).values(rulesChunk);
  }

  // 10. Compute Oracle & Print Summary Table
  const oracle = computeOracleExpectations(data);
  const latestNetWorth =
    oracle.monthEndNetWorth.length > 0
      ? oracle.monthEndNetWorth[oracle.monthEndNetWorth.length - 1].netWorth
      : 0;

  console.log(`\n======================================================`);
  console.log(`SEED SUMMARY: ${persona.toUpperCase()}`);
  console.log(`======================================================`);
  console.log(`User:                 ${user.email} (${userId})`);
  console.log(`Anchor Date:          ${data.anchorDate}`);
  console.log(`Accounts Seeded:      ${data.accounts.length}`);
  console.log(`Transactions Seeded:  ${data.transactions.length}`);
  console.log(`Valuations Seeded:    ${data.valuations.length}`);
  console.log(`Budgets Seeded:       ${data.budgets.length}`);
  console.log(`Recurring Rules:      ${data.recurringRules.length}`);
  console.log(
    `Net Worth at Anchor:  ₹${(latestNetWorth / 100).toLocaleString('en-IN', {
      minimumFractionDigits: 2,
    })} (${latestNetWorth} paise)`
  );
  console.log(`======================================================\n`);

  return {
    user,
    persona,
    accountsCount: data.accounts.length,
    transactionsCount: data.transactions.length,
    netWorthPaise: latestNetWorth,
  };
}

// CLI argument parsing when run directly
if (process.argv[1]?.endsWith('finance.ts')) {
  const args = process.argv.slice(2);
  let persona: PersonaName = 'salaried-urban';
  let userEmail = 'member@example.com';
  let months = 24;
  let size: 'small' | 'large' = 'small';
  let relative = false;

  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--persona' && args[i + 1]) {
      persona = args[++i] as PersonaName;
    } else if (args[i] === '--user' && args[i + 1]) {
      userEmail = args[++i];
    } else if (args[i] === '--months' && args[i + 1]) {
      months = parseInt(args[++i], 10);
    } else if (args[i] === '--size' && args[i + 1]) {
      size = args[++i] as 'small' | 'large';
    } else if (args[i] === '--relative') {
      relative = true;
    }
  }

  seedFinanceDatabase({ persona, userEmail, months, size, relative })
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Failed to seed finance database:', err);
      process.exit(1);
    });
}
