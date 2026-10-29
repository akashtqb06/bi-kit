import Papa from 'papaparse';
import { nanoid } from 'nanoid';
import { detectDateFormat, parseDateToISO } from './date-detector';
import { detectNumberFormat, parseMoneyToPaise } from './number-parser';
import { detectColumnMapping } from './column-detector';
import { generateImportHash } from './hash';
import { suggestCategory } from './categorizer';
import type {
  CategorizationRule,
  ColumnMapping,
  DateFormat,
  ImportPreviewResult,
  ImportSummary,
  NumberFormatConfig,
  ParsedImportRow,
} from './types';

export interface ParseCsvOptions {
  mapping?: Partial<ColumnMapping>;
  dateFormat?: DateFormat;
  numberFormat?: NumberFormatConfig;
  rules?: CategorizationRule[];
  existingHashes?: Set<string>;
  isCreditCard?: boolean;
  chunkSize?: number;
  onProgress?: (progress: { processedRows: number; totalRows?: number }) => void;
}

/**
 * Strips UTF-8 BOM if present at the start of raw CSV string.
 */
export function stripBom(text: string): string {
  if (text.charCodeAt(0) === 0xfeff) {
    return text.slice(1);
  }
  return text;
}

/**
 * Extracts preview headers and first N rows without parsing the whole file.
 */
