import { and, eq, sql } from 'drizzle-orm';
import { db } from '@src/lib/db';
import {
  finAccounts,
  finCategories,
  finTransactions,
  finUserSettings,
  finValuations,
  type FinUserSettings,
} from '@src/lib/db/schema/finance';
import { newId } from '@src/lib/db/id';
import {
  ACCOUNT_KIND_CLASS_MAP,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
} from '../constants';
import {
  calculateFDAccruedValue,
  calculateRDAccruedValue,
} from '../domain/deposits';
import {
  completeSetupPayloadSchema,
  setupDraftStateSchema,
} from './types';
import type {
  CompleteSetupPayload,
  SetupDraftState,
} from './types';

/**
 * Retrieves the settings and setup progress for an authenticated user.
 */
export async function getUserSettings(userId: string): Promise<FinUserSettings | null> {
  const [settings] = await db
    .select()
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);

  return settings || null;
}

/**
 * Checks if a user should be redirected to the setup wizard.
 * Redirect rule: if setup is neither completed nor skipped, and user has 0 accounts.
 */
export async function checkSetupRedirect(userId: string): Promise<{
  shouldRedirect: boolean;
  isSkipped: boolean;
  isCompleted: boolean;
  hasAccounts: boolean;
}> {
  const settings = await getUserSettings(userId);
  const isCompleted = Boolean(settings?.setupCompletedAt);
  const isSkipped = Boolean(settings?.setupSkippedAt);

  const [accountCountRow] = await db
    .select({ count: sql<number>`count(*)::int` })
    .from(finAccounts)
    .where(eq(finAccounts.userId, userId));

  const hasAccounts = (accountCountRow?.count || 0) > 0;
  const shouldRedirect = !isCompleted && !isSkipped && !hasAccounts;

  return {
    shouldRedirect,
    isSkipped,
    isCompleted,
    hasAccounts,
  };
}

/**
 * Debounced draft autosave.
 */
