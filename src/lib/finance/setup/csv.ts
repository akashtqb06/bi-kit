import { ACCOUNT_KINDS, type AccountKind, type CompoundingFrequency } from '../constants';
import type { DraftAccount } from './types';
import { parseMoneyToPaise } from '../import/number-parser';

export interface CSVParseRowError {
  row: number;
  message: string;
}

export interface CSVParseResult {
  accounts: DraftAccount[];
  errors: CSVParseRowError[];
}

/**
 * Normalizes header string to snake_case alphanumeric.
 */
function normalizeHeader(h: string): string {
  return h
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_|_$/g, '');
}

/**
 * Parses a simple CSV row respecting quoted fields.
 */
function splitCSVLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const char = line[i];
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        current += '"';
        i++; // skip escaped quote
      } else {
        inQuotes = !inQuotes;
      }
    } else if (char === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += char;
    }
  }
  result.push(current.trim());
  return result;
}

/**
 * Normalizes date to YYYY-MM-DD, handling YYYY-MM-DD, DD-MM-YYYY, DD/MM/YYYY, YYYY/MM/DD.
 */
export function normalizeDate(raw: string | undefined): string | null {
  if (!raw) return null;
  const s = raw.trim();
  if (!s) return null;

  // YYYY-MM-DD or YYYY/MM/DD
  const ymdMatch = s.match(/^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/);
  if (ymdMatch) {
    const y = ymdMatch[1];
    const m = ymdMatch[2].padStart(2, '0');
    const d = ymdMatch[3].padStart(2, '0');
    return `${y}-${m}-${d}`;
  }

  // DD-MM-YYYY or DD/MM/YYYY
  const dmyMatch = s.match(/^(\d{1,2})[-/](\d{1,2})[-/](\d{4})$/);
  if (dmyMatch) {
    const d = dmyMatch[1].padStart(2, '0');
    const m = dmyMatch[2].padStart(2, '0');
    const y = dmyMatch[3];
    return `${y}-${m}-${d}`;
  }

  return null;
}

/**
 * Parses monetary value into signed or positive paise.
 */
export function parseCSVAmount(raw: string | undefined): number {
  if (!raw) return 0;
  const parsed = parseMoneyToPaise(raw);
  if (!parsed) return 0;
  return parsed.isNegative ? -parsed.paise : parsed.paise;
}

/**
 * Parses CSV accounts input.
 */
