import 'server-only';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finTransactions, finValuations } from '@src/lib/db';
import { mapAccountToDTO } from '@src/lib/finance/db-service/accounts';
import type { AccountWithBalance } from '@src/components/finance/shared/fixtures';
import {
  calculateFDAccruedValue,
  calculateFDMaturity,
  calculateRDAccruedValue,
  calculateRDMaturity,
  calculateRDTotalDeposited,
  getNextInstallmentDate,
  addMonthsToDate,
  normalizeInterestRate,
} from '@src/lib/finance/domain/deposits';
import type { CompoundingFrequency } from '@src/lib/finance/constants';
import { calculateCardDates } from '@src/lib/finance/domain/credit-card';


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
      const costBasis = valuation?.costBasis ?? undefined;
      const meta = (acc.metadata ?? {}) as Record<string, unknown>;

      let accruedValue: number | undefined;
      let interestEarned: number | undefined;
      let projectedMaturityAmount: number | undefined;
      let daysToMaturity: number | undefined;
      let maturityDate: string | undefined;
      let nextInstallmentDate: string | undefined;
      let installmentsPaid: number | undefined;
      let totalInstallments: number | undefined;
      let totalDeposited: number | undefined;
      let principal: number | undefined;
      let monthlyInstallment: number | undefined;
      let interestRate: number | undefined;
      let compoundingFrequency: string | undefined;
      let nextDueDate: string | undefined;
      let currentDueDate: string | undefined;
      let nextStatementDate: string | undefined;
      let lastStatementDate: string | undefined;
      let dueDays: number | undefined;
      let isOffsetDays: boolean | undefined;

      if (dto.kind === 'fixed_deposit') {
        principal = Number(
          meta.principalPaise ?? meta.principal ?? meta.depositAmount ?? meta.openingBalancePaise ?? balance
        );
        const rawRate = Number(meta.interestRate ?? meta.rate ?? 0.07);
        interestRate = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));
        const normRate = normalizeInterestRate(rawRate);
        compoundingFrequency = (meta.compoundingFrequency ?? meta.compounding ?? 'quarterly') as CompoundingFrequency;
        const startDate =
          (meta.startDate as string) ||
          (acc.createdAt instanceof Date ? acc.createdAt.toISOString().slice(0, 10) : String(acc.createdAt).slice(0, 10));
        const tenureMonths = Number(meta.tenureMonths || 12);
        maturityDate = (meta.maturityDate as string) || addMonthsToDate(startDate, tenureMonths);

        const mat = calculateFDMaturity({
          principal,
          annualInterestRate: normRate,
          compoundingFrequency: compoundingFrequency as CompoundingFrequency,
          startDate,
          tenureMonths,
        });
        projectedMaturityAmount = mat.maturityAmount;

        accruedValue = valuation
          ? valuation.value
          : calculateFDAccruedValue({
              principal,
              annualInterestRate: normRate,
              compoundingFrequency: compoundingFrequency as CompoundingFrequency,
              startDate,
              tenureMonths,
              maturityDate,
              asOfDate: today,
            });

        interestEarned = Math.max(0, accruedValue - principal);
        daysToMaturity = Math.max(
          0,
          Math.round(
            (new Date(`${maturityDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
              (86400 * 1000)
          )
        );
      } else if (dto.kind === 'recurring_deposit') {
        monthlyInstallment = Number(
          meta.monthlyInstallmentPaise ??
            meta.monthlyInstallment ??
            meta.installment ??
            meta.installmentAmount ??
            0
        );
        const rawRate = Number(meta.interestRate ?? meta.rate ?? 0.07);
        interestRate = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));
        const normRate = normalizeInterestRate(rawRate);
        const startDate =
          (meta.startDate as string) ||
          (acc.createdAt instanceof Date ? acc.createdAt.toISOString().slice(0, 10) : String(acc.createdAt).slice(0, 10));
        const tenureMonths = Number(meta.tenureMonths || 12);
        totalInstallments = tenureMonths;
        maturityDate = (meta.maturityDate as string) || addMonthsToDate(startDate, tenureMonths);

        const depInfo = calculateRDTotalDeposited({
          monthlyInstallment,
          startDate,
          tenureMonths,
          asOfDate: today,
        });
        installmentsPaid = depInfo.installmentsPaid;
        totalDeposited = depInfo.totalDeposited;

        const mat = calculateRDMaturity({
          monthlyInstallment,
          annualInterestRate: normRate,
          startDate,
          tenureMonths,
        });
        projectedMaturityAmount = mat.maturityAmount;

        accruedValue = valuation
          ? valuation.value
          : calculateRDAccruedValue({
              monthlyInstallment,
              annualInterestRate: normRate,
              startDate,
              tenureMonths,
              asOfDate: today,
            });

        interestEarned = Math.max(0, accruedValue - totalDeposited);
        daysToMaturity = Math.max(
          0,
          Math.round(
            (new Date(`${maturityDate}T00:00:00Z`).getTime() - new Date(`${today}T00:00:00Z`).getTime()) /
              (86400 * 1000)
          )
        );
        nextInstallmentDate = getNextInstallmentDate(startDate, tenureMonths, today) || undefined;
      } else if (dto.kind === 'credit_card') {
        const stmtDay = meta.statementDay !== undefined ? Number(meta.statementDay) : 21;
        const dDay =
          meta.dueDays !== undefined
            ? Number(meta.dueDays)
            : meta.dueDay !== undefined
            ? Number(meta.dueDay)
            : 20;
        const isOffset =
          meta.isOffsetDays !== undefined
            ? Boolean(meta.isOffsetDays)
            : (meta.dueDays !== undefined || (meta.dueDay !== undefined && Number(meta.dueDay) > 0));
        const cardDates = calculateCardDates(stmtDay, dDay, today, { isOffsetDays: isOffset });
        lastStatementDate = cardDates.lastStatementDate;
        nextStatementDate = cardDates.nextStatementDate;
        currentDueDate = cardDates.currentDueDate;
        nextDueDate = cardDates.nextDueDate;
        dueDays = isOffset ? dDay : undefined;
        isOffsetDays = isOffset;
      }

      const currentValue =
        accruedValue !== undefined ? accruedValue : valuation ? valuation.value : balance;
      const gain = costBasis !== undefined ? currentValue - costBasis : undefined;
      const gainPct =
        costBasis && costBasis > 0 ? Math.round((gain! / costBasis) * 1000) / 10 : undefined;

      return {
        ...dto,
        balance,
        outstanding,
        utilization,
        currentValue,
        costBasis,
        gain,
        gainPct,
        accruedValue,
        interestEarned,
        projectedMaturityAmount,
        daysToMaturity,
        maturityDate,
        nextInstallmentDate,
        installmentsPaid,
        totalInstallments,
        totalDeposited,
        principal,
        monthlyInstallment,
        interestRate,
        compoundingFrequency,
        statementDay: meta.statementDay !== undefined ? Number(meta.statementDay) : undefined,
        dueDay: meta.dueDay !== undefined ? Number(meta.dueDay) : undefined,
        dueDays,
        isOffsetDays,
        lastStatementDate,
        nextStatementDate,
        currentDueDate,
        nextDueDate,
      };
    });

    return jsonNoStore({ accounts: result });
  } catch (err) {
    return handleApiError(err);
  }
}