export async function saveDraft(
  userId: string,
  step: number,
  draft: SetupDraftState
): Promise<FinUserSettings> {
  const validated = setupDraftStateSchema.parse(draft);
  const now = new Date();

  const [existing] = await db
    .select()
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(finUserSettings)
      .set({
        setupStep: step,
        draft: validated as unknown as Record<string, unknown>,
        timezone: validated.preferences.timezone,
        trackingStartDate: validated.preferences.trackingStartDate,
        weekStartsOn: validated.preferences.weekStartsOn,
        updatedAt: now,
      })
      .where(eq(finUserSettings.userId, userId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(finUserSettings)
    .values({
      userId,
      setupStep: step,
      draft: validated as unknown as Record<string, unknown>,
      timezone: validated.preferences.timezone,
      trackingStartDate: validated.preferences.trackingStartDate,
      weekStartsOn: validated.preferences.weekStartsOn,
      baseCurrency: 'INR',
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

/**
 * Skips the setup journey. Sets setupSkippedAt.
 */
export async function skipSetup(userId: string): Promise<FinUserSettings> {
  const now = new Date();
  const [existing] = await db
    .select()
    .from(finUserSettings)
    .where(eq(finUserSettings.userId, userId))
    .limit(1);

  if (existing) {
    const [updated] = await db
      .update(finUserSettings)
      .set({
        setupSkippedAt: now,
        updatedAt: now,
      })
      .where(eq(finUserSettings.userId, userId))
      .returning();
    return updated;
  }

  const [created] = await db
    .insert(finUserSettings)
    .values({
      userId,
      setupSkippedAt: now,
      baseCurrency: 'INR',
      timezone: 'Asia/Kolkata',
      weekStartsOn: 1,
      createdAt: now,
      updatedAt: now,
    })
    .returning();

  return created;
}

export { calculateReviewTotals } from './review-totals';

/**
 * Completes the setup in ONE database transaction.
 * Creates accounts, opening transactions, valuations, categories, and marks setup completed.
 */
export async function completeSetup(
  userId: string,
  payload: CompleteSetupPayload
): Promise<{ success: boolean; accountsCreated: number }> {
  const validated = completeSetupPayloadSchema.parse(payload);
  const now = new Date();
  const trackingDate = validated.preferences.trackingStartDate;

  let accountsCreated = 0;

  await db.transaction(async (tx) => {
    // 1. Process Categories
    const disabledSet = new Set(validated.categories.disabledDefaults);

    // Create enabled default expense categories
    for (const name of DEFAULT_EXPENSE_CATEGORIES) {
      if (!disabledSet.has(name)) {
        const [existing] = await tx
          .select({ id: finCategories.id })
          .from(finCategories)
          .where(and(eq(finCategories.userId, userId), eq(finCategories.name, name)))
          .limit(1);

        if (!existing) {
          await tx.insert(finCategories).values({
            id: newId(),
            userId,
            name,
            type: 'expense',
            isSystem: false,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Create enabled default income categories
    for (const name of DEFAULT_INCOME_CATEGORIES) {
      if (!disabledSet.has(name)) {
        const [existing] = await tx
          .select({ id: finCategories.id })
          .from(finCategories)
          .where(and(eq(finCategories.userId, userId), eq(finCategories.name, name)))
          .limit(1);

        if (!existing) {
          await tx.insert(finCategories).values({
            id: newId(),
            userId,
            name,
            type: 'income',
            isSystem: false,
            createdAt: now,
            updatedAt: now,
          });
        }
      }
    }

    // Create custom categories
    for (const custom of validated.categories.customCategories) {
      const [existing] = await tx
        .select({ id: finCategories.id })
        .from(finCategories)
        .where(and(eq(finCategories.userId, userId), eq(finCategories.name, custom.name)))
        .limit(1);

      if (!existing) {
        await tx.insert(finCategories).values({
          id: newId(),
          userId,
          name: custom.name,
          type: custom.type,
          isSystem: false,
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 2. Process Accounts
    for (const acc of validated.accounts) {
      // Check if account already exists with same name for this user (e.g. on re-run setup)
      const [existingAccount] = await tx
        .select({ id: finAccounts.id })
        .from(finAccounts)
        .where(and(eq(finAccounts.userId, userId), eq(finAccounts.name, acc.name)))
        .limit(1);

      if (existingAccount) {
        // Skip existing account during re-run to avoid duplicate creation
        continue;
      }

      const accountClass = ACCOUNT_KIND_CLASS_MAP[acc.kind];
      const accountId = newId();

      // Determine sign convention and opening values
      let ledgerBalancePaise = 0;
      let valuationPaise: number | null = null;
      let costBasisPaise: number | null = null;

      if (acc.kind === 'credit_card') {
        const owed = Math.max(0, acc.owedPaise || 0);
        ledgerBalancePaise = -owed;
      } else if (acc.kind === 'loan') {
        const owed = Math.max(0, acc.owedPaise || 0);
        ledgerBalancePaise = -owed;
      } else if (acc.kind === 'fixed_deposit') {
        const principal = acc.principalPaise || acc.balancePaise || 0;
        ledgerBalancePaise = principal;
        costBasisPaise = principal;

        if (acc.currentValuePaise !== undefined) {
          valuationPaise = acc.currentValuePaise;
        } else if (principal > 0 && acc.startDate) {
          valuationPaise = calculateFDAccruedValue({
            principal,
            annualInterestRate: (acc.interestRate || 0) / 100,
            compoundingFrequency: acc.compoundingFrequency ?? 'quarterly',
            startDate: acc.startDate,
            maturityDate: acc.maturityDate,
            asOfDate: trackingDate,
          });
        } else {
          valuationPaise = principal;
        }
      } else if (acc.kind === 'recurring_deposit') {
        const installment = acc.monthlyInstallmentPaise || 0;
        ledgerBalancePaise = installment;
        costBasisPaise = acc.totalInvestedPaise || (installment * (acc.tenureMonths || 1));

        if (acc.currentValuePaise !== undefined) {
          valuationPaise = acc.currentValuePaise;
        } else if (installment > 0 && acc.startDate && acc.tenureMonths) {
          valuationPaise = calculateRDAccruedValue({
            monthlyInstallment: installment,
            annualInterestRate: (acc.interestRate || 0) / 100,
            startDate: acc.startDate,
            tenureMonths: acc.tenureMonths,
            asOfDate: trackingDate,
          });
        } else {
          valuationPaise = installment;
        }
      } else if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
        const currentVal = acc.currentValuePaise || acc.balancePaise || 0;
        const totalInvested = acc.totalInvestedPaise !== undefined ? acc.totalInvestedPaise : currentVal;
        ledgerBalancePaise = totalInvested;
        valuationPaise = currentVal;
        costBasisPaise = totalInvested;
      } else {
        // Cash, Bank, Other asset, Other liability
        ledgerBalancePaise = acc.balancePaise || 0;
      }

      const metadata: Record<string, unknown> = {
        openingBalancePaise: ledgerBalancePaise,
        openingDate: trackingDate,
        institution: acc.institution,
      };

      if (acc.kind === 'credit_card') {
        metadata.statementDay = acc.statementDay;
        metadata.dueDay = acc.dueDay;
      } else if (acc.kind === 'fixed_deposit') {
        metadata.principalPaise = acc.principalPaise;
        metadata.interestRate = acc.interestRate;
        metadata.compoundingFrequency = acc.compoundingFrequency;
        metadata.startDate = acc.startDate;
        metadata.maturityDate = acc.maturityDate;
      } else if (acc.kind === 'recurring_deposit') {
        metadata.monthlyInstallmentPaise = acc.monthlyInstallmentPaise;
        metadata.interestRate = acc.interestRate;
        metadata.startDate = acc.startDate;
        metadata.tenureMonths = acc.tenureMonths;
      } else if (acc.kind === 'mutual_fund' || acc.kind === 'stocks') {
        metadata.openingContributionPaise = costBasisPaise;
        metadata.openingValuationPaise = valuationPaise;
      } else if (acc.kind === 'loan') {
        metadata.interestRate = acc.interestRate;
        metadata.emiPaise = acc.emiPaise;
      }

      await tx.insert(finAccounts).values({
        id: accountId,
        userId,
        name: acc.name,
        kind: acc.kind,
        class: accountClass,
        currency: 'INR',
        creditLimit: acc.creditLimitPaise !== undefined ? acc.creditLimitPaise : null,
        isActive: true,
        metadata,
        createdAt: now,
        updatedAt: now,
      });

      accountsCreated++;

      // Create opening balance transaction if non-zero
      if (ledgerBalancePaise !== 0) {
        await tx.insert(finTransactions).values({
          id: newId(),
          userId,
          accountId,
          date: trackingDate,
          type: 'adjustment',
          amount: Math.abs(ledgerBalancePaise),
          signedAmount: ledgerBalancePaise,
          payee: 'Opening Balance',
          note: `Initial balance as of ${trackingDate}`,
          createdAt: now,
          updatedAt: now,
        });
      }

      // Create opening valuation for investments and deposits
      if (valuationPaise !== null) {
        await tx.insert(finValuations).values({
          id: newId(),
          accountId,
          date: trackingDate,
          value: valuationPaise,
          costBasis: costBasisPaise,
          note: 'Opening valuation recorded during setup',
          createdAt: now,
          updatedAt: now,
        });
      }
    }

    // 3. Mark setup complete in finUserSettings
    const [existingSettings] = await tx
      .select({ userId: finUserSettings.userId })
      .from(finUserSettings)
      .where(eq(finUserSettings.userId, userId))
      .limit(1);

    if (existingSettings) {
      await tx
        .update(finUserSettings)
        .set({
          setupCompletedAt: now,
          setupStep: 6,
          baseCurrency: 'INR',
          timezone: validated.preferences.timezone,
          trackingStartDate: trackingDate,
          weekStartsOn: validated.preferences.weekStartsOn,
          draft: null,
          updatedAt: now,
        })
        .where(eq(finUserSettings.userId, userId));
    } else {
      await tx.insert(finUserSettings).values({
        userId,
        setupCompletedAt: now,
        setupStep: 6,
        baseCurrency: 'INR',
        timezone: validated.preferences.timezone,
        trackingStartDate: trackingDate,
        weekStartsOn: validated.preferences.weekStartsOn,
        draft: null,
        createdAt: now,
        updatedAt: now,
      });
    }
  });

  return { success: true, accountsCreated };
}

/**
 * Updates an account's opening balance and date with historical impact.
 */
export async function updateAccountOpeningData(
  userId: string,
  accountId: string,
  data: {
    openingBalancePaise: number;
    openingDate: string;
  }
): Promise<void> {
  const [account] = await db
    .select()
    .from(finAccounts)
    .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)))
    .limit(1);

  if (!account) {
    throw new Error(`Account not found: ${accountId}`);
  }

  const now = new Date();
  const metadata = {
    ...((account.metadata || {}) as Record<string, unknown>),
    openingBalancePaise: data.openingBalancePaise,
    openingDate: data.openingDate,
  };

  await db.transaction(async (tx) => {
    // 1. Update account metadata
    await tx
      .update(finAccounts)
      .set({
        metadata,
        updatedAt: now,
      })
      .where(and(eq(finAccounts.id, accountId), eq(finAccounts.userId, userId)));

    // 2. Locate existing opening balance transaction
    const [existingTx] = await tx
      .select({ id: finTransactions.id })
      .from(finTransactions)
      .where(
        and(
          eq(finTransactions.userId, userId),
          eq(finTransactions.accountId, accountId),
          eq(finTransactions.payee, 'Opening Balance')
        )
      )
      .limit(1);

    if (existingTx) {
      if (data.openingBalancePaise === 0) {
        // Delete if now zero
        await tx
          .delete(finTransactions)
          .where(eq(finTransactions.id, existingTx.id));
      } else {
        await tx
          .update(finTransactions)
          .set({
            date: data.openingDate,
            amount: Math.abs(data.openingBalancePaise),
            signedAmount: data.openingBalancePaise,
            updatedAt: now,
          })
          .where(eq(finTransactions.id, existingTx.id));
      }
    } else if (data.openingBalancePaise !== 0) {
      await tx.insert(finTransactions).values({
        id: newId(),
        userId,
        accountId,
        date: data.openingDate,
        type: 'adjustment',
        amount: Math.abs(data.openingBalancePaise),
        signedAmount: data.openingBalancePaise,
        payee: 'Opening Balance',
        note: `Opening balance updated on ${now.toISOString().slice(0, 10)}`,
        createdAt: now,
        updatedAt: now,
      });
    }

    // 3. For investment / deposit accounts: update or insert opening valuation
    if (['mutual_fund', 'stocks', 'fixed_deposit', 'recurring_deposit'].includes(account.kind)) {
      const [existingVal] = await tx
        .select({ id: finValuations.id })
        .from(finValuations)
        .where(
          and(
            eq(finValuations.accountId, accountId),
            eq(finValuations.note, 'Opening valuation recorded during setup')
          )
        )
        .limit(1);

      if (existingVal) {
        await tx
          .update(finValuations)
          .set({
            date: data.openingDate,
            value: data.openingBalancePaise,
            costBasis: data.openingBalancePaise,
            updatedAt: now,
          })
          .where(eq(finValuations.id, existingVal.id));
      }
    }
  });
}
