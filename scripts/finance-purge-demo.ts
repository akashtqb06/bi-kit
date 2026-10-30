#!/usr/bin/env tsx
// pnpm finance:purge-demo --user <email> [--dry-run]
// NEVER deletes anything. Lists candidate rows that look like demo/seed data.
// --confirm is intentionally not implemented.

import { parseArgs } from 'node:util';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, users, finAccounts, finTransactions } from '@src/lib/db';

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      user: { type: 'string', short: 'u' },
      'dry-run': { type: 'boolean', default: true },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || !values.user) {
    console.log(`Usage: pnpm finance:purge-demo --user <email> [--dry-run]`);
    console.log(`Note: This is a dry-run only script. It NEVER deletes any data.`);
    process.exit(values.help ? 0 : 1);
  }

  const email = values.user.trim().toLowerCase();
  const [user] = await db
    .select()
    .from(users)
    .where(eq(sql`lower(${users.email})`, email))
    .limit(1);

  if (!user) {
    console.error(`Error: User with email "${email}" not found.`);
    process.exit(1);
  }

  const userId = user.id;

  console.log(`\n======================================================`);
  console.log(` Finance Purge-Demo Scan (DRY-RUN ONLY)`);
  console.log(` User:  ${user.name} (${user.email}) [id: ${user.id}]`);
  console.log(`======================================================\n`);

  // Query accounts
  const accounts = await db
    .select({
      id: finAccounts.id,
      name: finAccounts.name,
      kind: finAccounts.kind,
      class: finAccounts.class,
      createdAt: finAccounts.createdAt,
    })
    .from(finAccounts)
    .where(eq(finAccounts.userId, userId))
    .limit(50);

  // Query transactions
  const transactions = await db
    .select({
      id: finTransactions.id,
      accountId: finTransactions.accountId,
      date: finTransactions.date,
      type: finTransactions.type,
      amount: finTransactions.amount,
      payee: finTransactions.payee,
      note: finTransactions.note,
    })
    .from(finTransactions)
    .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)))
    .limit(50);

  console.log(`Accounts found for user (${accounts.length} scanned):`);
  for (const acc of accounts.slice(0, 10)) {
    console.log(`  - [${acc.id}] "${acc.name}" (${acc.kind}, ${acc.class})`);
  }
  if (accounts.length > 10) {
    console.log(`  ... and ${accounts.length - 10} more accounts.`);
  }

  console.log(`\nTransactions found for user (${transactions.length} scanned):`);
  for (const tx of transactions.slice(0, 10)) {
    console.log(
      `  - [${tx.id}] ${tx.date} | ${tx.type.padEnd(8)} | amount: ${tx.amount} paise | payee: "${tx.payee ?? 'N/A'}"`
    );
  }
  if (transactions.length > 10) {
    console.log(`  ... and ${transactions.length - 10} more transactions.`);
  }

  console.log(`\n------------------------------------------------------`);
  console.log(`[DRY-RUN RESULT] Total candidate accounts: ${accounts.length}`);
  console.log(`[DRY-RUN RESULT] Total candidate transactions: ${transactions.length}`);
  console.log(`------------------------------------------------------`);
  console.log(`Deletion not implemented. This is a dry-run only script. No data was deleted or modified.\n`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});

