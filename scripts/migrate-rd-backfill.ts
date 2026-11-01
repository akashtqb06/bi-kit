import { db, finAccounts } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import { recomputeDepositValuations } from '@src/lib/finance/db-service/valuations';
import { syncRDAutoDebitRule } from '@src/lib/finance/db-service/accounts';

export async function backfillRDAccounts() {
  console.log('🔄 Starting idempotent RD accounts backfill migration...');
  const rds = await db
    .select()
    .from(finAccounts)
    .where(eq(finAccounts.kind, 'recurring_deposit'));

  console.log(`Found ${rds.length} recurring_deposit account(s) to inspect.`);

  let updatedCount = 0;
  const userIds = new Set<string>();

  for (const rd of rds) {
    const meta = (rd.metadata || {}) as Record<string, unknown>;
    const startDate =
      (meta.startDate as string) ||
      (rd.createdAt instanceof Date
        ? rd.createdAt.toISOString().slice(0, 10)
        : String(rd.createdAt).slice(0, 10));
    const startDay = parseInt(startDate.slice(8, 10), 10) || 2;
    const startMonth = startDate.slice(0, 7);

    const installmentDay = meta.installmentDay !== undefined ? meta.installmentDay : startDay;
    const firstInstallmentOn = meta.firstInstallmentOn || 'start_date';
    const installmentDayHistory =
      Array.isArray(meta.installmentDayHistory) && meta.installmentDayHistory.length > 0
        ? meta.installmentDayHistory
        : [{ effectiveFrom: startMonth, day: installmentDay }];

    const skippedInstallments = Array.isArray(meta.skippedInstallments)
      ? meta.skippedInstallments
      : [];
    const paidLateInstallments = Array.isArray(meta.paidLateInstallments)
      ? meta.paidLateInstallments
      : [];

    const updatedMeta = {
      ...meta,
      startDate,
      installmentDay,
      firstInstallmentOn,
      installmentDayHistory,
      skippedInstallments,
      paidLateInstallments,
      installmentsMode:
        meta.installmentsMode ||
        (meta.installmentMode === 'recorded_transfers' ? 'recorded' : 'schedule'),
      compounding: meta.compounding || meta.compoundingFrequency || 'quarterly',
      compoundingFrequency: meta.compounding || meta.compoundingFrequency || 'quarterly',
    };

    await db
      .update(finAccounts)
      .set({ metadata: updatedMeta, updatedAt: new Date() })
      .where(eq(finAccounts.id, rd.id));

    userIds.add(rd.userId);
    updatedCount++;

    // Sync auto-debit rule if configured
    try {
      await syncRDAutoDebitRule(rd.userId, rd.id, updatedMeta, rd.name, rd.isActive);
    } catch (err) {
      console.warn(`[backfill] syncRDAutoDebitRule failed for ${rd.id}:`, err);
    }
  }

  console.log(`Updated metadata for ${updatedCount} RD accounts.`);

  // Recompute deposit valuations for all affected users
  for (const uid of userIds) {
    console.log(`Recomputing valuations for user: ${uid}`);
    const res = await recomputeDepositValuations(uid);
    console.log(
      `User ${uid}: wrote ${res.valuationsWritten} valuations across ${res.processedAccounts} deposit accounts.`
    );
  }

  console.log('✅ RD backfill migration completed successfully.');
}

if (process.argv[1]?.endsWith('migrate-rd-backfill.ts')) {
  backfillRDAccounts()
    .then(() => process.exit(0))
    .catch((err) => {
      console.error('Fatal backfill error:', err);
      process.exit(1);
    });
}
