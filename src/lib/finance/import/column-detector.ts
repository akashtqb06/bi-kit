import type { AmountMode, ColumnMapping } from './types';

const DATE_KEYWORDS = [
  'transaction date',
  'txn date',
  'txn_date',
  'trans date',
  'posting date',
  'value dt',
  'value date',
  'entry date',
  'date',
];

const DESCRIPTION_KEYWORDS = [
  'transaction details',
  'txn description',
  'txn_description',
  'narration',
  'description',
  'particulars',
  'details',
  'remarks',
  'payee',
  'merchant',
  'memo',
];

const DEBIT_KEYWORDS = [
  'withdrawal amt.',
  'withdrawal amt',
  'withdrawal',
  'withdrawals',
  'debit amount',
  'debit amt',
  'debit',
  'dr amt',
  'dr',
  'expense',
];

const CREDIT_KEYWORDS = [
  'deposit amt.',
  'deposit amt',
  'deposit',
  'deposits',
  'credit amount',
  'credit amt',
  'credit',
  'cr amt',
  'cr',
  'income',
];

const AMOUNT_KEYWORDS = [
  'amount (inr)',
  'amount(inr)',
  'amount_inr',
  'transaction amount',
  'txn amount',
  'net amount',
  'amount',
];

const TYPE_KEYWORDS = ['type', 'txn type', 'cr/dr', 'dr/cr', 'indicator', 'd/c', 'c/d'];

const BALANCE_KEYWORDS = [
  'closing balance',
  'available balance',
  'account balance',
  'ledger balance',
  'balance',
];

function findMatchingHeader(headers: string[], keywords: string[]): string | undefined {
  const normalized = headers.map((h) => ({
    original: h,
    clean: h.trim().toLowerCase().replace(/[\r\n\t]+/g, ' '),
  }));

  // Exact or word boundary match first
  for (const kw of keywords) {
    const found = normalized.find((item) => item.clean === kw);
    if (found) return found.original;
  }

  // Substring match second
  for (const kw of keywords) {
    const found = normalized.find((item) => item.clean.includes(kw));
    if (found) return found.original;
  }

  return undefined;
}

/**
 * Automatically inspects the CSV headers and sample row values to deduce
 * optimal column mapping for Date, Description, Debit/Credit, Amount, Type, and Balance.
 */
export function detectColumnMapping(
  headers: string[],
  sampleRows: Record<string, string>[] = []
): ColumnMapping {
  const dateCol = findMatchingHeader(headers, DATE_KEYWORDS) || headers[0] || '';
  const descCol =
    findMatchingHeader(headers, DESCRIPTION_KEYWORDS) ||
    headers.find((h) => h !== dateCol && !h.toLowerCase().includes('date')) ||
    headers[1] ||
    '';

  const debitCol = findMatchingHeader(headers, DEBIT_KEYWORDS);
  const creditCol = findMatchingHeader(headers, CREDIT_KEYWORDS);
  const amountCol = findMatchingHeader(headers, AMOUNT_KEYWORDS);
  const balanceCol = findMatchingHeader(headers, BALANCE_KEYWORDS);

  // Look for a Type column (e.g. CR/DR)
  let typeCol = findMatchingHeader(headers, TYPE_KEYWORDS);

  // Check sample rows to verify if type column holds CR/DR indicators
  if (typeCol && sampleRows.length > 0) {
    const isCrDr = sampleRows.some((row) => {
      const val = (row[typeCol!] || '').trim().toUpperCase();
      return val === 'CR' || val === 'DR' || val === 'CREDIT' || val === 'DEBIT';
    });
    if (!isCrDr) {
      typeCol = undefined;
    }
  }

  let amountMode: AmountMode = 'single_signed';

  if (debitCol && creditCol && debitCol !== creditCol) {
    amountMode = 'separate_debit_credit';
  } else if (typeCol && amountCol) {
    amountMode = 'type_and_amount';
  } else if (amountCol) {
    amountMode = 'single_signed';
  } else if (debitCol || creditCol) {
    amountMode = 'separate_debit_credit';
  }

  return {
    dateColumn: dateCol,
    descriptionColumn: descCol,
    amountMode,
    debitColumn: debitCol,
    creditColumn: creditCol,
    amountColumn: amountCol,
    typeColumn: typeCol,
    balanceColumn: balanceCol,
    cardExpenseSign: 'positive',
  };
}
