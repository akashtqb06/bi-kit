import { z } from 'zod';
import {
  ACCOUNT_CLASSES,
  ACCOUNT_KINDS,
  BUDGET_PERIODS,
  DEFAULT_CURRENCY,
  RECURRING_FREQUENCIES,
  TRANSACTION_TYPES,
} from './constants';

export const dateStringSchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/, 'Must be a date in YYYY-MM-DD format');

// Safe integer in minor units (paise)
export const moneyPaiseSchema = z.number().int('Amount must be an integer in paise');
export const positiveMoneyPaiseSchema = z.number().int().positive('Amount must be positive in paise');

// ============================================================================
// Accounts
// ============================================================================

export const accountSchema = z.object({
  id: z.string(),
  userId: z.string(),
  name: z.string().min(1, 'Account name is required'),
  kind: z.enum(ACCOUNT_KINDS),
  class: z.enum(ACCOUNT_CLASSES),
  currency: z.string().default(DEFAULT_CURRENCY),
  creditLimit: z.number().int().nullable().optional(),
  isActive: z.boolean().default(true),
  metadata: z.record(z.string(), z.unknown()).default({}),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type AccountDTO = z.infer<typeof accountSchema>;

export const createAccountSchema = z.object({
  name: z.string().min(1, 'Account name is required').max(100),
  kind: z.enum(ACCOUNT_KINDS),
  currency: z.string().default(DEFAULT_CURRENCY).optional(),
  creditLimit: z.number().int().min(0).nullable().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type CreateAccountDTO = z.infer<typeof createAccountSchema>;

export const updateAccountSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  currency: z.string().optional(),
  creditLimit: z.number().int().min(0).nullable().optional(),
  isActive: z.boolean().optional(),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export type UpdateAccountDTO = z.infer<typeof updateAccountSchema>;

export const accountFiltersSchema = z.object({
  class: z.enum(ACCOUNT_CLASSES).optional(),
  kind: z.enum(ACCOUNT_KINDS).optional(),
  isActive: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

export type AccountFilters = z.infer<typeof accountFiltersSchema>;

export const accountHistoryPointSchema = z.object({
  date: dateStringSchema,
  balance: moneyPaiseSchema,
  outstanding: moneyPaiseSchema,
  hasActivity: z.boolean(),
});

export type AccountHistoryPointDTO = z.infer<typeof accountHistoryPointSchema>;

// ============================================================================
// Recurring Deposit (RD) Schemas
// ============================================================================

export const rdCompoundingSchema = z.enum([
  'quarterly',
  'monthly',
  'half_yearly',
  'yearly',
  'simple',
]);
export type RDCompoundingDTO = z.infer<typeof rdCompoundingSchema>;

export const rdFirstInstallmentOnSchema = z.enum(['start_date', 'first_installment_day']);
export type RDFirstInstallmentOnDTO = z.infer<typeof rdFirstInstallmentOnSchema>;

export const rdInstallmentsModeSchema = z.enum([
  'schedule',
  'recorded',
  'assume_schedule',
  'recorded_transfers',
]);
export type RDInstallmentsModeDTO = z.infer<typeof rdInstallmentsModeSchema>;

export const rdDayHistoryItemSchema = z.object({
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
  day: z.union([z.number().int().min(1).max(31), z.literal('last')]),
});
export type RDDayHistoryItemDTO = z.infer<typeof rdDayHistoryItemSchema>;

export const rdLatePaymentItemSchema = z.object({
  dueDate: dateStringSchema,
  paidDate: dateStringSchema,
});
export type RDLatePaymentItemDTO = z.infer<typeof rdLatePaymentItemSchema>;

export const rdConfigSchema = z.object({
  monthlyInstallment: positiveMoneyPaiseSchema,
  startDate: dateStringSchema,
  installmentDay: z.union([z.number().int().min(1).max(31), z.literal('last')]),
  firstInstallmentOn: rdFirstInstallmentOnSchema.default('start_date').optional(),
  tenureMonths: z.number().int().positive('Tenure must be at least 1 month'),
  maturityDate: dateStringSchema.optional(),
  interestRate: z.number().min(0, 'Interest rate cannot be negative'),
  compounding: rdCompoundingSchema.default('quarterly').optional(),
  payFromAccountId: z.string().nullable().optional(),
  autoDebit: z.boolean().optional(),
  installmentsMode: rdInstallmentsModeSchema.default('schedule').optional(),
  installmentDayHistory: z.array(rdDayHistoryItemSchema).optional(),
  skippedInstallments: z.array(dateStringSchema).optional(),
  paidLateInstallments: z.array(rdLatePaymentItemSchema).optional(),
});
export type RDConfigDTO = z.infer<typeof rdConfigSchema>;

export const changeInstallmentDaySchema = z.object({
  newDay: z.union([z.number().int().min(1).max(31), z.literal('last')]),
  effectiveFrom: z.string().regex(/^\d{4}-\d{2}$/, 'Must be YYYY-MM format'),
});
export type ChangeInstallmentDayDTO = z.infer<typeof changeInstallmentDaySchema>;

export const markInstallmentSkippedSchema = z.object({
  dueDate: dateStringSchema,
  skipped: z.boolean().default(true),
});
export type MarkInstallmentSkippedDTO = z.infer<typeof markInstallmentSkippedSchema>;

export const markInstallmentLateSchema = z.object({
  dueDate: dateStringSchema,
  paidDate: dateStringSchema,
});
export type MarkInstallmentLateDTO = z.infer<typeof markInstallmentLateSchema>;

export const accountHistoryResponseSchema = z.object({
  accountId: z.string(),
  accountName: z.string(),
  kind: z.string(),
  class: z.string(),
  currency: z.string(),
  openingDate: z.string(),
  currentBalance: moneyPaiseSchema,
  currentOutstanding: moneyPaiseSchema,
  isMismatch: z.boolean(),
  history: z.array(accountHistoryPointSchema),
});

export type AccountHistoryResponseDTO = z.infer<typeof accountHistoryResponseSchema>;

// ============================================================================
// Categories
// ============================================================================

export const categorySchema = z.object({
  id: z.string(),
  userId: z.string().nullable(),
  name: z.string().min(1),
  type: z.enum(['expense', 'income']),
  parentId: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
  isSystem: z.boolean().default(false),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type CategoryDTO = z.infer<typeof categorySchema>;

export const createCategorySchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['expense', 'income']),
  parentId: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export type CreateCategoryDTO = z.infer<typeof createCategorySchema>;

export const updateCategorySchema = z.object({
  name: z.string().min(1).max(100).optional(),
  parentId: z.string().nullable().optional(),
  icon: z.string().nullable().optional(),
  color: z.string().nullable().optional(),
});

export type UpdateCategoryDTO = z.infer<typeof updateCategorySchema>;

export const categoryFiltersSchema = z.object({
  type: z.enum(['expense', 'income']).optional(),
});

export type CategoryFilters = z.infer<typeof categoryFiltersSchema>;

// ============================================================================
// Transactions
// ============================================================================

export const transactionSchema = z.object({
  id: z.string(),
  userId: z.string(),
  accountId: z.string(),
  toAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  date: dateStringSchema,
  type: z.enum(TRANSACTION_TYPES),
  amount: moneyPaiseSchema,
  signedAmount: moneyPaiseSchema,
  payee: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  tags: z.string().nullable().optional(),
  clientRequestId: z.string().nullable().optional(),
  importHash: z.string().nullable().optional(),
  isRecurring: z.boolean().default(false),
  recurringRuleId: z.string().nullable().optional(),
  deletedAt: z.string().or(z.date()).nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
  effect: moneyPaiseSchema.optional(),
  counterparty: z.string().nullable().optional(),
  runningBalance: moneyPaiseSchema.optional(),
  isOpening: z.boolean().optional(),
});

export type TransactionDTO = z.infer<typeof transactionSchema>;

export const createTransactionSchema = z
  .object({
    accountId: z.string().min(1, 'Account ID is required'),
    toAccountId: z.string().optional().nullable(),
    categoryId: z.string().optional().nullable(),
    date: dateStringSchema,
    type: z.enum(TRANSACTION_TYPES),
    amount: positiveMoneyPaiseSchema,
    payee: z.string().max(200).optional().nullable(),
    note: z.string().max(500).optional().nullable(),
    tags: z.string().optional().nullable(),
    clientRequestId: z.string().optional().nullable(),
    isRecurring: z.boolean().optional().default(false),
    recurringRuleId: z.string().optional().nullable(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return Boolean(data.toAccountId && data.toAccountId !== data.accountId);
      }
      return true;
    },
    {
      message: 'Transfer transactions require toAccountId distinct from accountId',
      path: ['toAccountId'],
    }
  );

export type CreateTransactionDTO = z.input<typeof createTransactionSchema>;

export const updateTransactionSchema = z
  .object({
    accountId: z.string().min(1).optional(),
    toAccountId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    date: dateStringSchema.optional(),
    type: z.enum(TRANSACTION_TYPES).optional(),
    amount: positiveMoneyPaiseSchema.optional(),
    payee: z.string().max(200).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    tags: z.string().nullable().optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer' && data.accountId && data.toAccountId) {
        return data.accountId !== data.toAccountId;
      }
      return true;
    },
    {
      message: 'Transfer transactions require toAccountId distinct from accountId',
      path: ['toAccountId'],
    }
  );

export type UpdateTransactionDTO = z.infer<typeof updateTransactionSchema>;

export const transactionFiltersSchema = z.object({
  accountId: z.string().optional(),
  categoryId: z.string().optional(),
  type: z.enum(TRANSACTION_TYPES).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  search: z.string().optional(),
  cursor: z.string().optional(),
  limit: z
    .union([z.string(), z.number()])
    .optional()
    .transform((val) => {
      if (val === undefined || val === null) return 50;
      const parsed = typeof val === 'string' ? parseInt(val, 10) : val;
      return isNaN(parsed) ? 50 : Math.min(Math.max(parsed, 1), 200);
    }),
});

export type TransactionFilters = z.input<typeof transactionFiltersSchema>;

export const transactionSummarySchema = z.object({
  count: z.number().int(),
  totalIn: z.number().int(),
  totalOut: z.number().int(),
  net: z.number().int(),
});

export type TransactionSummaryDTO = z.infer<typeof transactionSummarySchema>;

export const paginatedTransactionsResponseSchema = z.object({
  transactions: z.array(transactionSchema),
  nextCursor: z.string().nullable(),
  hasMore: z.boolean(),
  summary: transactionSummarySchema.optional(),
});

export type PaginatedTransactionsResponse = z.infer<
  typeof paginatedTransactionsResponseSchema
>;

// ============================================================================
// Valuations
// ============================================================================

export const valuationSchema = z.object({
  id: z.string(),
  accountId: z.string(),
  date: dateStringSchema,
  value: moneyPaiseSchema,
  costBasis: moneyPaiseSchema.nullable().optional(),
  note: z.string().nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type ValuationDTO = z.infer<typeof valuationSchema>;

export const createValuationSchema = z.object({
  accountId: z.string().min(1, 'Account ID is required'),
  date: dateStringSchema,
  value: moneyPaiseSchema,
  costBasis: moneyPaiseSchema.nullable().optional(),
  note: z.string().max(500).nullable().optional(),
});

export type CreateValuationDTO = z.infer<typeof createValuationSchema>;

export const valuationFiltersSchema = z.object({
  accountId: z.string().min(1),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
});

export type ValuationFilters = z.infer<typeof valuationFiltersSchema>;

// ============================================================================
// Budgets
// ============================================================================

export const budgetSchema = z.object({
  id: z.string(),
  userId: z.string(),
  categoryId: z.string(),
  amount: positiveMoneyPaiseSchema,
  period: z.enum(BUDGET_PERIODS),
  startDate: dateStringSchema,
  endDate: dateStringSchema.nullable().optional(),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type BudgetDTO = z.infer<typeof budgetSchema>;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const createBudgetSchema = z.object({
  categoryId: z.string().min(1, 'Category is required'),
  amount: positiveMoneyPaiseSchema,
  period: z.enum(BUDGET_PERIODS).default('monthly'),
  startDate: dateStringSchema,
  endDate: dateStringSchema.nullable().optional(),
});

export type CreateBudgetDTO = z.infer<typeof createBudgetSchema>;

export const updateBudgetSchema = z.object({
  amount: positiveMoneyPaiseSchema.optional(),
  period: z.enum(BUDGET_PERIODS).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.nullable().optional(),
});

export type UpdateBudgetDTO = z.infer<typeof updateBudgetSchema>;

export const budgetProgressSchema = z.object({
  budgetId: z.string(),
  categoryId: z.string(),
  categoryName: z.string(),
  categoryColor: z.string().nullable().optional(),
  period: z.enum(BUDGET_PERIODS),
  budgetedAmount: moneyPaiseSchema,
  spentAmount: moneyPaiseSchema,
  remainingAmount: moneyPaiseSchema,
  percentageUsed: z.number(),
});

export type BudgetProgressDTO = z.infer<typeof budgetProgressSchema>;

export const budgetFiltersSchema = z.object({
  period: z.enum(BUDGET_PERIODS).optional(),
  activeOnly: z
    .string()
    .transform((v) => v === 'true')
    .optional(),
});

export type BudgetFilters = z.infer<typeof budgetFiltersSchema>;

// ============================================================================
// Recurring Rules
// ============================================================================

export const recurringRuleSchema = z.object({
  id: z.string(),
  userId: z.string(),
  accountId: z.string(),
  toAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  type: z.enum(['expense', 'income', 'transfer']),
  amount: positiveMoneyPaiseSchema,
  payee: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  frequency: z.enum(RECURRING_FREQUENCIES),
  interval: z.number().int().min(1).default(1),
  startDate: dateStringSchema,
  endDate: dateStringSchema.nullable().optional(),
  nextOccurrence: dateStringSchema,
  isActive: z.boolean().default(true),
  createdAt: z.string().or(z.date()),
  updatedAt: z.string().or(z.date()),
});

export type RecurringRuleDTO = z.infer<typeof recurringRuleSchema>;

export const createRecurringRuleSchema = z
  .object({
    accountId: z.string().min(1),
    toAccountId: z.string().nullable().optional(),
    categoryId: z.string().nullable().optional(),
    type: z.enum(['expense', 'income', 'transfer']),
    amount: positiveMoneyPaiseSchema,
    payee: z.string().max(200).nullable().optional(),
    note: z.string().max(500).nullable().optional(),
    frequency: z.enum(RECURRING_FREQUENCIES),
    interval: z.number().int().min(1).default(1),
    startDate: dateStringSchema,
    endDate: dateStringSchema.nullable().optional(),
    nextOccurrence: dateStringSchema.optional(),
  })
  .refine(
    (data) => {
      if (data.type === 'transfer') {
        return Boolean(data.toAccountId && data.toAccountId !== data.accountId);
      }
      return true;
    },
    {
      message: 'Transfer recurring rule requires distinct toAccountId',
      path: ['toAccountId'],
    }
  );

export type CreateRecurringRuleDTO = z.infer<typeof createRecurringRuleSchema>;

export const updateRecurringRuleSchema = z.object({
  accountId: z.string().optional(),
  toAccountId: z.string().nullable().optional(),
  categoryId: z.string().nullable().optional(),
  amount: positiveMoneyPaiseSchema.optional(),
  payee: z.string().max(200).nullable().optional(),
  note: z.string().max(500).nullable().optional(),
  frequency: z.enum(RECURRING_FREQUENCIES).optional(),
  interval: z.number().int().min(1).optional(),
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.nullable().optional(),
  nextOccurrence: dateStringSchema.optional(),
  isActive: z.boolean().optional(),
});

export type UpdateRecurringRuleDTO = z.infer<typeof updateRecurringRuleSchema>;

// ============================================================================
// Statistics & Overview
// ============================================================================

export const overviewStatsSchema = z.object({
  netWorth: moneyPaiseSchema,
  totalAssets: moneyPaiseSchema,
  totalLiabilities: moneyPaiseSchema,
  monthlyIncome: moneyPaiseSchema,
  monthlyExpense: moneyPaiseSchema,
  savingsRate: z.number(),
  previousPeriod: z.object({
    income: moneyPaiseSchema,
    expense: moneyPaiseSchema,
    savingsRate: z.number(),
  }).optional(),
  spendByCategory: z.array(z.object({
    categoryId: z.string(),
    categoryName: z.string(),
    categoryColor: z.string().nullable().optional(),
    amount: moneyPaiseSchema,
    percentage: z.number(),
  })).optional(),
  accountsByKind: z.record(z.string(), z.object({
    count: z.number(),
    totalBalance: moneyPaiseSchema,
  })).optional(),
  recentTransactions: z.array(z.any()).optional(),
  cardsDueSoon: z.array(z.any()).optional(),
  activePeriod: z.object({
    from: z.string(),
    to: z.string(),
    preset: z.string().optional(),
    accounts: z.array(z.string()).optional(),
  }).optional(),
});

export type OverviewStatsDTO = z.infer<typeof overviewStatsSchema>;

export const overviewStatsQuerySchema = z.object({
  from: dateStringSchema.optional(),
  to: dateStringSchema.optional(),
  preset: z.enum(['this_month', 'last_month', 'last_3_months', 'this_year', 'custom']).optional(),
  accounts: z.string().optional(),
});

export type OverviewStatsQuery = z.infer<typeof overviewStatsQuerySchema>;

export const netWorthPointSchema = z.object({
  date: dateStringSchema,
  assets: moneyPaiseSchema,
  liabilities: moneyPaiseSchema,
  netWorth: moneyPaiseSchema,
});

export type NetWorthPointDTO = z.infer<typeof netWorthPointSchema>;

export const netWorthHistoryQuerySchema = z.object({
  startDate: dateStringSchema.optional(),
  endDate: dateStringSchema.optional(),
  interval: z.enum(['daily', 'monthly']).optional().default('daily'),
});

export type NetWorthHistoryQuery = z.infer<typeof netWorthHistoryQuerySchema>;