export function parseAccountsCSV(csvText: string): CSVParseResult {
  const lines = csvText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  if (lines.length === 0) {
    return { accounts: [], errors: [{ row: 0, message: 'CSV file is empty' }] };
  }

  const rawHeaders = splitCSVLine(lines[0]);
  const headers = rawHeaders.map(normalizeHeader);

  // Column index helpers
  const colIndex = (aliases: string[]) => {
    for (const alias of aliases) {
      const idx = headers.indexOf(alias);
      if (idx !== -1) return idx;
    }
    return -1;
  };

  const nameCol = colIndex(['name', 'account_name', 'account']);
  const kindCol = colIndex(['kind', 'account_kind', 'type']);
  const balanceCol = colIndex(['balance', 'balance_value', 'balance_current_value', 'value', 'amount']);
  const owedCol = colIndex(['owed', 'debt', 'outstanding', 'amount_owed']);
  const limitCol = colIndex(['credit_limit', 'limit']);
  const institutionCol = colIndex(['institution', 'bank', 'broker']);
  const rateCol = colIndex(['interest_rate', 'rate', 'roi', 'annual_interest_rate']);
  const compoundingCol = colIndex(['compounding', 'compounding_frequency']);
  const startCol = colIndex(['start_date', 'start']);
  const maturityCol = colIndex(['maturity_date', 'maturity']);
  const tenureCol = colIndex(['tenure_months', 'tenure', 'months']);
  const investedCol = colIndex(['total_invested', 'invested', 'cost_basis']);
  const currentValueCol = colIndex(['current_value', 'market_value', 'balance_current_value']);
  const emiCol = colIndex(['emi']);
  const stmtCol = colIndex(['statement_day']);
  const dueCol = colIndex(['due_day']);

  if (nameCol === -1 || kindCol === -1) {
    return {
      accounts: [],
      errors: [
        {
          row: 1,
          message:
            'Missing required column(s): CSV must contain "Name" and "Kind" columns',
        },
      ],
    };
  }

  const accounts: DraftAccount[] = [];
  const errors: CSVParseRowError[] = [];

  for (let r = 1; r < lines.length; r++) {
    const rowNum = r + 1;
    const cols = splitCSVLine(lines[r]);

    const name = cols[nameCol]?.trim();
    if (!name) {
      errors.push({ row: rowNum, message: 'Account name is required' });
      continue;
    }

    const rawKind = cols[kindCol]?.trim().toLowerCase().replace(/\s+/g, '_');
    // Normalize aliases
    let kind: AccountKind | undefined;
    if (rawKind === 'savings' || rawKind === 'checking' || rawKind === 'bank_account') {
      kind = 'bank';
    } else if (rawKind === 'card' || rawKind === 'credit') {
      kind = 'credit_card';
    } else if (rawKind === 'fd') {
      kind = 'fixed_deposit';
    } else if (rawKind === 'rd') {
      kind = 'recurring_deposit';
    } else if (rawKind === 'mf' || rawKind === 'mutual_funds') {
      kind = 'mutual_fund';
    } else if (rawKind === 'equity' || rawKind === 'shares') {
      kind = 'stocks';
    } else if (ACCOUNT_KINDS.includes(rawKind as AccountKind)) {
      kind = rawKind as AccountKind;
    }

    if (!kind) {
      errors.push({
        row: rowNum,
        message: `Invalid account kind "${cols[kindCol]}". Must be one of: ${ACCOUNT_KINDS.join(', ')}`,
      });
      continue;
    }

    // Parse values
    const rawBal = balanceCol !== -1 ? cols[balanceCol] : undefined;
    const rawOwed = owedCol !== -1 ? cols[owedCol] : undefined;
    const rawLimit = limitCol !== -1 ? cols[limitCol] : undefined;
    const rawInst = institutionCol !== -1 ? cols[institutionCol] : undefined;
    const rawRate = rateCol !== -1 ? cols[rateCol] : undefined;
    const rawComp = compoundingCol !== -1 ? cols[compoundingCol]?.toLowerCase() : undefined;
    const rawStart = startCol !== -1 ? cols[startCol] : undefined;
    const rawMaturity = maturityCol !== -1 ? cols[maturityCol] : undefined;
    const rawTenure = tenureCol !== -1 ? cols[tenureCol] : undefined;
    const rawInvested = investedCol !== -1 ? cols[investedCol] : undefined;
    const rawCurrentVal = currentValueCol !== -1 ? cols[currentValueCol] : undefined;
    const rawEmi = emiCol !== -1 ? cols[emiCol] : undefined;
    const rawStmt = stmtCol !== -1 ? cols[stmtCol] : undefined;
    const rawDue = dueCol !== -1 ? cols[dueCol] : undefined;

    // Date validation
    let startDate: string | undefined;
    if (rawStart) {
      const normalized = normalizeDate(rawStart);
      if (!normalized) {
        errors.push({ row: rowNum, message: `Invalid start date: "${rawStart}"` });
        continue;
      }
      startDate = normalized;
    }

    let maturityDate: string | undefined;
    if (rawMaturity) {
      const normalized = normalizeDate(rawMaturity);
      if (!normalized) {
        errors.push({ row: rowNum, message: `Invalid maturity date: "${rawMaturity}"` });
        continue;
      }
      maturityDate = normalized;
    }

    let compounding: CompoundingFrequency = 'quarterly';
    if (rawComp) {
      if (['monthly', 'quarterly', 'half_yearly', 'yearly', 'simple'].includes(rawComp)) {
        compounding = rawComp as CompoundingFrequency;
      }
    }

    const balancePaise = rawBal ? parseCSVAmount(rawBal) : 0;
    const owedPaise = rawOwed ? Math.abs(parseCSVAmount(rawOwed)) : (kind === 'credit_card' || kind === 'loan') && balancePaise < 0 ? Math.abs(balancePaise) : 0;
    const creditLimitPaise = rawLimit ? Math.abs(parseCSVAmount(rawLimit)) : undefined;
    const currentValuePaise = rawCurrentVal ? Math.abs(parseCSVAmount(rawCurrentVal)) : (kind === 'mutual_fund' || kind === 'stocks' || kind === 'fixed_deposit' || kind === 'recurring_deposit') && balancePaise > 0 ? balancePaise : undefined;
    const totalInvestedPaise = rawInvested ? Math.abs(parseCSVAmount(rawInvested)) : undefined;
    const principalPaise = kind === 'fixed_deposit' ? (balancePaise > 0 ? balancePaise : 0) : undefined;
    const monthlyInstallmentPaise = kind === 'recurring_deposit' ? (balancePaise > 0 ? balancePaise : 0) : undefined;

    const rateNum = rawRate ? parseFloat(rawRate.replace(/[%]/g, '').trim()) : undefined;
    const tenureNum = rawTenure ? parseInt(rawTenure, 10) : undefined;
    const emiPaise = rawEmi ? Math.abs(parseCSVAmount(rawEmi)) : undefined;
    const stmtNum = rawStmt ? parseInt(rawStmt, 10) : undefined;
    const dueNum = rawDue ? parseInt(rawDue, 10) : undefined;

    accounts.push({
      name,
      kind,
      institution: rawInst || undefined,
      balancePaise: kind === 'credit_card' || kind === 'loan' ? -owedPaise : balancePaise,
      owedPaise,
      creditLimitPaise,
      statementDay: stmtNum && stmtNum >= 1 && stmtNum <= 31 ? stmtNum : undefined,
      dueDay: dueNum && dueNum >= 1 && dueNum <= 31 ? dueNum : undefined,
      principalPaise,
      monthlyInstallmentPaise,
      interestRate: rateNum !== undefined && !Number.isNaN(rateNum) ? rateNum : undefined,
      compoundingFrequency: compounding,
      startDate,
      maturityDate,
      tenureMonths: tenureNum && tenureNum > 0 ? tenureNum : undefined,
      currentValuePaise,
      totalInvestedPaise,
      emiPaise,
    });
  }

  return { accounts, errors };
}

/**
 * Returns the standard CSV template for account import.
 */
export function getCSVTemplateContent(): string {
  return [
    'Name,Kind,Institution,Balance / Current Value,Amount Owed,Credit Limit,Interest Rate %,Compounding,Start Date,Maturity Date,Tenure Months,Total Invested,EMI,Statement Day,Due Day',
    'Main Cash,cash,,5000,,,,,,,,,,,',
    'HDFC Salary Account,bank,HDFC Bank,125000,,,,,,,,,,,',
    'Regalia Gold Credit Card,credit_card,HDFC Bank,,15000,200000,,,,,,,,15,5',
    'SBI 1-Yr Fixed Deposit,fixed_deposit,SBI,100000,,,7.1,quarterly,2026-01-01,2027-01-01,12,,,,',
    'Post Office RD,recurring_deposit,India Post,5000,,,6.7,,2026-01-01,,12,,,,',
    'Groww Mutual Funds,mutual_fund,Groww,350000,,,,,,,,280000,,,',
    'Zerodha Kite Demat,stocks,Zerodha,210000,,,,,,,,175000,,,',
    'Car Loan,loan,ICICI Bank,,450000,,9.25,,,,,,12500,,',
  ].join('\n');
}
