import { sanitizeSourceLabel } from './privacy';
import { generatePassbookKey } from './hash';
import type {
  PfEntryKind,
  PfParsedRowDTO,
  PfReconciliationDTO,
  PfTotalsComponentDTO,
  PreviewPfPassbookResultDTO,
} from '../../contract';

/**
 * Calculates the last day of a YYYY-MM month.
 */
export function getMonthEndDate(yearMonth: string): string {
  const [yearStr, monthStr] = yearMonth.split('-');
  const year = parseInt(yearStr, 10);
  const month = parseInt(monthStr, 10);

  const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const dayPadded = String(daysInMonth).padStart(2, '0');
  return `${yearStr}-${monthStr}-${dayPadded}`;
}

/**
 * Parses a numeric value from Indian formatting (e.g. "₹ 1,08,556.00", "1,08,556", "(5,000)")
 * into integer paise (* 100).
 */
export function parseRupeesToPaise(val: unknown): number {
  if (val === null || val === undefined || val === '') return 0;
  if (typeof val === 'number') {
    return Math.round(val * 100);
  }

  const str = String(val).trim();
  if (!str || str === '-' || str === 'NA' || str === 'N/A' || str === 'Nil') {
    return 0;
  }

  let isNegative = false;
  let clean = str.replace(/[₹Rs\s]/gi, '');

  if (clean.startsWith('(') && clean.endsWith(')')) {
    isNegative = true;
    clean = clean.slice(1, -1);
  } else if (clean.startsWith('-')) {
    isNegative = true;
    clean = clean.slice(1);
  }

  // Remove commas
  clean = clean.replace(/,/g, '');
  const num = parseFloat(clean);
  if (isNaN(num)) return 0;

  const paise = Math.round(num * 100);
  return isNegative ? -Math.abs(paise) : paise;
}

export interface ParsedPassbookData {
  rows: PfParsedRowDTO[];
  unresolvedCount: number;
  parsedTotals?: {
    contributions?: PfTotalsComponentDTO;
    transferIns?: PfTotalsComponentDTO;
    withdrawals?: PfTotalsComponentDTO;
    closingBalance?: PfTotalsComponentDTO;
  };
  warnings: string[];
}

/**
 * Parses CSV text with standard columns:
 * entry_kind,period_month,posted_date,source_label,epf_wages,eps_wages,employee,employer,pension,note
 */
