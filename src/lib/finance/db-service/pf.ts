import { and, asc, eq } from 'drizzle-orm';
import { db, finAccounts, finPfEntries, finUserSettings, finValuations } from '@src/lib/db';
import { NotFoundError, BadRequestError } from '@src/app/api/utils';
import {
  type PfEntryDTO,
  type CommitPfPassbookResultDTO,
  type PfAccountSummaryDTO,
  commitPfPassbookInputSchema,
} from '../contract';
import {
  calculateFyInterestEstimate,
  checkPassbookStaleness,
  computeVirtualNextContribution,
  getFyFromDate,
} from '../domain/pf/interest';
import { computeReconciliation } from '../domain/pf/parser';
import { generatePassbookKey } from '../domain/pf/hash';
import { todayInTz, DEFAULT_TZ } from '../timezone';

export function mapPfEntryToDTO(row: typeof finPfEntries.$inferSelect): PfEntryDTO {
  return {
    id: row.id,
    userId: row.userId,
    accountId: row.accountId,
    entryKind: row.entryKind as PfEntryDTO['entryKind'],
    periodMonth: row.periodMonth,
    postedDate: row.postedDate,
    dateApprox: row.dateApprox,
    epfWages: Number(row.epfWages),
    epsWages: Number(row.epsWages),
    employeeAmount: Number(row.employeeAmount),
    employerAmount: Number(row.employerAmount),
    pensionAmount: Number(row.pensionAmount),
    sourceLabel: row.sourceLabel,
    passbookKey: row.passbookKey,
    note: row.note,
    createdAt: row.createdAt instanceof Date ? row.createdAt.toISOString() : String(row.createdAt),
    updatedAt: row.updatedAt instanceof Date ? row.updatedAt.toISOString() : String(row.updatedAt),
  };
}

/**
 * Lists all PF entries for an account, scoped by userId, optionally filtered by FY.
 */
export async function listPfEntries(
  userId: string,
  accountId: string,
  fy?: string
): Promise<PfEntryDTO[]> {
  // Verify account ownership
  const [account] = await db
    .select({ id: finAccounts.id, kind: finAccounts.kind })
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  const rows = await db
    .select()
    .from(finPfEntries)
    .where(and(eq(finPfEntries.userId, userId), eq(finPfEntries.accountId, accountId)))
    .orderBy(asc(finPfEntries.periodMonth), asc(finPfEntries.postedDate), asc(finPfEntries.createdAt));

  const allEntries = rows.map(mapPfEntryToDTO);

  if (!fy) {
    return allEntries;
  }

  // Filter entries belonging to requested FY
  return allEntries.filter((e) => {
    if (e.periodMonth) {
      return getFyFromDate(e.periodMonth) === fy;
    }
    if (e.postedDate) {
      return getFyFromDate(e.postedDate) === fy;
    }
    return false;
  });
}

/**
 * Returns summary metrics, balances, staleness, virtual forecast, and interest estimates for an EPF/VPF account.
 */
