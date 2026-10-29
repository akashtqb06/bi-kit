import { describe, it, expect, beforeEach } from 'vitest';
import { db, finAccounts, finTransactions, finUserSettings, finValuations } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import {
  calculateReviewTotals,
  checkSetupRedirect,
  completeSetup,
  getUserSettings,
  saveDraft,
  skipSetup,
  updateAccountOpeningData,
} from './service';
import type { CompleteSetupPayload, DraftAccount, SetupDraftState } from './types';
import { setupFinanceTestDb, USER_A, USER_B } from '../__tests__/db/test-helper';

describe('Finance First-Run Setup Journey', () => {
  beforeEach(async () => {
    await setupFinanceTestDb();
    // Clean up finance data for test users
    await db.delete(finTransactions).where(eq(finTransactions.userId, USER_A));
    await db.delete(finTransactions).where(eq(finTransactions.userId, USER_B));
    await db.delete(finAccounts).where(eq(finAccounts.userId, USER_A));
    await db.delete(finAccounts).where(eq(finAccounts.userId, USER_B));
    await db.delete(finUserSettings).where(eq(finUserSettings.userId, USER_A));
    await db.delete(finUserSettings).where(eq(finUserSettings.userId, USER_B));
  });

  describe('Totals and Sign Conventions', () => {
    it('accurately computes assets, liabilities, and net worth (Assets - Liabilities)', () => {
      const accounts: DraftAccount[] = [
        {
          name: 'Main Wallet',
          kind: 'cash',
          balancePaise: 500000, // ₹5,000 (Asset)
          owedPaise: 0,
        },
        {
          name: 'HDFC Savings',
          kind: 'bank',
          balancePaise: 5000000, // ₹50,000 (Asset)
          owedPaise: 0,
        },
        {
          name: 'HDFC Credit Card',
          kind: 'credit_card',
          owedPaise: 1500000, // ₹15,000 (Liability)
          balancePaise: -1500000,
          creditLimitPaise: 20000000,
        },
        {
          name: 'Car Loan',
          kind: 'loan',
          owedPaise: 2500000, // ₹25,000 (Liability)
          balancePaise: -2500000,
        },
      ];

      const totals = calculateReviewTotals(accounts, '2026-10-29');

      expect(totals.totalAssetsPaise).toBe(5500000); // 5,000 + 50,000 = ₹55,000
      expect(totals.totalLiabilitiesPaise).toBe(4000000); // 15,000 + 25,000 = ₹40,000
      expect(totals.netWorthPaise).toBe(1500000); // 55,000 - 40,000 = ₹15,000
    });

    it('detects review warnings (card over limit, FD maturity before start, duplicate names, negative cash)', () => {
      const accounts: DraftAccount[] = [
        {
          name: 'Wallet',
          kind: 'cash',
          balancePaise: -100000, // Negative cash warning
          owedPaise: 0,
        },
        {
          name: 'Wallet', // Duplicate name warning
          kind: 'bank',
          balancePaise: 200000,
          owedPaise: 0,
        },
        {
          name: 'Overdrawn Card',
          kind: 'credit_card',
          owedPaise: 2500000,
          balancePaise: -2500000,
          creditLimitPaise: 2000000, // Owed > limit warning
        },
        {
          name: 'Bad FD',
          kind: 'fixed_deposit',
          principalPaise: 10000000,
          balancePaise: 10000000,
          owedPaise: 0,
          startDate: '2026-10-29',
          maturityDate: '2026-05-01', // Maturity before start warning
          compoundingFrequency: 'quarterly',
        },
      ];

      const totals = calculateReviewTotals(accounts, '2026-10-29');

      const warningTypes = totals.warnings.map((w) => w.type);
      expect(warningTypes).toContain('negative_cash');
      expect(warningTypes).toContain('duplicate_name');
      expect(warningTypes).toContain('card_over_limit');
      expect(warningTypes).toContain('fd_maturity_before_start');
    });
  });

  describe('Draft Autosave and Resume Across Sessions', () => {
    it('autosaves draft state and resumes on next session', async () => {
      const draftState: SetupDraftState = {
        step: 3,
        preferences: {
          timezone: 'Asia/Kolkata',
          baseCurrency: 'INR',
          trackingStartDate: '2026-10-29',
          weekStartsOn: 1,
        },
        accounts: [
          {
            name: 'Draft Bank',
            kind: 'bank',
            balancePaise: 2500000,
            owedPaise: 0,
          },
        ],
        categories: {
          disabledDefaults: ['Rent'],
          customCategories: [{ name: 'Gym', type: 'expense' }],
        },
      };

      await saveDraft(USER_A, 3, draftState);

      const retrieved = await getUserSettings(USER_A);
      expect(retrieved).not.toBeNull();
      expect(retrieved?.setupStep).toBe(3);
      expect(retrieved?.timezone).toBe('Asia/Kolkata');
      expect(retrieved?.trackingStartDate).toBe('2026-10-29');

      const loadedDraft = retrieved?.draft as SetupDraftState;
      expect(loadedDraft.step).toBe(3);
      expect(loadedDraft.accounts).toHaveLength(1);
      expect(loadedDraft.accounts[0].name).toBe('Draft Bank');
      expect(loadedDraft.categories.disabledDefaults).toContain('Rent');
    });
  });

  describe('Redirect Rules', () => {
    it('requires redirect for a fresh user with 0 accounts and incomplete setup', async () => {
      const status = await checkSetupRedirect(USER_A);
      expect(status.shouldRedirect).toBe(true);
      expect(status.isCompleted).toBe(false);
      expect(status.isSkipped).toBe(false);
      expect(status.hasAccounts).toBe(false);
    });

    it('does not redirect if user skipped setup', async () => {
      await skipSetup(USER_A);
      const status = await checkSetupRedirect(USER_A);
      expect(status.shouldRedirect).toBe(false);
      expect(status.isSkipped).toBe(true);
    });

    it('does not redirect if user already has accounts', async () => {
      // Insert one account directly
      await db.insert(finAccounts).values({
        userId: USER_A,
        name: 'Existing Account',
        kind: 'bank',
        class: 'asset',
      });

      const status = await checkSetupRedirect(USER_A);
      expect(status.shouldRedirect).toBe(false);
      expect(status.hasAccounts).toBe(true);
    });

    it('does not redirect if setup is already completed', async () => {
      await db.insert(finUserSettings).values({
        userId: USER_A,
        setupCompletedAt: new Date(),
        setupStep: 6,
      });

      const status = await checkSetupRedirect(USER_A);
      expect(status.shouldRedirect).toBe(false);
      expect(status.isCompleted).toBe(true);
    });
  });

  describe('Atomic Commit and Rollback', () => {
    it('commits all accounts, opening transactions, valuations, and categories in ONE transaction', async () => {
      const payload: CompleteSetupPayload = {
        preferences: {
          timezone: 'Asia/Kolkata',
          baseCurrency: 'INR',
          trackingStartDate: '2026-10-29',
          weekStartsOn: 1,
        },
        accounts: [
          {
            name: 'Savings',
            kind: 'bank',
            balancePaise: 10000000, // ₹1,00,000
            owedPaise: 0,
          },
          {
            name: 'Credit Card',
            kind: 'credit_card',
            owedPaise: 2000000, // ₹20,000
            balancePaise: -2000000,
            creditLimitPaise: 10000000,
          },
          {
            name: 'Tech Stocks',
            kind: 'stocks',
            currentValuePaise: 50000000, // ₹5,00,000
            totalInvestedPaise: 40000000, // ₹4,00,000
            balancePaise: 50000000,
            owedPaise: 0,
          },
        ],
        categories: {
          disabledDefaults: ['Rent'],
          customCategories: [{ name: 'Freelance Software', type: 'income' }],
        },
      };

      const result = await completeSetup(USER_A, payload);
      expect(result.success).toBe(true);
      expect(result.accountsCreated).toBe(3);

      // Verify accounts created
      const accounts = await db
        .select()
        .from(finAccounts)
        .where(eq(finAccounts.userId, USER_A));
      expect(accounts).toHaveLength(3);

      // Verify opening transactions created with correct signedAmounts
      const txs = await db
        .select()
        .from(finTransactions)
        .where(eq(finTransactions.userId, USER_A));
      expect(txs).toHaveLength(3);

      const cardTx = txs.find((t) => t.signedAmount < 0);
      expect(cardTx).toBeDefined();
      expect(cardTx?.signedAmount).toBe(-2000000); // Negative ledger balance for card!
      expect(cardTx?.payee).toBe('Opening Balance');

      // Verify valuation created for stocks
      const stockAcc = accounts.find((a) => a.kind === 'stocks')!;
      const valuations = await db
        .select()
        .from(finValuations)
        .where(eq(finValuations.accountId, stockAcc.id));
      expect(valuations).toHaveLength(1);
      expect(valuations[0].value).toBe(50000000);
      expect(valuations[0].costBasis).toBe(40000000);

      // Verify setup marked completed
      const settings = await getUserSettings(USER_A);
      expect(settings?.setupCompletedAt).not.toBeNull();
      expect(settings?.setupStep).toBe(6);
    });

    it('rolls back completely if any part of setup throws an error', async () => {
      const invalidPayload = {
        preferences: {
          timezone: 'Asia/Kolkata',
          baseCurrency: 'INR',
          trackingStartDate: '2026-10-29',
          weekStartsOn: 1,
        },
        accounts: [], // Invalid: schema requires at least 1 account!
        categories: {
          disabledDefaults: [],
          customCategories: [],
        },
      } as unknown as CompleteSetupPayload;

      await expect(completeSetup(USER_A, invalidPayload)).rejects.toThrow();

      // Verify 0 accounts were committed
      const accounts = await db
        .select()
        .from(finAccounts)
        .where(eq(finAccounts.userId, USER_A));
      expect(accounts).toHaveLength(0);

      // Verify setup is not marked completed
      const settings = await getUserSettings(USER_A);
      expect(settings?.setupCompletedAt).toBeFalsy();
    });
  });

  describe('User Isolation', () => {
    it('strictly isolates settings and draft between User A and User B', async () => {
      const draftA: SetupDraftState = {
        step: 2,
        preferences: {
          timezone: 'Asia/Kolkata',
          baseCurrency: 'INR',
          trackingStartDate: '2026-10-29',
          weekStartsOn: 1,
        },
        accounts: [{ name: 'User A Bank', kind: 'bank', balancePaise: 100000, owedPaise: 0 }],
        categories: { disabledDefaults: [], customCategories: [] },
      };

      const draftB: SetupDraftState = {
        step: 4,
        preferences: {
          timezone: 'America/New_York',
          baseCurrency: 'INR',
          trackingStartDate: '2026-11-01',
          weekStartsOn: 0,
        },
        accounts: [{ name: 'User B Bank', kind: 'bank', balancePaise: 900000, owedPaise: 0 }],
        categories: { disabledDefaults: [], customCategories: [] },
      };

      await saveDraft(USER_A, 2, draftA);
      await saveDraft(USER_B, 4, draftB);

      const settingsA = await getUserSettings(USER_A);
      const settingsB = await getUserSettings(USER_B);

      expect(settingsA?.setupStep).toBe(2);
      expect(settingsB?.setupStep).toBe(4);
      expect(settingsA?.timezone).toBe('Asia/Kolkata');
      expect(settingsB?.timezone).toBe('America/New_York');

      const loadedA = settingsA?.draft as SetupDraftState;
      const loadedB = settingsB?.draft as SetupDraftState;

      expect(loadedA.accounts[0].name).toBe('User A Bank');
      expect(loadedB.accounts[0].name).toBe('User B Bank');
    });
  });

  describe('Account Opening Data Update', () => {
    it('updates opening balance and date with confirmation impact', async () => {
      const payload: CompleteSetupPayload = {
        preferences: {
          timezone: 'Asia/Kolkata',
          baseCurrency: 'INR',
          trackingStartDate: '2026-10-01',
          weekStartsOn: 1,
        },
        accounts: [
          {
            name: 'Editable Bank',
            kind: 'bank',
            balancePaise: 5000000, // ₹50,000
            owedPaise: 0,
          },
        ],
        categories: { disabledDefaults: [], customCategories: [] },
      };

      await completeSetup(USER_A, payload);

      const [account] = await db
        .select()
        .from(finAccounts)
        .where(eq(finAccounts.userId, USER_A));
      expect(account).toBeDefined();

      // Edit opening data later
      await updateAccountOpeningData(USER_A, account.id, {
        openingBalancePaise: 7500000, // Updated to ₹75,000
        openingDate: '2026-09-15',
      });

      // Verify opening transaction was updated
      const [openingTx] = await db
        .select()
        .from(finTransactions)
        .where(
          eq(finTransactions.accountId, account.id)
        );

      expect(openingTx.signedAmount).toBe(7500000);
      expect(openingTx.date).toBe('2026-09-15');
    });
  });
});
