import 'server-only';
import { NextRequest } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, NotFoundError, BadRequestError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../utils';
import { and, desc, eq, lte } from 'drizzle-orm';
import { db, finAccounts, finTransactions, finValuations } from '@src/lib/db';
import {
  rdValue,
  deriveMaturityDate,
  type RDConfig,
  type RDCompounding,
  type RDDayHistoryItem,
  type RDLatePaymentItem,
} from '@src/lib/finance/domain/rd';
import { todayInTz, DEFAULT_TZ } from '@src/lib/finance/timezone';

export async function GET(
  _req: NextRequest,
  props: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUserApi();
    const { id: accountId } = await props.params;

    const [account] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, user.id)))
      .limit(1);

    if (!account) {
      throw new NotFoundError(`Account not found: ${accountId}`);
    }

    if (account.kind !== 'recurring_deposit') {
      throw new BadRequestError(`Account ${accountId} is not a recurring deposit.`);
    }

    const today = todayInTz(DEFAULT_TZ);
    const meta = (account.metadata || {}) as Record<string, unknown>;

    const startDate =
      (meta.startDate as string) ||
      (account.createdAt instanceof Date
        ? account.createdAt.toISOString().slice(0, 10)
        : String(account.createdAt).slice(0, 10));

    const monthlyInstallment = Number(
      meta.monthlyInstallmentPaise ??
        meta.monthlyInstallment ??
        meta.installment ??
        meta.installmentAmount ??
        meta.openingBalancePaise ??
        0
    );

    const tenureMonths = Number(meta.tenureMonths || meta.tenure || 12);
    const rawRate = Number(meta.interestRate ?? meta.annualInterestRate ?? meta.rate ?? 6.8);
    const normRate = rawRate > 1 ? rawRate : Number((rawRate * 100).toFixed(2));
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
    const payFromAccountId = (meta.payFromAccountId as string | null) || null;
    const autoDebit =
      meta.autoDebit !== undefined ? Boolean(meta.autoDebit) : Boolean(payFromAccountId);
    const maturityDate =
      (meta.maturityDate as string) || deriveMaturityDate(startDate, tenureMonths);

    // Latest manual valuation anchor
    const [latestManual] = await db
      .select()
      .from(finValuations)
      .where(
        and(
          eq(finValuations.accountId, account.id),
          lte(finValuations.date, today)
        )
      )
      .orderBy(desc(finValuations.date));

    const manualAnchor =
      latestManual && latestManual.note !== 'computed'
        ? { date: latestManual.date, value: Number(latestManual.value) }
        : undefined;

    let recordedTransfers: Array<{ date: string; amount: number }> | undefined;
    if (installmentsMode === 'recorded') {
      const transferRows = await db
        .select({ date: finTransactions.date, amount: finTransactions.amount })
        .from(finTransactions)
        .where(
          and(
            eq(finTransactions.userId, user.id),
            eq(finTransactions.toAccountId, account.id),
            eq(finTransactions.type, 'transfer')
          )
        );
      recordedTransfers = transferRows.map((r) => ({
        date: r.date,
        amount: Number(r.amount),
      }));
    }

    const rdConfig: RDConfig = {
      monthlyInstallment,
      startDate,
      installmentDay,
      firstInstallmentOn,
      tenureMonths,
      maturityDate,
      interestRate: normRate,
      compounding,
      payFromAccountId,
      autoDebit,
      installmentsMode,
      installmentDayHistory,
      skippedInstallments,
      paidLateInstallments,
      recordedTransfers,
    };

    const valuationResult = rdValue(rdConfig, today, manualAnchor);

    return jsonNoStore({
      accountId: account.id,
      accountName: account.name,
      config: rdConfig,
      valuation: valuationResult,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