export async function getPfAccountSummary(
  userId: string,
  accountId: string,
  targetFy?: string
): Promise<PfAccountSummaryDTO> {
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  const [settings] = await db
    .select({ timezone: finUserSettings.timezone })
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);

  const tz = settings?.timezone || DEFAULT_TZ;
  const today = todayInTz(tz);
  const currentFy = targetFy || getFyFromDate(today);

  const meta = (account.metadata || {}) as Record<string, unknown>;
  const ratesByFy = (meta.ratesByFy || {}) as Record<string, number>;
  const interestRate = ratesByFy[currentFy] !== undefined ? ratesByFy[currentFy] : null;

  const rows = await db
    .select()
    .from(finPfEntries)
    .where(and(eq(finPfEntries.userId, userId), eq(finPfEntries.accountId, accountId)))
    .orderBy(asc(finPfEntries.periodMonth), asc(finPfEntries.postedDate), asc(finPfEntries.createdAt));

  const entries = rows.map(mapPfEntryToDTO);

  let employeeShare = 0;
  let employerShare = 0;
  let pensionBalance = 0;

  let thisFyContribEmp = 0;
  let thisFyContribEmplyr = 0;
  let thisFyContribPen = 0;

  let thisFyTransferEmp = 0;
  let thisFyTransferEmplyr = 0;
  let thisFyTransferPen = 0;

  for (const e of entries) {
    employeeShare += e.employeeAmount;
    employerShare += e.employerAmount;
    pensionBalance += e.pensionAmount;

    const entryFy = e.periodMonth
      ? getFyFromDate(e.periodMonth)
      : e.postedDate
      ? getFyFromDate(e.postedDate)
      : currentFy;

    if (entryFy === currentFy) {
      if (e.entryKind === 'contribution') {
        thisFyContribEmp += e.employeeAmount;
        thisFyContribEmplyr += e.employerAmount;
        thisFyContribPen += e.pensionAmount;
      } else if (e.entryKind === 'transfer_in_principal' || e.entryKind === 'transfer_in_interest') {
        thisFyTransferEmp += e.employeeAmount;
        thisFyTransferEmplyr += e.employerAmount;
        thisFyTransferPen += e.pensionAmount;
      }
    }
  }

  const pfBalance = employeeShare + employerShare;

  // Interest estimation
  const interestEst = calculateFyInterestEstimate(entries, currentFy, interestRate, today.slice(0, 7));

  // Staleness
  const staleness = checkPassbookStaleness(entries, today);

  // Virtual next contribution
  const virtualNextContribution = computeVirtualNextContribution(entries);

  return {
    pfBalance,
    employeeShare,
    employerShare,
    pensionBalance,
    thisFyContributions: {
      employee: thisFyContribEmp,
      employer: thisFyContribEmplyr,
      pension: thisFyContribPen,
      total: thisFyContribEmp + thisFyContribEmplyr + thisFyContribPen,
    },
    thisFyTransferIns: {
      employee: thisFyTransferEmp,
      employer: thisFyTransferEmplyr,
      pension: thisFyTransferPen,
      total: thisFyTransferEmp + thisFyTransferEmplyr + thisFyTransferPen,
    },
    accruedInterestEstimate: interestEst.totalAccruedInterest,
    interestRate,
    lastImportDate: staleness.latestDate,
    isStale: staleness.isStale,
    staleDays: staleness.staleDays,
    virtualNextContribution,
  };
}

/**
 * Commits parsed passbook entries in ONE atomic transaction.
 * Idempotent via passbookKey.
 */