export function getCsvQuickPreview(
  csvContent: string,
  previewRowsCount = 10
): { headers: string[]; previewRows: Record<string, string>[] } {
  const clean = stripBom(csvContent);
  const parsed = Papa.parse<Record<string, string>>(clean, {
    header: true,
    preview: previewRowsCount,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = parsed.meta.fields?.map((f) => f.trim()).filter(Boolean) || [];
  return {
    headers,
    previewRows: parsed.data || [],
  };
}

/**
 * Parses and processes statement CSV data with automatic column, date, and decimal detection,
 * rule-based categorization, chunk processing, and intra-file + existing row deduplication.
 */
export function parseAndProcessStatement(
  csvContent: string,
  options: ParseCsvOptions = {}
): ImportPreviewResult {
  const clean = stripBom(csvContent);

  // Parse CSV records
  const parseResult = Papa.parse<Record<string, string>>(clean, {
    header: true,
    skipEmptyLines: 'greedy',
    transformHeader: (h) => h.trim(),
  });

  const headers = parseResult.meta.fields?.map((f) => f.trim()).filter(Boolean) || [];
  const rawRows = parseResult.data || [];

  // Detect mapping, date format, and number format from sample rows
  const detectedMapping = {
    ...detectColumnMapping(headers, rawRows.slice(0, 50)),
    ...(options.mapping || {}),
  };

  const sampleDates = rawRows
    .slice(0, 50)
    .map((r) => r[detectedMapping.dateColumn])
    .filter(Boolean);
  const detectedDateFormat = options.dateFormat || detectDateFormat(sampleDates);

  const sampleAmounts: string[] = [];
  for (const r of rawRows.slice(0, 50)) {
    if (detectedMapping.amountColumn && r[detectedMapping.amountColumn]) {
      sampleAmounts.push(r[detectedMapping.amountColumn]);
    }
    if (detectedMapping.debitColumn && r[detectedMapping.debitColumn]) {
      sampleAmounts.push(r[detectedMapping.debitColumn]);
    }
    if (detectedMapping.creditColumn && r[detectedMapping.creditColumn]) {
      sampleAmounts.push(r[detectedMapping.creditColumn]);
    }
  }
  const detectedNumberFormat = options.numberFormat || detectNumberFormat(sampleAmounts);

  const rules = options.rules || [];
  const existingHashes = options.existingHashes || new Set<string>();
  const seenFileHashes = new Set<string>();

  const rows: ParsedImportRow[] = [];
  let validRows = 0;
  let errorRows = 0;
  let duplicateRows = 0;
  let includedRows = 0;
  let totalIncomePaise = 0;
  let totalExpensePaise = 0;

  const total = rawRows.length;
  const chunkSize = options.chunkSize || 500;

  // Process rows in chunks
  for (let i = 0; i < total; i++) {
    const raw = rawRows[i];
    const rowIndex = i + 1;

    // Report progress periodically for large files
    if (options.onProgress && (i % chunkSize === 0 || i === total - 1)) {
      options.onProgress({ processedRows: i + 1, totalRows: total });
    }

    const rawDate = (raw[detectedMapping.dateColumn] || '').trim();
    const rawDesc = (raw[detectedMapping.descriptionColumn] || '').trim();
    const balanceRaw = detectedMapping.balanceColumn ? raw[detectedMapping.balanceColumn] : undefined;

    let parsedBalance: number | null = null;
    if (balanceRaw) {
      const bRes = parseMoneyToPaise(balanceRaw, detectedNumberFormat);
      if (bRes) {
        parsedBalance = bRes.isNegative ? -bRes.paise : bRes.paise;
      }
    }

    // Determine type and amounts
    let type: 'expense' | 'income' | 'adjustment' = 'expense';
    let amountPaise = 0;
    let signedAmountPaise = 0;
    let rowError: string | undefined;

    if (detectedMapping.amountMode === 'separate_debit_credit') {
      const debitRaw = detectedMapping.debitColumn ? raw[detectedMapping.debitColumn] : '';
      const creditRaw = detectedMapping.creditColumn ? raw[detectedMapping.creditColumn] : '';

      const debitParsed = parseMoneyToPaise(debitRaw, detectedNumberFormat);
      const creditParsed = parseMoneyToPaise(creditRaw, detectedNumberFormat);

      if (debitParsed && debitParsed.paise > 0) {
        type = 'expense';
        amountPaise = debitParsed.paise;
        signedAmountPaise = -debitParsed.paise;
      } else if (creditParsed && creditParsed.paise > 0) {
        type = 'income';
        amountPaise = creditParsed.paise;
        signedAmountPaise = creditParsed.paise;
      } else {
        rowError = 'Missing or invalid debit/credit amount';
      }
    } else if (detectedMapping.amountMode === 'type_and_amount') {
      const typeRaw = (detectedMapping.typeColumn ? raw[detectedMapping.typeColumn] : '').trim().toUpperCase();
      const amtRaw = detectedMapping.amountColumn ? raw[detectedMapping.amountColumn] : '';
      const amtParsed = parseMoneyToPaise(amtRaw, detectedNumberFormat);

      if (!amtParsed || amtParsed.paise === 0) {
        rowError = 'Missing or invalid amount';
      } else {
        amountPaise = amtParsed.paise;
        if (typeRaw === 'CR' || typeRaw === 'CREDIT') {
          type = 'income';
          signedAmountPaise = amountPaise;
        } else if (typeRaw === 'DR' || typeRaw === 'DEBIT') {
          type = 'expense';
          signedAmountPaise = -amountPaise;
        } else {
          // If type not recognized, fallback to sign of parsed amount
          if (amtParsed.isNegative) {
            type = 'expense';
            signedAmountPaise = -amountPaise;
          } else {
            type = 'income';
            signedAmountPaise = amountPaise;
          }
        }
      }
    } else {
      // single_signed
      const amtRaw = detectedMapping.amountColumn ? raw[detectedMapping.amountColumn] : '';
      const amtParsed = parseMoneyToPaise(amtRaw, detectedNumberFormat);

      if (!amtParsed || amtParsed.paise === 0) {
        rowError = 'Missing or invalid amount';
      } else {
        amountPaise = amtParsed.paise;
        const isCard = options.isCreditCard;

        if (isCard) {
          // In credit card statements: positive amounts are usually purchases/expenses;
          // negative amounts (e.g. -8839.00 or PAYMENT RECEIVED) are payments/credits.
          if (amtParsed.isNegative) {
            type = 'income';
            signedAmountPaise = amountPaise;
          } else {
            type = 'expense';
            signedAmountPaise = -amountPaise;
          }
        } else {
          // In standard bank statements: negative = expense, positive = income
          if (amtParsed.isNegative) {
            type = 'expense';
            signedAmountPaise = -amountPaise;
          } else {
            type = 'income';
            signedAmountPaise = amountPaise;
          }
        }
      }
    }

    // Parse date
    const isoDate = parseDateToISO(rawDate, detectedDateFormat);
    if (!isoDate && !rowError) {
      rowError = `Invalid date format: "${rawDate}" (expected ${detectedDateFormat})`;
    }

    if (!rawDesc && !rowError) {
      rowError = 'Description is empty';
    }

    const isValid = !rowError;
    const effectiveDate = isoDate || '1970-01-01';
    const importHash = generateImportHash(effectiveDate, amountPaise, rawDesc);

    // Duplicate detection
    let isDuplicate = false;
    let duplicateReason: 'existing_transaction' | 'file_duplicate' | undefined;

    if (isValid) {
      if (seenFileHashes.has(importHash)) {
        isDuplicate = true;
        duplicateReason = 'file_duplicate';
        duplicateRows++;
      } else if (existingHashes.has(importHash)) {
        isDuplicate = true;
        duplicateReason = 'existing_transaction';
        duplicateRows++;
      } else {
        seenFileHashes.add(importHash);
      }
    }

    // Category suggestion
    const categorySuggestion = isValid ? suggestCategory(rawDesc, rules, type) : null;

    if (isValid) {
      validRows++;
    } else {
      errorRows++;
    }

    // An included row must be valid and not a duplicate by default
    const included = isValid && !isDuplicate;
    if (included) {
      includedRows++;
      if (type === 'income') {
        totalIncomePaise += amountPaise;
      } else {
        totalExpensePaise += amountPaise;
      }
    }

    rows.push({
      id: `row-${rowIndex}-${nanoid(6)}`,
      rowIndex,
      raw,
      date: isoDate,
      rawDate,
      description: rawDesc,
      payee: rawDesc.slice(0, 100),
      type,
      amountPaise,
      signedAmountPaise,
      balancePaise: parsedBalance,
      importHash,
      suggestedCategoryId: categorySuggestion?.categoryId || null,
      selectedCategoryId: categorySuggestion?.categoryId || null,
      categoryRuleMatched: categorySuggestion?.matchedKeyword || null,
      isDuplicate,
      duplicateReason,
      isValid,
      error: rowError,
      included,
    });
  }

  const summary: ImportSummary = {
    totalRows: total,
    validRows,
    errorRows,
    duplicateRows,
    includedRows,
    totalIncomePaise,
    totalExpensePaise,
  };

  return {
    headers,
    totalRowsParsed: total,
    detectedMapping,
    detectedDateFormat,
    detectedNumberFormat,
    rows,
    summary,
  };
}
