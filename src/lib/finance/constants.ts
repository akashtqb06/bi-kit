export const ACCOUNT_KINDS = [
  'cash',
  'bank',
  'credit_card',
  'fixed_deposit',
  'recurring_deposit',
  'mutual_fund',
  'stocks',
  'loan',
  'other_asset',
  'other_liability',
] as const;

export type AccountKind = (typeof ACCOUNT_KINDS)[number];

export const ACCOUNT_CLASSES = ['asset', 'liability'] as const;
export type AccountClass = (typeof ACCOUNT_CLASSES)[number];

export const ACCOUNT_KIND_CLASS_MAP: Record<AccountKind, AccountClass> = {
  cash: 'asset',
  bank: 'asset',
  credit_card: 'liability',
  fixed_deposit: 'asset',
  recurring_deposit: 'asset',
  mutual_fund: 'asset',
  stocks: 'asset',
  loan: 'liability',
  other_asset: 'asset',
  other_liability: 'liability',
};

export const TRANSACTION_TYPES = ['expense', 'income', 'transfer', 'adjustment'] as const;
export type TransactionType = (typeof TRANSACTION_TYPES)[number];

export const DEFAULT_CURRENCY = 'INR';

export const COMPOUNDING_FREQUENCIES = [
  'monthly',
  'quarterly',
  'half_yearly',
  'yearly',
  'simple',
] as const;
export type CompoundingFrequency = (typeof COMPOUNDING_FREQUENCIES)[number];

export const RECURRING_FREQUENCIES = [
  'daily',
  'weekly',
  'monthly',
  'quarterly',
  'yearly',
] as const;
export type RecurringFrequency = (typeof RECURRING_FREQUENCIES)[number];

export const BUDGET_PERIODS = ['monthly', 'quarterly', 'yearly'] as const;
export type BudgetPeriod = (typeof BUDGET_PERIODS)[number];

export const DEFAULT_EXPENSE_CATEGORIES = [
  'Food & Dining',
  'Groceries',
  'Transport',
  'Fuel',
  'Rent',
  'Utilities',
  'Shopping',
  'Health',
  'Entertainment',
  'Travel',
  'EMI & Loans',
  'Education',
  'Insurance',
  'Subscriptions',
  'Fees & Interest',
  'Others',
] as const;

export const DEFAULT_INCOME_CATEGORIES = [
  'Salary',
  'Interest',
  'Dividends',
  'Refunds',
  'Other income',
] as const;

