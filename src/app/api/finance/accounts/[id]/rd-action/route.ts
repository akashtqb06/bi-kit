import 'server-only';
import { NextRequest } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError, NotFoundError, BadRequestError } from '@src/app/api/utils';
import { jsonNoStore } from '../../../utils';
import { and, eq } from 'drizzle-orm';
import { db, finAccounts } from '@src/lib/db';
import {
  changeInstallmentDay,
  type RDConfig,
  type RDDayHistoryItem,
  type RDLatePaymentItem,
} from '@src/lib/finance/domain/rd';
import {
  changeInstallmentDaySchema,
  markInstallmentSkippedSchema,
  markInstallmentLateSchema,
} from '@src/lib/finance/contract';
import { recomputeDepositValuations } from '@src/lib/finance/db-service/valuations';
import { syncRDAutoDebitRule } from '@src/lib/finance/db-service/accounts';

const rdActionSchema = z.discriminatedUnion('action', [
  z.object({
    action: z.literal('change_installment_day'),
    data: changeInstallmentDaySchema,
  }),
  z.object({
    action: z.literal('mark_skipped'),
    data: markInstallmentSkippedSchema,
  }),
  z.object({
    action: z.literal('mark_paid_late'),
    data: markInstallmentLateSchema,
  }),
  z.object({
    action: z.literal('recalculate'),
  }),
]);

export async function POST(
  req: NextRequest,
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

    const body = await req.json();
    const parsed = rdActionSchema.parse(body);

    const meta = (account.metadata || {}) as Record<string, unknown>;
    let updatedMeta = { ...meta };

    if (parsed.action === 'change_installment_day') {
      const { newDay, effectiveFrom } = parsed.data;
      const startDate =
        (meta.startDate as string) ||
        (account.createdAt instanceof Date
          ? account.createdAt.toISOString().slice(0, 10)
          : String(account.createdAt).slice(0, 10));

      const currentConfig: RDConfig = {
        monthlyInstallment: Number(meta.monthlyInstallmentPaise || 0),
        startDate,
        installmentDay:
          meta.installmentDay !== undefined
            ? (meta.installmentDay as number | 'last')
            : parseInt(startDate.slice(8, 10), 10),
        tenureMonths: Number(meta.tenureMonths || 12),
        interestRate: Number(meta.interestRate || 6.8),
        installmentDayHistory: (meta.installmentDayHistory as RDDayHistoryItem[]) || [],
      };

      const changed = changeInstallmentDay(currentConfig, newDay, effectiveFrom);
      updatedMeta = {
        ...updatedMeta,
        installmentDay: changed.installmentDay,
        installmentDayHistory: changed.installmentDayHistory,
      };

      await db
        .update(finAccounts)
        .set({ metadata: updatedMeta, updatedAt: new Date() })
        .where(eq(finAccounts.id, account.id));

      await syncRDAutoDebitRule(user.id, account.id, updatedMeta, account.name, account.isActive);
    } else if (parsed.action === 'mark_skipped') {
      const { dueDate, skipped } = parsed.data;
      const currentSkipped = new Set<string>((meta.skippedInstallments as string[]) || []);
      if (skipped) {
        currentSkipped.add(dueDate);
      } else {
        currentSkipped.delete(dueDate);
      }

      updatedMeta = {
        ...updatedMeta,
        skippedInstallments: Array.from(currentSkipped).sort(),
      };

      await db
        .update(finAccounts)
        .set({ metadata: updatedMeta, updatedAt: new Date() })
        .where(eq(finAccounts.id, account.id));

      await syncRDAutoDebitRule(user.id, account.id, updatedMeta, account.name, account.isActive);
    } else if (parsed.action === 'mark_paid_late') {
      const { dueDate, paidDate } = parsed.data;
      const currentLate = ((meta.paidLateInstallments as RDLatePaymentItem[]) || []).filter(
        (item) => item.dueDate !== dueDate
      );
      currentLate.push({ dueDate, paidDate });

      updatedMeta = {
        ...updatedMeta,
        paidLateInstallments: currentLate,
      };

      await db
        .update(finAccounts)
        .set({ metadata: updatedMeta, updatedAt: new Date() })
        .where(eq(finAccounts.id, account.id));
    }

    // Recompute valuations immediately
    await recomputeDepositValuations(user.id, account.id);

    return jsonNoStore({
      success: true,
      action: parsed.action,
      accountId: account.id,
      metadata: updatedMeta,
    });
  } catch (err) {
    return handleApiError(err);
  }
}
