export type DateFormat =
  | 'DD/MM/YYYY'
  | 'DD-MM-YYYY'
  | 'YYYY-MM-DD'
  | 'MM/DD/YYYY'
  | 'YYYY/MM/DD'
  | 'DD MMM YYYY'
  | 'DD-MMM-YYYY';

export type AmountMode = 'separate_debit_credit' | 'single_signed' | 'type_and_amount';

export interface ColumnMapping {
  dateColumn: string;
  descriptionColumn: string;
  amountMode: AmountMode;
  debitColumn?: string;
  creditColumn?: string;
  amountColumn?: string;
  typeColumn?: string; // Column specifying DR/CR or DEBIT/CREDIT
  balanceColumn?: string;
  cardExpenseSign?: 'positive' | 'negative'; // For credit cards, charges are usually positive numbers in statements
}

export interface NumberFormatConfig {
  decimalSeparator: '.' | ',';
  thousandsSeparator: ',' | '.' | ' ' | '';
}

export interface CategorizationRule {
  id: string;
  keyword: string;
  categoryId: string;
  categoryType?: 'expense' | 'income';
  caseSensitive?: boolean;
}

export interface RawRowWithIndex {
  rowIndex: number;
  data: Record<string, string>;
}

export interface ParsedImportRow {
  id: string;
  rowIndex: number;
  raw: Record<string, string>;
  date: string | null; // ISO YYYY-MM-DD
  rawDate: string;
  description: string;
  payee: string | null;
  type: 'expense' | 'income' | 'adjustment';
  amountPaise: number; // Positive integer paise
  signedAmountPaise: number; // Negative for expense, positive for income
  balancePaise: number | null;
  importHash: string;
  suggestedCategoryId: string | null;
  selectedCategoryId: string | null;
  categoryRuleMatched?: string | null;
  isDuplicate: boolean;
  duplicateReason?: 'existing_transaction' | 'file_duplicate';
  isValid: boolean;
  error?: string;
  included: boolean;
}

export interface ImportPreviewResult {
  headers: string[];
  totalRowsParsed: number;
  detectedMapping: ColumnMapping;
  detectedDateFormat: DateFormat;
  detectedNumberFormat: NumberFormatConfig;
  rows: ParsedImportRow[];
  summary: ImportSummary;
}

export interface ImportSummary {
  totalRows: number;
  validRows: number;
  errorRows: number;
  duplicateRows: number;
  includedRows: number;
  totalIncomePaise: number;
  totalExpensePaise: number;
}

export interface CommitImportPayload {
  accountId: string;
  rows: Array<{
    date: string;
    description: string;
    payee?: string | null;
    type: 'expense' | 'income' | 'adjustment';
    amountPaise: number;
    signedAmountPaise: number;
    categoryId?: string | null;
    importHash: string;
    note?: string | null;
  }>;
  newRules?: Array<{
    keyword: string;
    categoryId: string;
  }>;
}

export interface CommitImportResult {
  success: boolean;
  importedCount: number;
  duplicatesSkippedCount: number;
  errorCount: number;
  transactionIds: string[];
  targetAccountId: string;
  newAccountBalance?: number;
  error?: string;
}
