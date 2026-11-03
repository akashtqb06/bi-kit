import 'server-only';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { jsonNoStore } from '../../utils';
import { and, desc, eq, inArray, isNull, lte, sql } from 'drizzle-orm';
import { db, finAccounts, finPfEntries, finTransactions, finValuations } from '@src/lib/db';
import { mapAccountToDTO } from '@src/lib/finance/db-service/accounts';
import type { AccountWithBalance } from '@src/components/finance/shared/fixtures';
import {
  calculateFDAccruedValue,
  calculateFDMaturity,
  addMonthsToDate,
  normalizeInterestRate,
} from '@src/lib/finance/domain/deposits';
import {
  rdValue,
  deriveMaturityDate,
  type RDConfig,
  type RDCompounding,
  type RDDayHistoryItem,
  type RDLatePaymentItem,
} from '@src/lib/finance/domain/rd';
import type { CompoundingFrequency } from '@src/lib/finance/constants';
import { calculateCardDates } from '@src/lib/finance/domain/credit-card';
import {
  calculateInvestmentHolding,
  type InvestmentTransactionRecord,
} from '@src/lib/finance/domain/investments';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';
import { catchUpRecurringRulesIfDue } from '@src/lib/finance/recurring';


export async function GET() {
  try {
    const user = await requireUserApi();
    const userId = user.id;
    await catchUpRecurringRulesIfDue(userId);
    const today = todayInTz(DEFAULT_TZ);

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

    // Provident Fund sums for EPF/VPF accounts
    const pfSums = await db
      .select({
        accountId: finPfEntries.accountId,
        pfTotal: sql<string>`COALESCE(SUM(${finPfEntries.employeeAmount} + ${finPfEntries.employerAmount}), 0)`,
        pensionTotal: sql<string>`COALESCE(SUM(${finPfEntries.pensionAmount}), 0)`,
      })
      .from(finPfEntries)
      .where(eq(finPfEntries.userId, userId))
      .groupBy(finPfEntries.accountId);

    const pfMap = new Map<string, { pfTotal: number; pensionTotal: number }>();
    for (const r of pfSums) {
      pfMap.set(r.accountId, {
        pfTotal: Number(r.pfTotal),
        pensionTotal: Number(r.pensionTotal),
      });
    }

    const accountIds = accs.map((a) => a.id);
    const valRows =
      accountIds.length > 0
        ? await db
            .select({
              accountId: finValuations.accountId,
              value: finValuations.value,
              costBasis: finValuations.costBasis,
              date: finValuations.date,
              note: finValuations.note,
              createdAt: finValuations.createdAt,
            })
            .from(finValuations)
            .where(
              and(
                inArray(finValuations.accountId, accountIds),
                lte(finValuations.date, today)
              )
            )
            .orderBy(finValuations.accountId, desc(finValuations.date), desc(finValuations.createdAt))
        : [];

    // Build maps
    const sourceMap = new Map<string, number>();
    for (const r of sourceSums) sourceMap.set(r.accountId, Number(r.total));
    const targetMap = new Map<string, number>();
    for (const r of targetSums) {
      if (r.accountId) targetMap.set(r.accountId, Number(r.total));
    }
    const valMap = new Map<string, { value: number; costBasis: number | null; date: string; note: string | null; createdAt: Date | string }>();
    const manualAnchorMap = new Map<string, { value: number; date: string }>();
    for (const v of valRows) {
      if (!valMap.has(v.accountId)) {
        valMap.set(v.accountId, {
          value: Number(v.value),
          costBasis: v.costBasis !== null && v.costBasis !== undefined ? Number(v.costBasis) : null,
          date: v.date,
          note: v.note,
          createdAt: v.createdAt,
        });
      }
      if (!manualAnchorMap.has(v.accountId) && v.note !== 'computed') {
        manualAnchorMap.set(v.accountId, {
          value: Number(v.value),
          date: v.date,
        });
      }
    }

    // Query transfers for recurring deposits and investments
    const hasRD = accs.some((a) => a.kind === 'recurring_deposit');
    const hasInvestment = accs.some(
      (a) =>
        a.kind === 'mutual_fund' ||
        a.kind === 'stocks' ||
        a.kind === 'other_asset' ||
        a.kind === 'nps'
    );
    const rdTransfersByAccount = new Map<string, Array<{ date: string; amount: number }>>();
    const investmentTransfersByAccount = new Map<string, InvestmentTransactionRecord[]>();

    if (hasRD || hasInvestment) {
      const transferRows = await db
        .select({
          accountId: finTransactions.accountId,
          toAccountId: finTransactions.toAccountId,
          date: finTransactions.date,
          amount: finTransactions.amount,
          type: finTransactions.type,
          deletedAt: finTransactions.deletedAt,
          createdAt: finTransactions.createdAt,
          isRecurring: finTransactions.isRecurring,
        })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, userId),
            eq(finTransactions.type, 'transfer'),
            isNull(finTransactions.deletedAt)
          )
        );

      for (const t of transferRows) {
        const amt = Number(t.amount);
        if (t.toAccountId) {
          if (hasRD) {
            const list = rdTransfersByAccount.get(t.toAccountId) ?? [];
            list.push({ date: t.date, amount: amt });
            rdTransfersByAccount.set(t.toAccountId, list);
          }
          if (hasInvestment) {
            const list = investmentTransfersByAccount.get(t.toAccountId) ?? [];
            list.push({
              accountId: t.accountId,
              toAccountId: t.toAccountId,
              type: 'transfer',
              amount: amt,
              date: t.date,
              createdAt: t.createdAt,
              isRecurring: t.isRecurring,
            });
            investmentTransfersByAccount.set(t.toAccountId, list);
          }
        }
        if (t.accountId && hasInvestment) {
          const list = investmentTransfersByAccount.get(t.accountId) ?? [];
          list.push({
            accountId: t.accountId,
            toAccountId: t.toAccountId,
            type: 'transfer',
            amount: amt,
            date: t.date,
            createdAt: t.createdAt,
            isRecurring: t.isRecurring,
          });
          investmentTransfersByAccount.set(t.accountId, list);
        }
      }
    }

    const result: AccountWithBalance[] = accs.map((acc) => {
      const dto = mapAccountToDTO(acc);
      const isPf = dto.kind === 'epf' || dto.kind === 'vpf';
      const pfData = pfMap.get(acc.id);

      let balance = (sourceMap.get(acc.id) ?? 0) + (targetMap.get(acc.id) ?? 0);
      let pensionMemo: number | undefined;

      if (isPf) {
        balance = pfData?.pfTotal ?? 0;
        pensionMemo = pfData?.pensionTotal ?? 0;
      }

      const isLiability = dto.class === 'liability';
      const outstanding = isLiability ? Math.max(0, -balance) : 0;
      const creditLimit = dto.creditLimit ?? 0;
      const utilization = creditLimit > 0 ? Math.min(1, outstanding / creditLimit) : 0;
      const valuation = valMap.get(acc.id);
      let costBasis = valuation?.costBasis ?? undefined;
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
        const rawRate = Number(meta.interestRate ?? meta.rate ?? 6.8);
        interestRate = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));
        const startDate =
          (meta.startDate as string) ||
          (acc.createdAt instanceof Date ? acc.createdAt.toISOString().slice(0, 10) : String(acc.createdAt).slice(0, 10));
        const tenureMonths = Number(meta.tenureMonths || 12);
        totalInstallments = tenureMonths;
        const installmentDay =
          meta.installmentDay !== undefined
            ? (meta.installmentDay as number | 'last')
            : parseInt(startDate.slice(8, 10), 10);
        const firstInstallmentOn =
          (meta.firstInstallmentOn as 'start_date' | 'first_installment_day') || 'start_date';
        const compounding = (meta.compoundingFrequency ??
          meta.compounding ??
          'quarterly') as RDCompounding;
        const installmentsMode =
          (meta.installmentsMode as 'schedule' | 'recorded') ||
          (meta.installmentMode === 'recorded_transfers' ? 'recorded' : 'schedule');
        const startMonth = startDate.slice(0, 7);
        const installmentDayHistory =
          (meta.installmentDayHistory as RDDayHistoryItem[]) &&
          (meta.installmentDayHistory as RDDayHistoryItem[]).length > 0
            ? (meta.installmentDayHistory as RDDayHistoryItem[])
            : [{ effectiveFrom: startMonth, day: installmentDay }];
        const skippedInstallments = (meta.skippedInstallments as string[]) || [];
        const paidLateInstallments = (meta.paidLateInstallments as RDLatePaymentItem[]) || [];
        maturityDate = (meta.maturityDate as string) || deriveMaturityDate(startDate, tenureMonths);

        const rdConfig: RDConfig = {
          monthlyInstallment,
          startDate,
          installmentDay,
          firstInstallmentOn,
          tenureMonths,
          maturityDate,
          interestRate,
          compounding,
          installmentsMode,
          installmentDayHistory,
          skippedInstallments,
          paidLateInstallments,
          recordedTransfers: rdTransfersByAccount.get(acc.id) || [],
        };

        const manualAnchor = manualAnchorMap.get(acc.id);
        const rdRes = rdValue(rdConfig, today, manualAnchor);

        installmentsPaid = rdRes.installmentsPaid;
        totalDeposited = rdRes.totalDeposited;
        projectedMaturityAmount = rdRes.projectedMaturityValue;
        accruedValue = rdRes.currentValue;
        interestEarned = Math.max(0, accruedValue - totalDeposited);
        daysToMaturity = rdRes.daysToMaturity;
        nextInstallmentDate = rdRes.nextInstallmentDate || undefined;
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

      let currentValue =
        accruedValue !== undefined ? accruedValue : valuation ? valuation.value : balance;
      let gain = costBasis !== undefined ? currentValue - costBasis : undefined;
      let gainPct =
        costBasis && costBasis > 0 ? Math.round((gain! / costBasis) * 1000) / 10 : undefined;

      const isInvestment =
        dto.kind === 'mutual_fund' ||
        dto.kind === 'stocks' ||
        dto.kind === 'other_asset' ||
        dto.kind === 'nps';

      if (isInvestment) {
        const openingContribution = Number(
          meta.openingContributionPaise ??
            meta.costBasis ??
            meta.openingBalancePaise ??
            (valuation?.note === 'Opening valuation recorded during setup' ? valuation?.costBasis : undefined) ??
            0
        );
        const invTxs = investmentTransfersByAccount.get(acc.id) ?? [];
        const holding = calculateInvestmentHolding({
          openingContribution,
          transactions: invTxs,
          accountId: acc.id,
          latestValuation: valuation,
          asOfDate: today,
        });

        costBasis = holding.costBasis;
        currentValue = holding.currentValue;
        gain = holding.gain;
        gainPct = holding.gainPct;
      }

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
        pensionMemo,
      };
    });

    return jsonNoStore({ accounts: result });
  } catch (err) {
    return handleApiError(err);
  }
}
