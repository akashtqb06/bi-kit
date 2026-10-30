import { z } from 'zod';
import {
  ACCOUNT_KINDS,
  COMPOUNDING_FREQUENCIES,
  DEFAULT_EXPENSE_CATEGORIES,
  DEFAULT_INCOME_CATEGORIES,
  type AccountKind,
  type CompoundingFrequency,
} from '../constants';

export const setupPreferencesSchema = z.object({
  timezone: z.string().min(1, 'Timezone is required').default('Asia/Kolkata'),
  baseCurrency: z.literal('INR').default('INR'),
  trackingStartDate: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be formatted as YYYY-MM-DD'),
  weekStartsOn: z.number().int().min(0).max(6).default(1),
});

export type SetupPreferences = z.infer<typeof setupPreferencesSchema>;

export const draftAccountSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1, 'Account name is required'),
  kind: z.enum(ACCOUNT_KINDS),
  institution: z.string().optional(),
  // All monetary values here in integer paise
  balancePaise: z.number().int().optional().default(0), // For cash, bank, other_asset
  owedPaise: z.number().int().min(0).optional().default(0), // For cards and loans (entered positive, stored negative)
  creditLimitPaise: z.number().int().min(0).optional(),
  statementDay: z.number().int().min(1).max(31).optional(),
  dueDay: z.number().int().min(1).max(60).optional(),
  dueDays: z.number().int().min(1).max(60).optional(),
  isOffsetDays: z.boolean().optional(),
  // For FD / RD
  principalPaise: z.number().int().min(0).optional(),
  monthlyInstallmentPaise: z.number().int().min(0).optional(),
  interestRate: z.number().min(0).max(100).optional(), // Annual % (e.g. 7.5)
  compoundingFrequency: z.enum(COMPOUNDING_FREQUENCIES).optional(),
  startDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  maturityDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  tenureMonths: z.number().int().min(1).optional(),
  currentValuePaise: z.number().int().min(0).optional(),
  // For investments
  totalInvestedPaise: z.number().int().min(0).optional(),
  // For loans
  emiPaise: z.number().int().min(0).optional(),
});

export type DraftAccount = z.infer<typeof draftAccountSchema>;

export const setupCategoriesSchema = z.object({
  disabledDefaults: z.array(z.string()).default([]),
  customCategories: z
    .array(
      z.object({
        name: z.string().min(1, 'Category name is required'),
        type: z.enum(['expense', 'income']),
      })
    )
    .default([]),
});

export type SetupCategories = z.infer<typeof setupCategoriesSchema>;

export const setupDraftStateSchema = z.object({
  step: z.number().int().min(1).max(6).default(1),
  preferences: setupPreferencesSchema,
  accounts: z.array(draftAccountSchema).default([]),
  categories: setupCategoriesSchema.default({
    disabledDefaults: [],
    customCategories: [],
  }),
});

export type SetupDraftState = z.infer<typeof setupDraftStateSchema>;

export const completeSetupPayloadSchema = z.object({
  preferences: setupPreferencesSchema,
  accounts: z.array(draftAccountSchema).min(1, 'Please add at least one account'),
  categories: setupCategoriesSchema,
});

export type CompleteSetupPayload = z.infer<typeof completeSetupPayloadSchema>;

export interface AccountWarning {
  accountId?: string;
  accountName: string;
  type: 'card_over_limit' | 'fd_maturity_before_start' | 'duplicate_name' | 'negative_cash';
  message: string;
}

export interface ReviewTotals {
  totalAssetsPaise: number;
  totalLiabilitiesPaise: number;
  netWorthPaise: number;
  warnings: AccountWarning[];
}
