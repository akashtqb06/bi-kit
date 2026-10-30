import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect, vi } from 'vitest';
import {
  parseAndProcessStatement,
  getCsvQuickPreview,
  stripBom,
} from './parser';
import { detectDateFormat, parseDateToISO } from './date-detector';
import { detectNumberFormat, parseMoneyToPaise } from './number-parser';
import { generateImportHash } from './hash';
import {
  buildDefaultRules,
  learnRulesFromTransactions,
  suggestCategory,
} from './categorizer';
import { SAMPLE_FIXTURES } from '@src/lib/finance/testdata/import-sample-fixtures';
import { commitImportTransactions } from './commit';
import { setupFinanceTestDb, USER_A, USER_B } from '../__tests__/db/test-helper';
import { db, finAccounts, finTransactions } from '@src/lib/db';
import { eq } from 'drizzle-orm';
import type { CategoryDTO } from '../contract';

const CSV_DIR = path.resolve(process.cwd(), 'fixtures/finance/csv');

const MOCK_CATEGORIES: CategoryDTO[] = [
  { id: 'cat-food', userId: null, name: 'Food & Dining', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-groceries', userId: null, name: 'Groceries', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-rent', userId: null, name: 'Rent', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-fuel', userId: null, name: 'Fuel', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-utilities', userId: null, name: 'Utilities', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-shopping', userId: null, name: 'Shopping', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-subscriptions', userId: null, name: 'Subscriptions', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-travel', userId: null, name: 'Travel', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-transport', userId: null, name: 'Transport', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-loans', userId: null, name: 'EMI & Loans', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-education', userId: null, name: 'Education', type: 'expense', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-salary', userId: null, name: 'Salary', type: 'income', isSystem: true, createdAt: '', updatedAt: '' },
  { id: 'cat-refunds', userId: null, name: 'Refunds', type: 'income', isSystem: true, createdAt: '', updatedAt: '' },
];

describe('Statement Import Engine (S6c)', () => {
  const defaultRules = buildDefaultRules(MOCK_CATEGORIES);

  describe('1. Fixture Tests: HDFC Statement', () => {
    const rawCsv = fs.readFileSync(path.join(CSV_DIR, 'hdfc_statement.csv'), 'utf8');

    it('detects HDFC columns, DD/MM/YYYY dates, and parses Indian comma numbers', () => {
      const result = parseAndProcessStatement(rawCsv, {
        rules: defaultRules,
      });

      expect(result.totalRowsParsed).toBe(7);
      expect(result.summary.validRows).toBe(7);
      expect(result.summary.errorRows).toBe(0);
      expect(result.detectedDateFormat).toBe('DD/MM/YYYY');
      expect(result.detectedMapping.amountMode).toBe('separate_debit_credit');
      expect(result.detectedMapping.debitColumn).toBe('Withdrawal Amt.');
      expect(result.detectedMapping.creditColumn).toBe('Deposit Amt.');

      // Check Row 1: Salary Credit "1,25,000.00" -> 12,500,000 paise income
      const salaryRow = result.rows[0];
      expect(salaryRow.date).toBe('2026-10-01');
      expect(salaryRow.type).toBe('income');
      expect(salaryRow.amountPaise).toBe(12500000);
      expect(salaryRow.signedAmountPaise).toBe(12500000);
      expect(salaryRow.balancePaise).toBe(18542050);
      expect(salaryRow.suggestedCategoryId).toBe('cat-salary');

      // Check Row 2: Rent "32,000.00" -> 3,200,000 paise expense
      const rentRow = result.rows[1];
      expect(rentRow.date).toBe('2026-10-02');
      expect(rentRow.type).toBe('expense');
      expect(rentRow.amountPaise).toBe(3200000);
      expect(rentRow.signedAmountPaise).toBe(-3200000);
      expect(rentRow.suggestedCategoryId).toBe('cat-rent');

      // Check Row 5: Swiggy "845.00" -> 84,500 paise expense
      const swiggyRow = result.rows[4];
      expect(swiggyRow.date).toBe('2026-10-12');
      expect(swiggyRow.type).toBe('expense');
      expect(swiggyRow.amountPaise).toBe(84500);
      expect(swiggyRow.suggestedCategoryId).toBe('cat-food');

      // Check Row 6: Refund "2,499.00" -> 249,900 paise income
      const refundRow = result.rows[5];
      expect(refundRow.type).toBe('income');
      expect(refundRow.amountPaise).toBe(249900);
      expect(refundRow.suggestedCategoryId).toBe('cat-refunds');
    });
  });

  describe('2. Fixture Tests: Axis Bank Statement (UTF-8 BOM)', () => {
    const rawBuffer = fs.readFileSync(path.join(CSV_DIR, 'axis_utf8_bom_statement.csv'));
    const rawCsv = rawBuffer.toString('utf8');

    it('strips UTF-8 BOM cleanly and parses Type (CR/DR) column correctly', () => {
      expect(rawCsv.charCodeAt(0)).toBe(0xfeff); // Verifies raw contains BOM
      const clean = stripBom(rawCsv);
      expect(clean.charCodeAt(0)).not.toBe(0xfeff);

      const result = parseAndProcessStatement(rawCsv, {
        rules: defaultRules,
      });

      expect(result.totalRowsParsed).toBe(5);
      expect(result.summary.validRows).toBe(5);
      expect(result.detectedMapping.amountMode).toBe('type_and_amount');
      expect(result.detectedMapping.typeColumn).toBe('Type');

      // Row 1: Advance Payout, CR 250,000.00
      const payoutRow = result.rows[0];
      expect(payoutRow.type).toBe('income');
      expect(payoutRow.amountPaise).toBe(25000000);
      expect(payoutRow.signedAmountPaise).toBe(25000000);
      expect(payoutRow.suggestedCategoryId).toBe('cat-salary');

      // Row 2: WeWork Coworking, DR 18,500.00
      const weworkRow = result.rows[1];
      expect(weworkRow.type).toBe('expense');
      expect(weworkRow.amountPaise).toBe(1850000);
      expect(weworkRow.signedAmountPaise).toBe(-1850000);
      expect(weworkRow.suggestedCategoryId).toBe('cat-rent');

      // Row 5: Flight Ticket Indigo, DR 9,850.00
      const flightRow = result.rows[4];
      expect(flightRow.type).toBe('expense');
      expect(flightRow.amountPaise).toBe(985000);
      expect(flightRow.suggestedCategoryId).toBe('cat-travel');
    });
  });

  describe('3. Fixture Tests: Credit Card Statement', () => {
    const rawCsv = fs.readFileSync(path.join(CSV_DIR, 'credit_card_statement.csv'), 'utf8');

    it('parses credit card purchases as expenses and negative payments as income/credits', () => {
      const result = parseAndProcessStatement(rawCsv, {
        isCreditCard: true,
        rules: defaultRules,
      });

      expect(result.totalRowsParsed).toBe(6);
      expect(result.summary.validRows).toBe(6);
      expect(result.detectedDateFormat).toBe('DD-MM-YYYY');

      // Purchase: Amazon 4500.00 -> Expense
      const amazonRow = result.rows[0];
      expect(amazonRow.date).toBe('2026-10-11');
      expect(amazonRow.type).toBe('expense');
      expect(amazonRow.amountPaise).toBe(450000);
      expect(amazonRow.signedAmountPaise).toBe(-450000);
      expect(amazonRow.suggestedCategoryId).toBe('cat-shopping');

      // Purchase: Fuel Station Shell 3200.00 -> Expense
      const shellRow = result.rows[2];
      expect(shellRow.type).toBe('expense');
      expect(shellRow.amountPaise).toBe(320000);
      expect(shellRow.suggestedCategoryId).toBe('cat-fuel');

      // Payment: Autopay Payment Received -8839.00 -> Income/Payment credit
      const paymentRow = result.rows[4];
      expect(paymentRow.type).toBe('income');
      expect(paymentRow.amountPaise).toBe(883900);
      expect(paymentRow.signedAmountPaise).toBe(883900);
    });
  });

  describe('4. Fixture Tests: SBI Statement (Noisy, Duplicates & Malformed)', () => {
    const rawCsv = fs.readFileSync(path.join(CSV_DIR, 'sbi_noisy_statement.csv'), 'utf8');

    it('flags intra-file duplicate rows and corrupt/malformed records with error reasons', () => {
      const result = parseAndProcessStatement(rawCsv, {
        rules: defaultRules,
      });

      expect(result.totalRowsParsed).toBe(7);
      expect(result.summary.validRows).toBe(6);
      expect(result.summary.errorRows).toBe(1);
      expect(result.summary.duplicateRows).toBe(1);

      // Row 2 and 3: Chai Point 250.00 duplicate
      const chaiPointRow1 = result.rows[1];
      const chaiPointRow2 = result.rows[2];
      expect(chaiPointRow1.isValid).toBe(true);
      expect(chaiPointRow1.isDuplicate).toBe(false);
      expect(chaiPointRow1.included).toBe(true);

      expect(chaiPointRow2.isValid).toBe(true);
      expect(chaiPointRow2.isDuplicate).toBe(true);
      expect(chaiPointRow2.duplicateReason).toBe('file_duplicate');
      expect(chaiPointRow2.included).toBe(false); // Duplicates excluded by default!

      // Row 4: Malformed record "INVALID_MALFORMED_LINE_CORRUPTED_RECORD,,N/A,"
      const corruptedRow = result.rows[3];
      expect(corruptedRow.isValid).toBe(false);
      expect(corruptedRow.error).toContain('Missing or invalid debit/credit amount');
      expect(corruptedRow.included).toBe(false);

      // Row 5: Loan EMI
      const loanRow = result.rows[4];
      expect(loanRow.suggestedCategoryId).toBe('cat-loans');

      // Row 6: School Tuition
      const schoolRow = result.rows[5];
      expect(schoolRow.suggestedCategoryId).toBe('cat-education');
    });
  });

  describe('5. Fixture Tests: ICICI Statement', () => {
    const rawCsv = fs.readFileSync(path.join(CSV_DIR, 'icici_statement.csv'), 'utf8');

    it('detects ISO YYYY-MM-DD dates and signed amounts (positive deposit, negative withdrawal)', () => {
      const result = parseAndProcessStatement(rawCsv, {
        rules: defaultRules,
      });

      expect(result.totalRowsParsed).toBe(6);
      expect(result.summary.validRows).toBe(6);
      expect(result.detectedDateFormat).toBe('YYYY-MM-DD');
      expect(result.detectedMapping.amountMode).toBe('single_signed');

      // Row 1: Retainer wire +180000.00 -> Income
      const retainerRow = result.rows[0];
      expect(retainerRow.date).toBe('2026-10-01');
      expect(retainerRow.type).toBe('income');
      expect(retainerRow.amountPaise).toBe(18000000);
      expect(retainerRow.signedAmountPaise).toBe(18000000);

      // Row 2: ATM Cash Withdrawal -25000.00 -> Expense
      const atmRow = result.rows[1];
      expect(atmRow.date).toBe('2026-10-03');
      expect(atmRow.type).toBe('expense');
      expect(atmRow.amountPaise).toBe(2500000);
      expect(atmRow.signedAmountPaise).toBe(-2500000);

      // Row 4: Flipkart Electronics -35000.00 -> Expense
      const flipkartRow = result.rows[3];
      expect(flipkartRow.type).toBe('expense');
      expect(flipkartRow.suggestedCategoryId).toBe('cat-shopping');
    });
  });

  describe('6. Date & Number Parsers', () => {
    it('detects and parses various date formats', () => {
      expect(detectDateFormat(['01/10/2026', '15/10/2026'])).toBe('DD/MM/YYYY');
      expect(detectDateFormat(['2026-10-01', '2026-10-15'])).toBe('YYYY-MM-DD');
      expect(detectDateFormat(['01-10-2026', '25-10-2026'])).toBe('DD-MM-YYYY');

      expect(parseDateToISO('15/10/2026', 'DD/MM/YYYY')).toBe('2026-10-15');
      expect(parseDateToISO('15-10-2026', 'DD-MM-YYYY')).toBe('2026-10-15');
      expect(parseDateToISO('2026-10-15', 'YYYY-MM-DD')).toBe('2026-10-15');

      // Invalid dates
      expect(parseDateToISO('32/10/2026', 'DD/MM/YYYY')).toBeNull();
      expect(parseDateToISO('2026-02-30', 'YYYY-MM-DD')).toBeNull();
      expect(parseDateToISO('invalid', 'YYYY-MM-DD')).toBeNull();
    });

    it('detects number formats and accurately parses currency amounts to paise', () => {
      expect(detectNumberFormat(['1,25,000.00', '32,000.00']).decimalSeparator).toBe('.');
      expect(detectNumberFormat(['125.000,00', '32.000,00']).decimalSeparator).toBe(',');

      // Indian lakhs/crores formatting
      const p1 = parseMoneyToPaise('"1,25,000.00"');
      expect(p1?.paise).toBe(12500000);
      expect(p1?.isNegative).toBe(false);

      // Negative signs, parentheses, and currency indicators
      expect(parseMoneyToPaise('-8839.00')?.isNegative).toBe(true);
      expect(parseMoneyToPaise('(500.50)')?.isNegative).toBe(true);
      expect(parseMoneyToPaise('₹ 1,500.00')?.paise).toBe(150000);
      expect(parseMoneyToPaise('1200.00 DR')?.isNegative).toBe(true);

      // Corrupted values
      expect(parseMoneyToPaise('N/A')).toBeNull();
      expect(parseMoneyToPaise('')).toBeNull();
      expect(parseMoneyToPaise('---')).toBeNull();
    });
  });

  describe('7. Import Hash & Duplicate Detection', () => {
    it('generates consistent, normalized import hashes and detects existing duplicates', () => {
      const h1 = generateImportHash('2026-10-01', 250000, 'CHAI POINT BANGALORE IN');
      const h2 = generateImportHash('2026-10-01', 250000, ' chai  point   bangalore in ');
      expect(h1).toBe(h2);

      const h3 = generateImportHash('2026-10-02', 250000, 'CHAI POINT BANGALORE IN');
      expect(h1).not.toBe(h3);

      const existingHashes = new Set([h1]);
      const csv = `Date,Description,Amount\n2026-10-01,Chai Point Bangalore In,2500.00\n2026-10-05,Coffee Day,300.00`;
      const res = parseAndProcessStatement(csv, { existingHashes });

      expect(res.rows[0].isDuplicate).toBe(true);
      expect(res.rows[0].duplicateReason).toBe('existing_transaction');
      expect(res.rows[0].included).toBe(false);

      expect(res.rows[1].isDuplicate).toBe(false);
      expect(res.rows[1].included).toBe(true);
    });
  });

  describe('8. Rule Learning & Categorization', () => {
    it('learns payee-to-category rules from existing transactions and prioritizes specific rules', () => {
      const pastTransactions = [
        { payee: 'Fresh To Home Seafood', categoryId: 'cat-groceries' },
        { payee: 'Fresh To Home Seafood', categoryId: 'cat-groceries' },
        { payee: 'Doctor Consultation Apollo', categoryId: 'cat-health' },
      ];

      const learned = learnRulesFromTransactions(pastTransactions);
      expect(learned.some((r) => r.keyword === 'fresh to home seafood' && r.categoryId === 'cat-groceries')).toBe(true);

      const suggestion = suggestCategory('Payment to Fresh To Home Seafood online', learned);
      expect(suggestion?.categoryId).toBe('cat-groceries');
      expect(suggestion?.matchedKeyword).toBe('fresh to home seafood');
    });
  });

  describe('9. Large File Chunked Parsing', () => {
    it('parses 1,500 rows in chunks with progress reporting without dropping records', () => {
      let csv = 'Date,Description,Amount\n';
      for (let i = 1; i <= 1500; i++) {
        csv += `2026-10-01,Merchant Transaction #${i},${(i * 10).toFixed(2)}\n`;
      }

      const progressSpy = vi.fn();
      const res = parseAndProcessStatement(csv, {
        chunkSize: 300,
        onProgress: progressSpy,
      });

      expect(res.totalRowsParsed).toBe(1500);
      expect(res.summary.validRows).toBe(1500);
      expect(progressSpy).toHaveBeenCalled();
    });
  });

  describe('10. Embedded Sample Fixtures Sanity', () => {
    it('validates all 5 built-in sample fixtures parse reliably', () => {
      expect(SAMPLE_FIXTURES.length).toBe(5);
      for (const sample of SAMPLE_FIXTURES) {
        const preview = getCsvQuickPreview(sample.content, 5);
        expect(preview.headers.length).toBeGreaterThanOrEqual(3);
        const full = parseAndProcessStatement(sample.content, {
          isCreditCard: sample.accountKind === 'credit_card',
          rules: defaultRules,
        });
        expect(full.totalRowsParsed).toBeGreaterThanOrEqual(5);
      }
    });
  });

  describe('11. Database Atomic Commit & Deduplication', () => {
    it('commits rows atomically in one transaction and skips duplicates on re-import', async () => {
      await setupFinanceTestDb();

      // Create test account for USER_A
      const [acc] = await db
        .insert(finAccounts)
        .values({
          id: 'acc-test-import-1',
          userId: USER_A,
          name: 'HDFC Test Savings',
          kind: 'bank',
          class: 'asset',
          currency: 'INR',
        })
        .returning();

      expect(acc).toBeDefined();

      const hash1 = generateImportHash('2026-10-01', 12500000, 'SALARY CREDIT OCT 2026');
      const hash2 = generateImportHash('2026-10-02', 3200000, 'UPI HOUSE RENT');

      const commitResult = await commitImportTransactions(USER_A, {
        accountId: acc.id,
        rows: [
          {
            date: '2026-10-01',
            description: 'SALARY CREDIT OCT 2026',
            payee: 'TechCorp Salary',
            type: 'income',
            amountPaise: 12500000,
            signedAmountPaise: 12500000,
            importHash: hash1,
            categoryId: 'cat-salary',
          },
          {
            date: '2026-10-02',
            description: 'UPI HOUSE RENT',
            payee: 'Landlord Rent',
            type: 'expense',
            amountPaise: 3200000,
            signedAmountPaise: -3200000,
            importHash: hash2,
            categoryId: 'cat-rent',
          },
        ],
        newRules: [
          { keyword: 'techcorp', categoryId: 'cat-salary' },
        ],
      });

      expect(commitResult.success).toBe(true);
      expect(commitResult.importedCount).toBe(2);
      expect(commitResult.duplicatesSkippedCount).toBe(0);
      expect(commitResult.transactionIds.length).toBe(2);

      // Verify records inserted in DB
      const inserted = await db
        .select()
        .from(finTransactions)
        .where(eq(finTransactions.accountId, acc.id));
      expect(inserted.length).toBe(2);

      // Re-importing identical batch should detect duplicate hashes and skip them
      const secondCommit = await commitImportTransactions(USER_A, {
        accountId: acc.id,
        rows: [
          {
            date: '2026-10-01',
            description: 'SALARY CREDIT OCT 2026',
            type: 'income',
            amountPaise: 12500000,
            signedAmountPaise: 12500000,
            importHash: hash1,
          },
          {
            date: '2026-10-02',
            description: 'UPI HOUSE RENT',
            type: 'expense',
            amountPaise: 3200000,
            signedAmountPaise: -3200000,
            importHash: hash2,
          },
        ],
      });

      expect(secondCommit.success).toBe(true);
      expect(secondCommit.importedCount).toBe(0);
      expect(secondCommit.duplicatesSkippedCount).toBe(2);

      // User B attempting to import to User A's account should be rejected
      const unauthorized = await commitImportTransactions(USER_B, {
        accountId: acc.id,
        rows: [
          {
            date: '2026-10-05',
            description: 'Intruder txn',
            type: 'expense',
            amountPaise: 50000,
            signedAmountPaise: -50000,
            importHash: 'hsh-intruder',
          },
        ],
      });

      expect(unauthorized.success).toBe(false);
      expect(unauthorized.error).toContain('Target account not found or access denied');
    });
  });
});