export function parsePfCsv(csvContent: string): ParsedPassbookData {
  const lines = csvContent
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { rows: [], unresolvedCount: 0, warnings: ['Empty CSV content'] };
  }

  const headerLine = lines[0].toLowerCase();
  const headers = headerLine.split(',').map((h) => h.trim().replace(/^["']|["']$/g, ''));

  const kindIdx = headers.indexOf('entry_kind');
  const periodIdx = headers.indexOf('period_month');
  const dateIdx = headers.indexOf('posted_date');
  const sourceIdx = headers.indexOf('source_label');
  const epfWagesIdx = headers.indexOf('epf_wages');
  const epsWagesIdx = headers.indexOf('eps_wages');
  const empIdx = headers.indexOf('employee');
  const emplyrIdx = headers.indexOf('employer');
  const penIdx = headers.indexOf('pension');
  const noteIdx = headers.indexOf('note');

  const rows: PfParsedRowDTO[] = [];
  let unresolvedCount = 0;
  const warnings: string[] = [];

  for (let i = 1; i < lines.length; i++) {
    const line = lines[i];
    // Split by comma respecting quotes
    const cells = splitCsvLine(line);
    if (cells.length < 3) continue;

    const rawKind = (kindIdx >= 0 ? cells[kindIdx] : '').trim().toLowerCase();
    const periodMonth = (periodIdx >= 0 ? cells[periodIdx] : '').trim() || null;
    let postedDate = (dateIdx >= 0 ? cells[dateIdx] : '').trim() || null;
    const rawSource = sourceIdx >= 0 ? cells[sourceIdx] : '';
    const epfWages = epfWagesIdx >= 0 ? parseRupeesToPaise(cells[epfWagesIdx]) : 0;
    const epsWages = epsWagesIdx >= 0 ? parseRupeesToPaise(cells[epsWagesIdx]) : 0;
    let emp = empIdx >= 0 ? parseRupeesToPaise(cells[empIdx]) : 0;
    let emplyr = emplyrIdx >= 0 ? parseRupeesToPaise(cells[emplyrIdx]) : 0;
    let pen = penIdx >= 0 ? parseRupeesToPaise(cells[penIdx]) : 0;
    const note = (noteIdx >= 0 ? cells[noteIdx] : '').trim() || null;

    let dateApprox = false;
    let entryKind: PfEntryKind = 'contribution';
    let requiresClassification = false;

    // Validate kind
    const validKinds: PfEntryKind[] = [
      'opening',
      'contribution',
      'transfer_in_principal',
      'transfer_in_interest',
      'interest_credit',
      'withdrawal',
    ];
    if (validKinds.includes(rawKind as PfEntryKind)) {
      entryKind = rawKind as PfEntryKind;
    } else {
      requiresClassification = true;
      unresolvedCount++;
    }

    // Withdrawals must be negative
    if (entryKind === 'withdrawal') {
      emp = -Math.abs(emp);
      emplyr = -Math.abs(emplyr);
      pen = -Math.abs(pen);
    }

    // Fallback date from periodMonth
    if (!postedDate && periodMonth && /^\d{4}-\d{2}$/.test(periodMonth)) {
      postedDate = getMonthEndDate(periodMonth);
      dateApprox = true;
    }

    const sourceLabel = sanitizeSourceLabel(rawSource);

    const passbookKey = generatePassbookKey({
      entryKind,
      periodMonth,
      sourceLabel,
      employeeAmount: emp,
      employerAmount: emplyr,
      pensionAmount: pen,
    });

    rows.push({
      entryKind,
      periodMonth,
      postedDate,
      dateApprox,
      epfWages,
      epsWages,
      employeeAmount: emp,
      employerAmount: emplyr,
      pensionAmount: pen,
      sourceLabel: sourceLabel || null,
      note,
      passbookKey,
      requiresClassification,
    });
  }

  return { rows, unresolvedCount, warnings };
}

/**
 * Splits a CSV line handling quoted substrings.
 */
function splitCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"' || char === "'") {
      inQuotes = !inQuotes;
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim().replace(/^["']|["']$/g, ''));
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim().replace(/^["']|["']$/g, ''));
  return result;
}

/**
 * Parses pasted text copied from the EPFO portal table.
 * Handles:
 * - Tab or multi-space separated columns
 * - Cut-off first column (missing serial number or date)
 * - ₹ and lakh commas (1,08,556)
 * - Keyword recognition:
 *   - "Cont. for the Due-Month YYYYMM" -> contribution with period YYYY-MM
 *   - "TRANSFER CLAIM - PRINCIPAL" -> transfer_in_principal
 *   - "TRANSFER CLAIM - INTEREST" -> transfer_in_interest
 *   - "Int. Updated upto dd/mm/yyyy" -> interest_credit
 *   - "claim" / "withdrawal" -> withdrawal
 *   - "opening balance" / "OB" -> opening
 *   - Parse totals rows for reconciliation
 * - Privacy: Source IDs reduced to last 4 characters
 * - Unknown rows flagged, never dropped silently
 */
export function parsePfPortalText(text: string): ParsedPassbookData {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const rows: PfParsedRowDTO[] = [];
  let unresolvedCount = 0;
  const warnings: string[] = [];

  const parsedTotals: ParsedPassbookData['parsedTotals'] = {};

  for (const line of lines) {
    const lower = line.toLowerCase();

    // Check for totals rows first
    if (lower.includes('total contribution') || lower.includes('grand total contribution')) {
      const nums = extractNumbersFromLine(line);
      if (nums.length >= 3) {
        // Last 3 numbers are usually employee, employer, pension
        const pen = nums[nums.length - 1];
        const emplyr = nums[nums.length - 2];
        const emp = nums[nums.length - 3];
        parsedTotals.contributions = {
          employee: emp,
          employer: emplyr,
          pension: pen,
          total: emp + emplyr + pen,
        };
      }
      continue;
    }

    if (
      lower.includes('total transfer') ||
      lower.includes('total vdr') ||
      lower.includes('total transfer-in')
    ) {
      const nums = extractNumbersFromLine(line);
      if (nums.length >= 3) {
        const pen = nums[nums.length - 1];
        const emplyr = nums[nums.length - 2];
        const emp = nums[nums.length - 3];
        parsedTotals.transferIns = {
          employee: emp,
          employer: emplyr,
          pension: pen,
          total: emp + emplyr + pen,
        };
      }
      continue;
    }

    if (lower.includes('total withdrawal') || lower.includes('total claim')) {
      const nums = extractNumbersFromLine(line);
      if (nums.length >= 3) {
        const pen = nums[nums.length - 1];
        const emplyr = nums[nums.length - 2];
        const emp = nums[nums.length - 3];
        parsedTotals.withdrawals = {
          employee: emp,
          employer: emplyr,
          pension: pen,
          total: emp + emplyr + pen,
        };
      }
      continue;
    }

    if (lower.includes('closing balance') || lower.includes('closing bal')) {
      const nums = extractNumbersFromLine(line);
      if (nums.length >= 3) {
        const pen = nums[nums.length - 1];
        const emplyr = nums[nums.length - 2];
        const emp = nums[nums.length - 3];
        parsedTotals.closingBalance = {
          employee: emp,
          employer: emplyr,
          pension: pen,
          total: emp + emplyr + pen,
        };
      }
      continue;
    }

    // Skip table header lines
    if (
      (lower.includes('epf wages') || lower.includes('eps wages') || lower.includes('employee share')) &&
      !lower.includes('cont.')
    ) {
      continue;
    }

    // Classify line by keywords
    let entryKind: PfEntryKind | null = null;
    let periodMonth: string | null = null;
    let postedDate: string | null = null;
    let dateApprox = false;
    let sourceLabel: string | null = null;
    let requiresClassification = false;

    // 1. Monthly contribution: "Cont. for the Due-Month YYYYMM" or "Cont for Due-Month 202605"
    const contMatch = line.match(/Cont\.?\s*(?:for\s*(?:the\s*)?Due-Month)?\s*[:\s]*(\d{4})(\d{2})/i) ||
      line.match(/Due[- ]Month\s*[:\s]*(\d{4})(\d{2})/i);

    if (contMatch) {
      entryKind = 'contribution';
      periodMonth = `${contMatch[1]}-${contMatch[2]}`;
      postedDate = getMonthEndDate(periodMonth);
      dateApprox = true;
    } else if (lower.includes('transfer claim') && lower.includes('principal')) {
      entryKind = 'transfer_in_principal';
      sourceLabel = sanitizeSourceLabel(line);
    } else if (lower.includes('transfer claim') && lower.includes('interest')) {
      entryKind = 'transfer_in_interest';
      sourceLabel = sanitizeSourceLabel(line);
    } else if (lower.includes('int. updated upto') || lower.includes('interest updated upto') || lower.includes('interest credit')) {
      entryKind = 'interest_credit';
      const dateMatch = line.match(/(\d{2})[-/](\d{2})[-/](\d{4})/);
      if (dateMatch) {
        postedDate = `${dateMatch[3]}-${dateMatch[2]}-${dateMatch[1]}`;
      }
    } else if (lower.includes('withdrawal') || lower.includes('claim paid') || lower.includes('adv/claim')) {
      entryKind = 'withdrawal';
    } else if (lower.includes('opening balance') || lower.startsWith('ob ')) {
      entryKind = 'opening';
    } else {
      // Check if line has numbers that look like contribution or transaction row
      const nums = extractNumbersFromLine(line);
      if (nums.length >= 3) {
        entryKind = 'contribution';
        requiresClassification = true;
        unresolvedCount++;
      } else {
        // Likely ignorable metadata line or noise
        continue;
      }
    }

    // Extract numbers from the line
    const numbers = extractNumbersFromLine(line);
    let epfWages = 0;
    let epsWages = 0;
    let emp = 0;
    let emplyr = 0;
    let pen = 0;

    if (numbers.length >= 5) {
      // Typically: [epfWages, epsWages, employeeShare, employerShare, pensionShare]
      epfWages = numbers[numbers.length - 5];
      epsWages = numbers[numbers.length - 4];
      emp = numbers[numbers.length - 3];
      emplyr = numbers[numbers.length - 2];
      pen = numbers[numbers.length - 1];
    } else if (numbers.length === 4) {
      // Missing wages or EPS wages
      epfWages = numbers[0];
      emp = numbers[1];
      emplyr = numbers[2];
      pen = numbers[3];
    } else if (numbers.length === 3) {
      // Just shares: employee, employer, pension
      emp = numbers[0];
      emplyr = numbers[1];
      pen = numbers[2];
    } else if (numbers.length === 2) {
      emp = numbers[0];
      emplyr = numbers[1];
    } else if (numbers.length === 1) {
      emp = numbers[0];
    }

    if (entryKind === 'withdrawal') {
      emp = -Math.abs(emp);
      emplyr = -Math.abs(emplyr);
      pen = -Math.abs(pen);
    }

    const effectiveKind = entryKind || 'contribution';
    const passbookKey = generatePassbookKey({
      entryKind: effectiveKind,
      periodMonth,
      sourceLabel,
      employeeAmount: emp,
      employerAmount: emplyr,
      pensionAmount: pen,
    });

    rows.push({
      entryKind: effectiveKind,
      periodMonth,
      postedDate,
      dateApprox,
      epfWages,
      epsWages,
      employeeAmount: emp,
      employerAmount: emplyr,
      pensionAmount: pen,
      sourceLabel,
      passbookKey,
      requiresClassification,
      rawTextSnippet: line.slice(0, 100),
    });
  }

  return { rows, unresolvedCount, parsedTotals, warnings };
}

/**
 * Extracts all currency amounts (in paise) from a line of text.
 */
function extractNumbersFromLine(line: string): number[] {
  // Replace tabs with space, split tokens
  const tokens = line.split(/[\t|\s]{2,}|\t/);
  const found: number[] = [];

  for (const token of tokens) {
    const trimmed = token.trim();
    if (!trimmed) continue;

    // Check if token looks like a number: contains digits and optional currency / commas / decimals
    if (/^[₹Rs.\s]*[-+]?\(?[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?\)?%?$/.test(trimmed)) {
      if (trimmed.endsWith('%')) continue; // skip percentage
      const paise = parseRupeesToPaise(trimmed);
      found.push(paise);
    } else {
      // Look for individual comma-separated or integer numbers inside the token
      const subTokens = trimmed.split(/\s+/);
      for (const st of subTokens) {
        if (/^[₹Rs.\s]*[-+]?\(?[0-9]{1,3}(?:,[0-9]{2,3})*(?:\.[0-9]{1,2})?\)?$/.test(st)) {
          const p = parseRupeesToPaise(st);
          found.push(p);
        }
      }
    }
  }

  return found;
}

/**
 * Computes reconciliation statistics from the parsed rows and compares them against passbook totals.
 */
export function computeReconciliation(
  rows: PfParsedRowDTO[],
  parsedTotals?: ParsedPassbookData['parsedTotals']
): PfReconciliationDTO {
  let contribEmp = 0;
  let contribEmplyr = 0;
  let contribPen = 0;

  let transferEmp = 0;
  let transferEmplyr = 0;
  let transferPen = 0;

  let withdrawEmp = 0;
  let withdrawEmplyr = 0;
  let withdrawPen = 0;

  let openingEmp = 0;
  let openingEmplyr = 0;
  let openingPen = 0;

  let interestEmp = 0;
  let interestEmplyr = 0;
  let interestPen = 0;

  for (const r of rows) {
    switch (r.entryKind) {
      case 'contribution':
        contribEmp += r.employeeAmount;
        contribEmplyr += r.employerAmount;
        contribPen += r.pensionAmount;
        break;
      case 'transfer_in_principal':
      case 'transfer_in_interest':
        transferEmp += r.employeeAmount;
        transferEmplyr += r.employerAmount;
        transferPen += r.pensionAmount;
        break;
      case 'withdrawal':
        // r amounts are already negative
        withdrawEmp += Math.abs(r.employeeAmount);
        withdrawEmplyr += Math.abs(r.employerAmount);
        withdrawPen += Math.abs(r.pensionAmount);
        break;
      case 'opening':
        openingEmp += r.employeeAmount;
        openingEmplyr += r.employerAmount;
        openingPen += r.pensionAmount;
        break;
      case 'interest_credit':
        interestEmp += r.employeeAmount;
        interestEmplyr += r.employerAmount;
        interestPen += r.pensionAmount;
        break;
    }
  }

  const closingEmp = openingEmp + contribEmp + transferEmp + interestEmp - withdrawEmp;
  const closingEmplyr = openingEmplyr + contribEmplyr + transferEmplyr + interestEmplyr - withdrawEmplyr;
  const closingPen = openingPen + contribPen + transferPen + interestPen - withdrawPen;

  const contributions: PfTotalsComponentDTO = {
    employee: contribEmp,
    employer: contribEmplyr,
    pension: contribPen,
    total: contribEmp + contribEmplyr + contribPen,
  };

  const transferIns: PfTotalsComponentDTO = {
    employee: transferEmp,
    employer: transferEmplyr,
    pension: transferPen,
    total: transferEmp + transferEmplyr + transferPen,
  };

  const withdrawals: PfTotalsComponentDTO = {
    employee: withdrawEmp,
    employer: withdrawEmplyr,
    pension: withdrawPen,
    total: withdrawEmp + withdrawEmplyr + withdrawPen,
  };

  const closingBalance: PfTotalsComponentDTO = {
    employee: closingEmp,
    employer: closingEmplyr,
    pension: closingPen,
    total: closingEmp + closingEmplyr + closingPen,
  };

  let isMatched = true;
  let diff: PfReconciliationDTO['diff'] | undefined = undefined;

  if (parsedTotals?.closingBalance) {
    const diffEmp = closingEmp - parsedTotals.closingBalance.employee;
    const diffEmplyr = closingEmplyr - parsedTotals.closingBalance.employer;
    const diffPen = closingPen - parsedTotals.closingBalance.pension;

    if (diffEmp !== 0 || diffEmplyr !== 0 || diffPen !== 0) {
      isMatched = false;
      diff = {
        employee: diffEmp,
        employer: diffEmplyr,
        pension: diffPen,
      };
    }
  }

  return {
    contributions,
    transferIns,
    withdrawals,
    closingBalance,
    parsedTotals,
    diff,
    isMatched,
  };
}

/**
 * Full passbook preview pipeline.
 */
export function buildPassbookPreview(
  input: { rawText?: string; csvContent?: string }
): PreviewPfPassbookResultDTO {
  let parsed: ParsedPassbookData;

  if (input.csvContent && input.csvContent.trim().length > 0) {
    parsed = parsePfCsv(input.csvContent);
  } else if (input.rawText && input.rawText.trim().length > 0) {
    parsed = parsePfPortalText(input.rawText);
  } else {
    parsed = { rows: [], unresolvedCount: 0, warnings: ['No content provided'] };
  }

  const reconciliation = computeReconciliation(parsed.rows, parsed.parsedTotals);

  return {
    rows: parsed.rows,
    unresolvedCount: parsed.unresolvedCount,
    reconciliation,
    warnings: parsed.warnings,
  };
}
