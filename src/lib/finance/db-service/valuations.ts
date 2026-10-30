import { and, asc, eq, gte, inArray, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finValuations } from '@src/lib/db';
import { NotFoundError } from '@src/app/api/utils';
import {
  calculateFDAccruedValue,
  calculateRDAccruedValue,
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
    const startDate = (meta.startDate as string) || account.createdAt.toISOString().slice(0, 10);
    const tenureMonths = Number(meta.tenureMonths || meta.tenure || 12);
    const interestRate = Number(meta.interestRate || meta.annualInterestRate || meta.rate || 0.07);

    // Fetch existing manual valuations to avoid overwriting them
    const existingValuations = await db
      .select()
      .from(finValuations)
      .where(eq(finValuations.accountId, account.id));

    const manualValuationDates = new Set(
      existingValuations
        .filter((v) => v.note !== 'computed')
        .map((v) => v.date)
    );

    const valuationPoints: Array<{ date: string; value: number }> = [];

    if (account.kind === 'fixed_deposit') {
      const principal = Number(meta.principal || meta.depositAmount || 0);
      if (principal <= 0) continue;

      const compoundingFrequency = (meta.compoundingFrequency as CompoundingFrequency) || 'quarterly';

      // Always write value for today
      const todayValue = calculateFDAccruedValue({
        principal,
        annualInterestRate: interestRate,
        compoundingFrequency,
        startDate,
        tenureMonths,
        asOfDate: today,
      });

      valuationPoints.push({ date: today, value: todayValue });
    } else if (account.kind === 'recurring_deposit') {
      const monthlyInstallment = Number(meta.monthlyInstallment || meta.installmentAmount || 0);
      if (monthlyInstallment <= 0) continue;

      const todayValue = calculateRDAccruedValue({
        monthlyInstallment,
        annualInterestRate: interestRate,
        startDate,
        tenureMonths,
        asOfDate: today,
      });

      valuationPoints.push({ date: today, value: todayValue });
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
