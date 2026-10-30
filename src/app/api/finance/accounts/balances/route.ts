import 'server-only';
import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finTransactions, finValuations } from '@src/lib/db';
import { mapAccountToDTO } from '@src/lib/finance/db-service/accounts';
import type { AccountWithBalance } from '@src/components/finance/shared/fixtures';

export async function GET() {
  try {
    const user = await requireUserApi();
    const userId = user.id;
    const today = new Date().toISOString().slice(0, 10);

    // Fetch all active accounts
    const accs = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.userId, userId), eq(finAccounts.isActive, true)))
      .orderBy(finAccounts.name);

    // Source sums (signed_amount per account)
    const sourceSums = await db
      .select({
        accountId: finTransactions.accountId,
        total: sql<string>`COALESCE(SUM(${finTransactions.signedAmount}), 0)`,
      })
      .from(finTransactions)
      .where(and(eq(finTransactions.userId, userId), isNull(finTransactions.deletedAt)))
      .groupBy(finTransactions.accountId);

    // Target sums (incoming transfers)
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

    const accountIds = accs.map((a) => a.id);
    const valRows =
      accountIds.length > 0
        ? await db
            .select({
              accountId: finValuations.accountId,
              value: finValuations.value,
              costBasis: finValuations.costBasis,
              date: finValuations.date,
            })
            .from(finValuations)
            .where(
              and(
                inArray(finValuations.accountId, accountIds),
                lte(finValuations.date, today)
              )
            )
            .orderBy(finValuations.accountId, desc(finValuations.date))
        : [];

    // Build maps
    const sourceMap = new Map<string, number>();
    for (const r of sourceSums) sourceMap.set(r.accountId, Number(r.total));
    const targetMap = new Map<string, number>();
    for (const r of targetSums) {
      if (r.accountId) targetMap.set(r.accountId, Number(r.total));
    }
    const valMap = new Map<string, { value: number; costBasis: number | null }>();
    for (const v of valRows) {
      if (!valMap.has(v.accountId)) {
        valMap.set(v.accountId, {
          value: Number(v.value),
          costBasis: v.costBasis !== null && v.costBasis !== undefined ? Number(v.costBasis) : null,
        });
      }
    }

    const result: AccountWithBalance[] = accs.map((acc) => {
      const dto = mapAccountToDTO(acc);
      const balance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
      const isLiability = dto.class === 'liability';
      const outstanding = isLiability ? Math.max(0, -balance) : 0;
      const creditLimit = dto.creditLimit ?? 0;
      const utilization = creditLimit > 0 ? Math.min(1, outstanding / creditLimit) : 0;
      const valuation = valMap.get(acc.id);
      const currentValue = valuation ? valuation.value : balance;
      const costBasis = valuation?.costBasis ?? undefined;
      const gain = costBasis !== undefined ? currentValue - costBasis : undefined;
      const gainPct =
        costBasis && costBasis > 0 ? Math.round((gain! / costBasis) * 1000) / 10 : undefined;
      const meta = (acc.metadata ?? {}) as Record<string, unknown>;
      return {
        ...dto,
        balance,
        outstanding,
        utilization,
        currentValue,
        costBasis,
        gain,
        gainPct,
        statementDay: meta.statementDay !== undefined ? Number(meta.statementDay) : undefined,
        dueDay: meta.dueDay !== undefined ? Number(meta.dueDay) : undefined,
      };
    });

    const response = NextResponse.json({ accounts: result });
    response.headers.set('Cache-Control', 'no-store');
    return response;
  } catch (err) {
    return handleApiError(err);
  }
}
