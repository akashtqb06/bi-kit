import { and, asc, eq, gte, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finTransactions, finValuations } from '@src/lib/db';
import { NotFoundError } from '@src/app/api/utils';
import {
  calculateFDAccruedValue,
  calculateRDAccruedValue,
  normalizeInterestRate,
} from '../domain/deposits';
import type { CompoundingFrequency } from '../constants';
import {
  type CreateValuationDTO,
  type ValuationDTO,
  type ValuationFilters,
  createValuationSchema,
  valuationFiltersSchema,
} from '../contract';
import { todayInTz, DEFAULT_TZ } from '../timezone';

export function mapValuationToDTO(row: typeof finValuations.$inferSelect): ValuationDTO {
  return {
    id: row.id,
    accountId: row.accountId,
    date: row.date,
    value: Number(row.value),
    costBasis: row.costBasis !== null ? Number(row.costBasis) : null,
    note: row.note,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

export async function listValuations(
  userId: string,
  filters: ValuationFilters
): Promise<ValuationDTO[]> {
  const validated = valuationFiltersSchema.parse(filters);

  // Verify account belongs to user
  const [account] = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(and(eq(finAccounts.id, validated.accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${validated.accountId}`);
  }

  const conditions = [eq(finValuations.accountId, validated.accountId)];

  if (validated.startDate) {
    conditions.push(gte(finValuations.date, validated.startDate));
  }
  if (validated.endDate) {
    conditions.push(lte(finValuations.date, validated.endDate));
  }

  const rows = await db
    .select()
    .from(finValuations)
    .where(and(...conditions))
    .orderBy(asc(finValuations.date));

  return rows.map(mapValuationToDTO);
}

export async function createValuation(
  userId: string,
  data: CreateValuationDTO
): Promise<ValuationDTO> {
  const validated = createValuationSchema.parse(data);

  // Verify account belongs to user
  const [account] = await db
    .select({ id: finAccounts.id })
    .from(finAccounts)
    .where(and(eq(finAccounts.id, validated.accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${validated.accountId}`);
  }

  // Upsert manual valuation per account and date
  const [row] = await db
    .insert(finValuations)
    .values({
      accountId: validated.accountId,
      date: validated.date,
      value: validated.value,
      costBasis: validated.costBasis ?? null,
      note: validated.note ?? null,
    })
    .onConflictDoUpdate({
      target: [finValuations.accountId, finValuations.date],
      set: {
        value: validated.value,
        costBasis: validated.costBasis ?? null,
        note: validated.note ?? null,
        updatedAt: new Date(),
      },
    })
    .returning();

  return mapValuationToDTO(row);
}

/**
 * Recomputes deposit valuations for FD and RD accounts of a user.
 * Writes computed valuations (note: 'computed') without overwriting manual ones.
 * Also performs an idempotent metadata normalization for existing deposit accounts.
 */
export async function recomputeDepositValuations(
  userId: string,
  targetAccountId?: string
): Promise<{ processedAccounts: number; valuationsWritten: number }> {
  const accountConditions = [
    eq(finAccounts.userId, userId),
    eq(finAccounts.isActive, true),
    inArray(finAccounts.kind, ['fixed_deposit', 'recurring_deposit']),
  ];

  if (targetAccountId) {
    accountConditions.push(eq(finAccounts.id, targetAccountId));
  }

  const accounts = await db
    .select()
    .from(finAccounts)
    .where(and(...accountConditions));

  let valuationsWritten = 0;
  const today = todayInTz(DEFAULT_TZ);

  for (const account of accounts) {
    const meta = (account.metadata || {}) as Record<string, unknown>;
    const startDate =
      (meta.startDate as string) ||
      (account.createdAt instanceof Date
        ? account.createdAt.toISOString().slice(0, 10)
        : String(account.createdAt).slice(0, 10));
    const tenureMonths = Number(meta.tenureMonths || meta.tenure || 12);
    const rawRate = Number(meta.interestRate ?? meta.annualInterestRate ?? meta.rate ?? 0.07);
    const interestRate = normalizeInterestRate(rawRate);
    const installmentMode =
      (meta.installmentMode as 'assume_schedule' | 'recorded_transfers') || 'assume_schedule';

    // Fetch existing manual valuations to avoid overwriting them
    const existingValuations = await db
      .select()
      .from(finValuations)
      .where(eq(finValuations.accountId, account.id))
      .orderBy(asc(finValuations.date));

    const manualValuations = existingValuations.filter((v) => v.note !== 'computed');
    const manualValuationDates = new Set(manualValuations.map((v) => v.date));
    const latestManual = manualValuations.filter((v) => v.date <= today).pop();
    const manualAnchor = latestManual
      ? { date: latestManual.date, value: Number(latestManual.value) }
      : undefined;

    const valuationPoints: Array<{ date: string; value: number }> = [];

    if (account.kind === 'fixed_deposit') {
      const principal = Number(
        meta.principalPaise ??
          meta.principal ??
          meta.depositAmount ??
          meta.openingBalancePaise ??
          0
      );
      if (principal <= 0) continue;

      const compoundingFrequency = (meta.compoundingFrequency ??
        meta.compounding ??
        'quarterly') as CompoundingFrequency;

      const todayValue = calculateFDAccruedValue({
        principal,
        annualInterestRate: interestRate,
        compoundingFrequency,
        startDate,
        tenureMonths,
        asOfDate: today,
        manualAnchor,
      });

      valuationPoints.push({ date: today, value: todayValue });

      // Idempotently normalize metadata
      const updatedMeta = {
        ...meta,
        principalPaise: principal,
        interestRate: rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2)),
        compoundingFrequency,
        startDate,
        tenureMonths,
      };
      await db
        .update(finAccounts)
        .set({ metadata: updatedMeta, updatedAt: new Date() })
        .where(eq(finAccounts.id, account.id));
    } else if (account.kind === 'recurring_deposit') {
      const monthlyInstallment = Number(
        meta.monthlyInstallmentPaise ??
          meta.monthlyInstallment ??
          meta.installment ??
          meta.installmentAmount ??
          meta.openingBalancePaise ??
          0
      );
      if (monthlyInstallment <= 0) continue;

      let recordedTransfers: Array<{ date: string; amount: number }> | undefined;
      if (installmentMode === 'recorded_transfers') {
        const transferRows = await db
          .select({ date: finTransactions.date, amount: finTransactions.amount })
          .from(finTransactions)
          .where(
            and(
              eq(finTransactions.userId, userId),
              eq(finTransactions.toAccountId, account.id),
              eq(finTransactions.type, 'transfer'),
              isNull(finTransactions.deletedAt)
            )
          );
        recordedTransfers = transferRows.map((r) => ({
          date: r.date,
          amount: Number(r.amount),
        }));
      }

      const todayValue = calculateRDAccruedValue({
        monthlyInstallment,
        annualInterestRate: interestRate,
        startDate,
        tenureMonths,
        asOfDate: today,
        manualAnchor,
        installmentMode,
        recordedTransfers,
      });

      valuationPoints.push({ date: today, value: todayValue });

      // Idempotently normalize metadata
      const updatedMeta = {
        ...meta,
        monthlyInstallmentPaise: monthlyInstallment,
        interestRate: rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2)),
        installmentMode,
        startDate,
        tenureMonths,
      };
      await db
        .update(finAccounts)
        .set({ metadata: updatedMeta, updatedAt: new Date() })
        .where(eq(finAccounts.id, account.id));
    }

    // Upsert computed valuation points where no manual valuation exists
    for (const point of valuationPoints) {
      if (manualValuationDates.has(point.date)) {
        // Do not overwrite manual valuation
        continue;
      }

      await db
        .insert(finValuations)
        .values({
          accountId: account.id,
          date: point.date,
          value: point.value,
          costBasis: null,
          note: 'computed',
        })
        .onConflictDoUpdate({
          target: [finValuations.accountId, finValuations.date],
          set: {
            value: point.value,
            updatedAt: new Date(),
          },
          where: sql`${finValuations.note} = 'computed' OR ${finValuations.note} IS NULL`,
        });

      valuationsWritten += 1;
    }
  }

  return { processedAccounts: accounts.length, valuationsWritten };
}

/**
 * Snapshot/refresh valuations for all users in batches (called by cron).
 */
export async function snapshotValuations(): Promise<{ snapshots: number }> {
  // Find distinct users having active FD or RD accounts
  const usersWithDeposits = await db
    .selectDistinct({ userId: finAccounts.userId })
    .from(finAccounts)
    .where(
      and(
        eq(finAccounts.isActive, true),
        inArray(finAccounts.kind, ['fixed_deposit', 'recurring_deposit'])
      )
    );

  let totalSnapshots = 0;
  for (const u of usersWithDeposits) {
    const res = await recomputeDepositValuations(u.userId);
    totalSnapshots += res.valuationsWritten;
  }

  return { snapshots: totalSnapshots };
}