export async function commitPfPassbook(
  userId: string,
  accountId: string,
  input: import('zod').input<typeof commitPfPassbookInputSchema>
): Promise<CommitPfPassbookResultDTO> {
  const validated = commitPfPassbookInputSchema.parse(input);

  // Check unresolved rows
  const unresolved = validated.entries.filter((e) => e.requiresClassification);
  if (unresolved.length > 0) {
    throw new BadRequestError(
      `Cannot commit passbook with ${unresolved.length} unclassified rows. Please classify them first.`
    );
  }

  return await db.transaction(async (tx) => {
    // 1. Verify account exists and is owned by user
    const [account] = await tx
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
      .limit(1);

    if (!account) {
      throw new NotFoundError(`Account not found: ${accountId}`);
    }

    // 2. Load existing entries for account
    const existing = await tx
      .select()
      .from(finPfEntries)
      .where(and(eq(finPfEntries.userId, userId), eq(finPfEntries.accountId, accountId)));

    const existingByKey = new Map<string, typeof finPfEntries.$inferSelect>();
    for (const row of existing) {
      existingByKey.set(row.passbookKey, row);
    }

    let added = 0;
    let updated = 0;
    let unchanged = 0;

    const importedKeys = new Set<string>();

    for (const entry of validated.entries) {
      const passbookKey =
        entry.passbookKey ||
        generatePassbookKey({
          entryKind: entry.entryKind,
          periodMonth: entry.periodMonth,
          sourceLabel: entry.sourceLabel,
          employeeAmount: entry.employeeAmount,
          employerAmount: entry.employerAmount,
          pensionAmount: entry.pensionAmount,
        });

      importedKeys.add(passbookKey);
      const existingRow = existingByKey.get(passbookKey);

      if (!existingRow) {
        // Insert new entry
        await tx.insert(finPfEntries).values({
          userId,
          accountId,
          entryKind: entry.entryKind,
          periodMonth: entry.periodMonth ?? null,
          postedDate: entry.postedDate ?? null,
          dateApprox: entry.dateApprox ?? false,
          epfWages: entry.epfWages ?? 0,
          epsWages: entry.epsWages ?? 0,
          employeeAmount: entry.employeeAmount,
          employerAmount: entry.employerAmount,
          pensionAmount: entry.pensionAmount,
          sourceLabel: entry.sourceLabel ?? null,
          passbookKey,
          note: entry.note ?? null,
        });
        added++;
      } else {
        // Check if anything changed
        const isChanged =
          Number(existingRow.employeeAmount) !== entry.employeeAmount ||
          Number(existingRow.employerAmount) !== entry.employerAmount ||
          Number(existingRow.pensionAmount) !== entry.pensionAmount ||
          Number(existingRow.epfWages) !== (entry.epfWages ?? 0) ||
          Number(existingRow.epsWages) !== (entry.epsWages ?? 0) ||
          existingRow.postedDate !== (entry.postedDate ?? null) ||
          existingRow.entryKind !== entry.entryKind;

        if (isChanged) {
          await tx
            .update(finPfEntries)
            .set({
              entryKind: entry.entryKind,
              periodMonth: entry.periodMonth ?? null,
              postedDate: entry.postedDate ?? null,
              dateApprox: entry.dateApprox ?? false,
              epfWages: entry.epfWages ?? 0,
              epsWages: entry.epsWages ?? 0,
              employeeAmount: entry.employeeAmount,
              employerAmount: entry.employerAmount,
              pensionAmount: entry.pensionAmount,
              sourceLabel: entry.sourceLabel ?? null,
              note: entry.note ?? null,
              updatedAt: new Date(),
            })
            .where(eq(finPfEntries.id, existingRow.id));
          updated++;
        } else {
          unchanged++;
        }
      }
    }

    // Identify candidate removed rows (keys in DB belonging to the imported period/FY that were not in incoming import)
    const removedCandidateKeys: string[] = [];
    for (const key of existingByKey.keys()) {
      if (!importedKeys.has(key)) {
        // Check if row falls within the imported periods
        removedCandidateKeys.push(key);
      }
    }

    // 3. Compute closing balance
    const rec = computeReconciliation(validated.entries);

    // 4. Update closing balance as valuation anchor if requested
    let anchorCreated = false;
    if (validated.setClosingBalanceAnchor) {
      const anchorDate =
        validated.anchorDate ||
        validated.entries[validated.entries.length - 1]?.postedDate ||
        new Date().toISOString().slice(0, 10);

      const pfAnchorValue = rec.closingBalance.employee + rec.closingBalance.employer;

      await tx
        .insert(finValuations)
        .values({
          accountId,
          date: anchorDate,
          value: pfAnchorValue,
          note: 'EPFO Passbook Closing Balance Anchor',
        })
        .onConflictDoUpdate({
          target: [finValuations.accountId, finValuations.date],
          set: {
            value: pfAnchorValue,
            note: 'EPFO Passbook Closing Balance Anchor',
            updatedAt: new Date(),
          },
        });

      anchorCreated = true;
    }

    // 5. Update account metadata with lastImportAt
    const currentMeta = (account.metadata || {}) as Record<string, unknown>;
    await tx
      .update(finAccounts)
      .set({
        metadata: {
          ...currentMeta,
          lastImportAt: new Date().toISOString(),
        },
        updatedAt: new Date(),
      })
      .where(eq(finAccounts.id, accountId));

    return {
      added,
      updated,
      unchanged,
      removedCandidateKeys,
      closingBalance: rec.closingBalance,
      anchorCreated,
    };
  });
}

/**
 * Updates interest rate for an EPF account for a given financial year.
 */
export async function updatePfAccountRate(
  userId: string,
  accountId: string,
  fy: string,
  rate: number
): Promise<void> {
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new NotFoundError(`Account not found: ${accountId}`);
  }

  const meta = (account.metadata || {}) as Record<string, unknown>;
  const ratesByFy = { ...((meta.ratesByFy as Record<string, number>) || {}) };
  ratesByFy[fy] = rate;

  await db
    .update(finAccounts)
    .set({
      metadata: {
        ...meta,
        ratesByFy,
      },
      updatedAt: new Date(),
    })
    .where(eq(finAccounts.id, accountId));
}
