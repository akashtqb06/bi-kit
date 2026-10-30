import 'server-only';
import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { and, eq, isNull, sql } from 'drizzle-orm';
import { db, finAccounts, finTransactions } from '@src/lib/db';
import { jsonNoStore } from '../utils';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';

// Owner-only endpoint: checks DB integrity and reconciles balances
export async function GET() {
  try {
    const user = await requireUserApi();
    // Only allow admin or owner role
    if (user.role !== 'admin' && user.role !== 'owner') {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    const userId = user.id;

    const backend = process.env.FINANCE_BACKEND ?? 'db';
    const today = todayInTz(DEFAULT_TZ);

    // Count rows
    const [accountsCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(finAccounts)
      .where(eq(finAccounts.userId, userId));

    const [txCount] = await db
      .select({ count: sql<number>`COUNT(*)` })
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)));

    // Reconcile: compute balances independently with raw SQL
    const accs = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)));

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

    const accountReconciliation = accs.map((acc) => {
      const balance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
      const isLiability = acc.class === 'liability';
      const outstanding = isLiability ? Math.max(0, -balance) : 0;
      return {
        accountId: acc.id,
        name: acc.name,
        kind: acc.kind,
        class: acc.class,
        ledgerBalance: balance,
        outstanding,
      };
    });

    const totalAssets = accountReconciliation
      .filter((a) => a.class === 'asset')
      .reduce((sum, a) => sum + a.ledgerBalance, 0);
    const totalLiabilities = accountReconciliation
      .filter((a) => a.class === 'liability')
      .reduce((sum, a) => sum + a.outstanding, 0);
    const netWorth = totalAssets - totalLiabilities;

    return jsonNoStore({
      backend,
      databaseConnected: true,
      asOf: today,
      user: { id: userId, email: user.email },
      counts: {
        accounts: Number(accountsCount?.count ?? 0),
        transactions: Number(txCount?.count ?? 0),
      },
      reconciliation: {
        totalAssets,
        totalLiabilities,
        netWorth,
        accounts: accountReconciliation,
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}
