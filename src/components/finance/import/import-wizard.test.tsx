import { describe, it, expect, beforeEach } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { ImportWizard } from './import-wizard';
import { ColumnMappingStep } from './column-mapping-step';
import { TransactionReviewStep } from './transaction-review-step';
import { ImportSummaryContent } from './import-summary-dialog';
import { useFinanceStore } from '../shared/finance-store';
import type { AccountWithBalance } from '../shared/fixtures';
import type { CategoryDTO } from '@src/lib/finance/contract';
import type { ParsedImportRow } from '@src/lib/finance/import/types';

const TEST_CATEGORIES: CategoryDTO[] = [
  { id: 'cat-food', userId: null, name: 'Food & Dining', type: 'expense', parentId: null, icon: 'Utensils', color: '#f97316', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-groceries', userId: null, name: 'Groceries', type: 'expense', parentId: null, icon: 'ShoppingCart', color: '#10b981', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-transport', userId: null, name: 'Transport', type: 'expense', parentId: null, icon: 'Car', color: '#3b82f6', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-fuel', userId: null, name: 'Fuel', type: 'expense', parentId: null, icon: 'Fuel', color: '#ef4444', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
  { id: 'cat-salary', userId: null, name: 'Salary', type: 'income', parentId: null, icon: 'Briefcase', color: '#22c55e', isSystem: true, createdAt: '2026-01-01', updatedAt: '2026-01-01' },
];

const TEST_ACCOUNTS: AccountWithBalance[] = [
  {
    id: 'acc-hdfc-salary',
    userId: 'usr-1',
    name: 'HDFC Salary Account',
    kind: 'bank',
    class: 'asset',
    currency: 'INR',
    creditLimit: null,
    isActive: true,
    metadata: { accountNumber: '••••5892', branch: 'Indiranagar' },
    balance: 18542000,
    outstanding: 0,
    utilization: 0,
    currentValue: 18542000,
    createdAt: '2025-01-01',
    updatedAt: '2026-10-28',
  },
];

describe('Statement Import UI Components (S6c)', () => {
  beforeEach(() => {
    useFinanceStore.setState({
      accounts: TEST_ACCOUNTS,
      categories: TEST_CATEGORIES,
      lastUsedAccountId: 'acc-hdfc-salary',
    });
  });

  describe('1. ImportWizard (Step 1 Upload & Samples)', () => {
    it('renders account selector, drag-drop zone, and all 5 S4 sample statements', () => {
      const html = renderToString(<ImportWizard />);

      // Step progress indicator
      expect(html).toContain('Upload');
      expect(html).toContain('Mapping &amp; Formats');
      expect(html).toContain('Review &amp; Commit');

      // Destination account
      expect(html).toContain('Select Destination Account');
      expect(html).toContain('HDFC Salary');

      // Dropzone
      expect(html).toContain('Click to browse or drag and drop your bank / card CSV');

      // All 5 S4 sample statements present
      expect(html).toContain('HDFC Bank Savings Statement');
      expect(html).toContain('Axis Bank Statement (UTF-8 BOM)');
      expect(html).toContain('Credit Card Statement');
      expect(html).toContain('SBI Statement (Noisy, Duplicates, Malformed)');
      expect(html).toContain('ICICI Bank Statement');
    });
  });

  describe('2. ColumnMappingStep (Step 2)', () => {
    it('renders sample preview table and column mapping selectors', () => {
      const headers = ['Date', 'Narration', 'Withdrawal Amt.', 'Deposit Amt.', 'Closing Balance'];
      const sampleRows = [
        {
          Date: '01/10/2026',
          Narration: 'SALARY CREDIT OCT 2026',
          'Withdrawal Amt.': '',
          'Deposit Amt.': '1,25,000.00',
          'Closing Balance': '1,85,420.50',
        },
      ];

      const html = renderToString(
        <ColumnMappingStep
          headers={headers}
          sampleRows={sampleRows}
          mapping={{
            dateColumn: 'Date',
            descriptionColumn: 'Narration',
            amountMode: 'separate_debit_credit',
            debitColumn: 'Withdrawal Amt.',
            creditColumn: 'Deposit Amt.',
            balanceColumn: 'Closing Balance',
          }}
          dateFormat="DD/MM/YYYY"
          numberFormat={{ decimalSeparator: '.', thousandsSeparator: ',' }}
          isCreditCard={false}
          onMappingChange={() => {}}
          onDateFormatChange={() => {}}
          onNumberFormatChange={() => {}}
          onCreditCardChange={() => {}}
          onBack={() => {}}
          onProceed={() => {}}
        />
      );

      // Section title & buttons
      expect(html).toContain('Step 2: Map Columns &amp; Formats');
      expect(html).toContain('Review Transactions');

      // Sample preview
      expect(html).toContain('Raw CSV Sample Preview');
      expect(html).toContain('SALARY CREDIT OCT 2026');
      expect(html).toContain('1,25,000.00');

      // Selectors
      expect(html).toContain('Date Column *');
      expect(html).toContain('Description / Narration *');
      expect(html).toContain('Amount Layout *');
      expect(html).toContain('Debit / Withdrawal Column');
      expect(html).toContain('Credit / Deposit Column');
      expect(html).toContain('Closing Balance Column (Optional)');

      // Formats
      expect(html).toContain('DD/MM/YYYY');
      expect(html).toContain('Dot Decimal (1,25,000.00 / 125,000.00)');
      expect(html).toContain('Credit Card Statement');
    });
  });

  describe('3. TransactionReviewStep (Step 3)', () => {
    it('renders summary KPIs, duplicate warnings, inline category edit, and commit button', () => {
      const mockRows: ParsedImportRow[] = [
        {
          id: 'row-1',
          rowIndex: 1,
          raw: {},
          date: '2026-10-01',
          rawDate: '01/10/2026',
          description: 'SALARY CREDIT OCT 2026',
          payee: 'TechCorp Salary',
          type: 'income',
          amountPaise: 12500000,
          signedAmountPaise: 12500000,
          balancePaise: 18542050,
          importHash: 'hsh_1',
          suggestedCategoryId: 'cat-salary',
          selectedCategoryId: 'cat-salary',
          categoryRuleMatched: 'salary',
          isDuplicate: false,
          isValid: true,
          included: true,
        },
        {
          id: 'row-2',
          rowIndex: 2,
          raw: {},
          date: '2026-10-02',
          rawDate: '02/10/2026',
          description: 'POS CHAI POINT BANGALORE',
          payee: 'Chai Point',
          type: 'expense',
          amountPaise: 25000,
          signedAmountPaise: -25000,
          balancePaise: 18517050,
          importHash: 'hsh_2',
          suggestedCategoryId: 'cat-food',
          selectedCategoryId: 'cat-food',
          categoryRuleMatched: 'chai point',
          isDuplicate: true,
          duplicateReason: 'file_duplicate',
          isValid: true,
          included: false, // Duplicates unchecked by default
        },
        {
          id: 'row-3',
          rowIndex: 3,
          raw: {},
          date: null,
          rawDate: '05/10/2026',
          description: 'INVALID_CORRUPTED_LINE',
          payee: null,
          type: 'expense',
          amountPaise: 0,
          signedAmountPaise: 0,
          balancePaise: null,
          importHash: 'hsh_3',
          suggestedCategoryId: null,
          selectedCategoryId: null,
          isDuplicate: false,
          isValid: false,
          error: 'Missing or invalid debit/credit amount',
          included: false,
        },
      ];

      const html = renderToString(
        <TransactionReviewStep
          rows={mockRows}
          categories={useFinanceStore.getState().categories}
          accountName="HDFC Salary Account"
          isSubmitting={false}
          onRowsChange={() => {}}
          onBack={() => {}}
          onCommit={() => {}}
          onAddRule={() => {}}
        />
      );

      // Section title & Commit button
      expect(html).toContain('Step 3: Review &amp; Categorize');
      expect(html).toContain('Import 1 Transactions');

      // KPI cards
      expect(html).toContain('Total In File');
      expect(html).toContain('Ready');
      expect(html).toContain('Duplicates');
      expect(html).toContain('Errors');

      // Filter chips
      expect(html).toContain('All');
      expect(html).toContain('Ready to Import');
      expect(html).toContain('Duplicates');
      expect(html).toContain('Errors');

      // Table contents
      expect(html).toContain('SALARY CREDIT OCT 2026');
      expect(html).toContain('POS CHAI POINT BANGALORE');
      expect(html).toContain('INVALID_CORRUPTED_LINE');

      // Badges
      expect(html).toContain('Matched:');
      expect(html).toContain('salary');
      expect(html).toContain('Duplicate (File)');
      expect(html).toContain('Missing or invalid');
    });
  });

  describe('4. ImportSummaryDialog (Step 4 Completion)', () => {
    it('renders imported count, skipped count, and navigation actions', () => {
      const html = renderToString(
        <ImportSummaryContent
          result={{
            success: true,
            importedCount: 6,
            duplicatesSkippedCount: 1,
            errorCount: 1,
            transactionIds: ['tx-1', 'tx-2'],
            targetAccountId: 'acc-hdfc-salary',
          }}
          accountName="HDFC Salary Account"
          onReset={() => {}}
        />
      );

      expect(html).toContain('Statement Import Complete');
      expect(html).toContain('6'); // imported
      expect(html).toContain('1'); // skipped dups
      expect(html).toContain('View Transactions');
      expect(html).toContain('Import Another Statement');
    });
  });
});
