#!/usr/bin/env tsx
// pnpm finance:verify --user <email>
// Connects to DB and prints a reconciliation report for the given user

import { parseArgs } from 'node:util';
import { and, desc, eq, isNull, lte, sql } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { users } from '@src/lib/db/schema';
import { finAccounts, finTransactions, finValuations } from '@src/lib/db';
import { formatINR } from '@src/components/finance/shared/format';

async function main() {
  const { values } = parseArgs({
    args: process.argv.slice(2),
    options: {
      user: { type: 'string', short: 'u' },
      help: { type: 'boolean', short: 'h' },
    },
  });

  if (values.help || !values.user) {
    console.log(`Usage: pnpm finance:verify --user <email>`);
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
  const today = new Date().toISOString().slice(0, 10);

  console.log(`\n======================================================`);
  console.log(` Finance Health Verification`);
  console.log(` User:  ${user.name} (${user.email}) [id: ${user.id}]`);
  console.log(` As Of: ${today}`);
  console.log(`======================================================\n`);

  // Count rows
  const [accountsCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(finAccounts)
    .where(eq(finAccounts.userId, userId));

  const [txCount] = await db
    .select({ count: sql<number>`COUNT(*)` })
    .from(finTransactions)
    .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)));

  console.log(`Counts:`);
  console.log(`  Total Accounts:     ${accountsCount?.count ?? 0}`);
  console.log(`  Active Transactions: ${txCount?.count ?? 0}\n`);

  // Reconcile accounts
  const accs = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)))
    .orderBy(finAccounts.name);

  const sourceSums = await db
    .select({
      accountId: finTransactions.accountId,
      total: sql<string>`COALESCE(SUM(${finTransactions.signedAmount}), 0)`,
    })
    .from(finTransactions)
    .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)))
    .groupBy(finTransactions.accountId);

  const targetSums = await db
    .select({
      accountId: finTransactions.toAccountId,
      total: sql<string>`COALESCE(SUM(${finTransactions.amount}), 0)`,
    })
    .from(finTransactions)
    .where(
      and(
        eq(finTransactions.userId, userId),
        eq(finTransactions.type, 'transfer'),
        isNull(finTransactions.deletedAt)
      )
    )
    .groupBy(finTransactions.toAccountId);

  const sourceMap = new Map<string, number>();
  for (const r of sourceSums) sourceMap.set(r.accountId, Number(r.total));
  const targetMap = new Map<string, number>();
  for (const r of targetSums) {
    if (r.accountId) targetMap.set(r.accountId, Number(r.total));
  }

  // Valuations
  const valRows = await db
    .select({
      accountId: finValuations.accountId,
      value: finValuations.value,
      costBasis: finValuations.costBasis,
    })
    .from(finValuations)
    .where(lte(finValuations.date, today))
    .orderBy(finValuations.accountId, desc(finValuations.date));

  const valMap = new Map<string, number>();
  for (const v of valRows) {
    if (!valMap.has(v.accountId)) valMap.set(v.accountId, Number(v.value));
  }

  let totalAssets = 0;
  let totalLiabilities = 0;

  console.log(`Accounts Breakdown:`);
  console.log(`------------------------------------------------------------------------------------------------`);
  console.log(
    ` ${'Account Name'.padEnd(28)} | ${'Kind'.padEnd(16)} | ${'Class'.padEnd(10)} | ${'Balance'.padStart(14)} | ${'Valuation'.padStart(14)}`
  );
  console.log(`------------------------------------------------------------------------------------------------`);

  for (const acc of accs) {
    const rawBalance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
    const valuation = valMap.get(acc.id);
    const isLiability = acc.class === 'liability';
    const effectiveBalance = valuation !== undefined ? valuation : rawBalance;

    if (isLiability) {
      totalLiabilities += Math.max(0, -rawBalance);
    } else {
      totalAssets += effectiveBalance;
    }

    const balStr = formatINR(rawBalance);
    const valStr = valuation !== undefined ? formatINR(valuation) : '-';
    console.log(
      ` ${acc.name.padEnd(28).slice(0, 28)} | ${acc.kind.padEnd(16)} | ${acc.class.padEnd(10)} | ${balStr.padStart(14)} | ${valStr.padStart(14)}`
    );
  }

  console.log(`------------------------------------------------------------------------------------------------\n`);

  const netWorth = totalAssets - totalLiabilities;
  console.log(`Reconciliation Summary:`);
  console.log(`  Total Assets:      ${formatINR(totalAssets).padStart(14)}`);
  console.log(`  Total Liabilities: ${formatINR(totalLiabilities).padStart(14)}`);
  console.log(`  Net Worth:         ${formatINR(netWorth).padStart(14)}\n`);
  console.log(`Verification completed successfully.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
