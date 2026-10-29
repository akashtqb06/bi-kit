import { describe, it, expect } from 'vitest';
import { generateFinanceData } from './generator';
import { createTransactionSchema } from '../contract';

describe('Finance Data Generator & Invariants', () => {
  describe('Generator Determinism', () => {
    it('produces byte-identical JSON output for the same seed and persona', () => {
      const run1 = generateFinanceData({
        persona: 'salaried-urban',
        seed: 'test_seed_123',
        anchorDate: '2026-10-31',
        months: 24,
      });

      const run2 = generateFinanceData({
        persona: 'salaried-urban',
        seed: 'test_seed_123',
        anchorDate: '2026-10-31',
        months: 24,
      });

      expect(JSON.stringify(run1)).toBe(JSON.stringify(run2));
    });

    it('produces different data when seed changes', () => {
      const runA = generateFinanceData({
        persona: 'salaried-urban',
        seed: 'seed_alpha',
        anchorDate: '2026-10-31',
      });

      const runB = generateFinanceData({
        persona: 'salaried-urban',
        seed: 'seed_beta',
        anchorDate: '2026-10-31',
      });

      expect(JSON.stringify(runA)).not.toBe(JSON.stringify(runB));
    });

    it('supports all three personas with 24 months history', () => {
      const personas = ['salaried-urban', 'freelancer', 'family'] as const;
      for (const p of personas) {
        const data = generateFinanceData({ persona: p, seed: 'test_seed' });
        expect(data.accounts.length).toBeGreaterThan(4);
        expect(data.transactions.length).toBeGreaterThan(50);
        expect(data.categories.length).toBeGreaterThan(10);
      }
    });
  });

  describe('Data Integrity & Invariants', () => {
    const data = generateFinanceData({
      persona: 'salaried-urban',
      seed: 'invariant_seed',
      anchorDate: '2026-10-31',
      months: 24,
    });

    const accountIds = new Set(data.accounts.map((a) => a.id));
    const categoryIds = new Set(data.categories.map((c) => c.id));

    it('has zero orphan account references in transactions', () => {
      for (const txn of data.transactions) {
        expect(accountIds.has(txn.accountId)).toBe(true);
        if (txn.toAccountId) {
          expect(accountIds.has(txn.toAccountId)).toBe(true);
        }
      }
    });

    it('has zero orphan category references in transactions', () => {
      for (const txn of data.transactions) {
        if (txn.categoryId) {
          expect(categoryIds.has(txn.categoryId)).toBe(true);
        }
      }
    });

    it('guarantees transfers net to zero', () => {
      // For every transfer from account A to account B, the transfer amount leaving A equals the amount entering B
      const transfers = data.transactions.filter((t) => t.type === 'transfer' && !t.deletedAt);
      for (const t of transfers) {
        expect(t.amount).toBeGreaterThan(0);
        expect(t.signedAmount).toBe(-t.amount);
        expect(t.toAccountId).toBeDefined();
        expect(t.toAccountId).not.toBe(t.accountId);
      }
    });

    it('ensures all transaction dates are in range', () => {
      for (const txn of data.transactions) {
        // Date is <= anchor date
        expect(txn.date <= data.anchorDate).toBe(true);
        expect(txn.date >= '2024-01-01').toBe(true);
      }
    });

    it('includes required edge cases: leap day, Tamil, Hindi, emojis, float breaking, archived account', () => {
      // Leap day entry
      const leapTxn = data.transactions.find((t) => t.date === '2024-02-29');
      expect(leapTxn).toBeDefined();

      // Tamil payee
      const tamilTxn = data.transactions.find((t) => t.payee?.includes('மளிகை'));
      expect(tamilTxn).toBeDefined();

      // Hindi payee
      const hindiTxn = data.transactions.find((t) => t.payee?.includes('दुकान'));
      expect(hindiTxn).toBeDefined();

      // Emoji payee
      const emojiTxn = data.transactions.find((t) => t.payee?.includes('☕') || t.payee?.includes('🛒'));
      expect(emojiTxn).toBeDefined();

      // Sub-rupee / float-breaking paise amounts (30 paise)
      const floatTxn = data.transactions.find((t) => t.amount === 30);
      expect(floatTxn).toBeDefined();

      // Archived account
      const archivedAcc = data.accounts.find((a) => a.isActive === false);
      expect(archivedAcc).toBeDefined();

      // Soft-deleted transaction
      const deletedTxn = data.transactions.find((t) => t.deletedAt != null);
      expect(deletedTxn).toBeDefined();
    });

    it('enforces validation rejection for same-account transfer and zero amount', () => {
      // Reject transfer between same account
      const sameAccountTransfer = {
        accountId: 'acc_1',
        toAccountId: 'acc_1',
        date: '2026-10-28',
        type: 'transfer',
        amount: 50000,
      };
      const parseResult1 = createTransactionSchema.safeParse(sameAccountTransfer);
      expect(parseResult1.success).toBe(false);

      // Reject zero amount
      const zeroAmount = {
        accountId: 'acc_1',
        date: '2026-10-28',
        type: 'expense',
        amount: 0,
      };
      const parseResult2 = createTransactionSchema.safeParse(zeroAmount);
      expect(parseResult2.success).toBe(false);
    });
  });
});

