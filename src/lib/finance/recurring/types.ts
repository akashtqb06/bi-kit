import type { RecurringFrequency, TransactionType } from '../constants';
import type { TransactionDTO } from '../contract';

export interface OccurrenceProjection {
  id: string; // unique occurrence key: `${ruleId}_${date}`
  ruleId: string;
  ruleName: string;
  date: string; // YYYY-MM-DD
  daysUntil: number;
  type: 'expense' | 'income' | 'transfer';
  amount: number; // paise
  payee?: string | null;
  note?: string | null;
  accountId: string;
  accountName?: string;
  toAccountId?: string | null;
  toAccountName?: string;
  categoryId?: string | null;
  categoryName?: string;
  frequency: RecurringFrequency;
  interval: number;
  isActive: boolean;
}

export interface RuleGenerationDetail {
  ruleId: string;
  rulePayee?: string | null;
  previousNextOccurrence: string;
  newNextOccurrence: string;
  occurrencesGenerated: string[];
  isExpired: boolean;
}

export interface GenerationResult {
  processed: number;
  generated: number;
  backfilled: number;
  skipped: number;
  transactions: TransactionDTO[];
  rulesProcessed: RuleGenerationDetail[];
}

export interface RecurringPreset {
  id: 'rent' | 'sip' | 'emi' | 'subscription' | 'custom';
  label: string;
  description: string;
  type: TransactionType;
  defaultCategoryName: string;
  defaultPayee: string;
  defaultFrequency: RecurringFrequency;
  defaultDayOfMonth: number;
  defaultInterval: number;
  defaultNote: string;
}
