import { describe, it, expect } from 'vitest';
import {
  createAccountSchema,
  createTransactionSchema,
  createValuationSchema,
  createBudgetSchema,
  createRecurringRuleSchema,
  transactionFiltersSchema,
  dateStringSchema,
  moneyPaiseSchema,
} from './contract';

describe('Finance Contract & Zod Validation Tests', () => {
  describe('Primitive validations', () => {
    it('validates YYYY-MM-DD date strings', () => {
      expect(dateStringSchema.safeParse('2026-10-28').success).toBe(true);
      expect(dateStringSchema.safeParse('2026-1-1').success).toBe(false);
      expect(dateStringSchema.safeParse('invalid-date').success).toBe(false);
      expect(dateStringSchema.safeParse('28-10-2026').success).toBe(false);
    });

    it('validates integer money in paise (no floats allowed)', () => {
      expect(moneyPaiseSchema.safeParse(10050).success).toBe(true);
      expect(moneyPaiseSchema.safeParse(0).success).toBe(true);
      expect(moneyPaiseSchema.safeParse(-500).success).toBe(true);
      expect(moneyPaiseSchema.safeParse(100.5).success).toBe(false);
    });
  });

  describe('Account schemas', () => {
    it('validates valid account creation', () => {
      const valid = {
        name: 'HDFC Salary Bank',
        kind: 'bank',
        currency: 'INR',
      };
      const res = createAccountSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('rejects invalid account kind', () => {
      const invalid = {
        name: 'My Account',
        kind: 'crypto_wallet_xyz',
      };
      const res = createAccountSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });

    it('requires account name', () => {
      const invalid = {
        name: '',
        kind: 'cash',
      };
      const res = createAccountSchema.safeParse(invalid);
      expect(res.success).toBe(false);
    });
  });

  describe('Transaction schemas & Transfer constraint', () => {
    it('validates expense transaction with positive amount', () => {
      const valid = {
        accountId: 'acc_123',
        date: '2026-10-28',
        type: 'expense',
        amount: 25000, // 250.00 INR
        payee: 'Starbucks',
        note: 'Coffee meeting',
      };
      const res = createTransactionSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('enforces transfer transactions require distinct toAccountId', () => {
      // Missing toAccountId
      const invalidTransfer1 = {
        accountId: 'acc_123',
        date: '2026-10-28',
        type: 'transfer',
        amount: 50000,
      };
      const res1 = createTransactionSchema.safeParse(invalidTransfer1);
      expect(res1.success).toBe(false);

      // Same toAccountId as accountId
      const invalidTransfer2 = {
        accountId: 'acc_123',
        toAccountId: 'acc_123',
        date: '2026-10-28',
        type: 'transfer',
        amount: 50000,
      };
      const res2 = createTransactionSchema.safeParse(invalidTransfer2);
      expect(res2.success).toBe(false);

      // Valid transfer between distinct accounts
      const validTransfer = {
        accountId: 'acc_source',
        toAccountId: 'acc_target',
        date: '2026-10-28',
        type: 'transfer',
        amount: 50000,
      };
      const res3 = createTransactionSchema.safeParse(validTransfer);
      expect(res3.success).toBe(true);
    });

    it('rejects zero or negative amounts for standard transactions', () => {
      const zeroAmount = {
        accountId: 'acc_123',
        date: '2026-10-28',
        type: 'expense',
        amount: 0,
      };
      expect(createTransactionSchema.safeParse(zeroAmount).success).toBe(false);

      const negativeAmount = {
        accountId: 'acc_123',
        date: '2026-10-28',
        type: 'expense',
        amount: -500,
      };
      expect(createTransactionSchema.safeParse(negativeAmount).success).toBe(false);
    });
  });

  describe('Valuation schemas', () => {
    it('validates investment valuation', () => {
      const valid = {
        accountId: 'acc_mf_1',
        date: '2026-10-28',
        value: 15420000, // 154,200.00 INR
        costBasis: 12000000,
        note: 'Quarterly NAV update',
      };
      const res = createValuationSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });
  });

  describe('Budget & Recurring Rule schemas', () => {
    it('validates monthly budget', () => {
      const valid = {
        categoryId: 'cat_food',
        amount: 1500000,
        period: 'monthly',
        startDate: '2026-10-01',
      };
      const res = createBudgetSchema.safeParse(valid);
      expect(res.success).toBe(true);
    });

    it('validates recurring rule transfer constraint', () => {
      const invalid = {
        accountId: 'acc_1',
        toAccountId: 'acc_1',
        type: 'transfer',
        amount: 100000,
        frequency: 'monthly',
        startDate: '2026-11-01',
      };
      expect(createRecurringRuleSchema.safeParse(invalid).success).toBe(false);

      const valid = {
        accountId: 'acc_1',
        toAccountId: 'acc_2',
        type: 'transfer',
        amount: 100000,
        frequency: 'monthly',
        startDate: '2026-11-01',
      };
      expect(createRecurringRuleSchema.safeParse(valid).success).toBe(true);
    });
  });

  describe('Filter & pagination parsing', () => {
    it('clamps limit to maximum 200', () => {
      const parsed = transactionFiltersSchema.parse({ limit: '500' });
      expect(parsed.limit).toBe(200);

      const defaultParsed = transactionFiltersSchema.parse({});
      expect(defaultParsed.limit).toBe(50);
    });
  });
});
