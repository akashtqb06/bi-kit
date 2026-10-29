import type { NumberFormatConfig } from './types';

/**
 * Detects whether the input CSV uses dot or comma as decimal separator.
 */
export function detectNumberFormat(samples: string[]): NumberFormatConfig {
  const cleanSamples = samples
    .map((s) => s.trim().replace(/^["']|["']$/g, ''))
    .filter((s) => s.length > 0 && /[0-9]/.test(s));

  let dotDecimalVotes = 0;
  let commaDecimalVotes = 0;

  for (const s of cleanSamples) {
    // e.g. 1,25,000.00 or 250000.00
    if (/\.\d{2}$/.test(s)) {
      dotDecimalVotes += 2;
    }
    // e.g. 125.000,00
    if (/,\d{2}$/.test(s)) {
      commaDecimalVotes += 2;
    }
    if (s.includes(',') && s.includes('.')) {
      const lastComma = s.lastIndexOf(',');
      const lastDot = s.lastIndexOf('.');
      if (lastDot > lastComma) {
        dotDecimalVotes++;
      } else {
        commaDecimalVotes++;
      }
    }
  }

  if (commaDecimalVotes > dotDecimalVotes) {
    return {
      decimalSeparator: ',',
      thousandsSeparator: '.',
    };
  }

  return {
    decimalSeparator: '.',
    thousandsSeparator: ',',
  };
}

export interface ParsedAmountResult {
  paise: number; // Non-negative integer paise
  isNegative: boolean;
}

/**
 * Parses any currency string representation into exact minor units (integer paise).
 * Correctly handles Indian lakhs/crores commas ("1,25,000.00"), currency prefixes,
 * negative numbers, accounting parentheses "(1,200.00)", and trailing signs.
 * Returns null if the value is corrupted, empty, or unparseable.
 */
export function parseMoneyToPaise(
  raw: string | number | null | undefined,
  config?: Partial<NumberFormatConfig>
): ParsedAmountResult | null {
  if (raw === null || raw === undefined) return null;

  if (typeof raw === 'number') {
    if (!Number.isFinite(raw)) return null;
    const isNeg = raw < 0;
    const paise = Math.round(Math.abs(raw) * 100);
    return { paise, isNegative: isNeg };
  }

  let s = String(raw).trim().replace(/^["']|["']$/g, '');
  if (!s || s === '-' || s === '--' || s === 'N/A' || s === 'NA' || s === 'null') {
    return null;
  }

  // Detect negative indicators
  let isNegative = false;
  if (s.startsWith('-')) {
    isNegative = true;
    s = s.slice(1).trim();
  } else if (s.endsWith('-')) {
    isNegative = true;
    s = s.slice(0, -1).trim();
  } else if (s.startsWith('(') && s.endsWith(')')) {
    isNegative = true;
    s = s.slice(1, -1).trim();
  } else if (/\b(dr|debit)\b/i.test(s)) {
    isNegative = true;
    s = s.replace(/\b(dr|debit)\b/gi, '').trim();
  } else if (/\b(cr|credit)\b/i.test(s)) {
    isNegative = false;
    s = s.replace(/\b(cr|credit)\b/gi, '').trim();
  }

  // Strip currency symbols and whitespace
  s = s.replace(/[₹$€£¥]/g, '');
  s = s.replace(/\b(inr|rs\.?|usd|eur|gbp)\b/gi, '').trim();

  if (!s || !/[0-9]/.test(s)) return null;

  const decSep = config?.decimalSeparator ?? '.';
  const thouSep = config?.thousandsSeparator ?? (decSep === '.' ? ',' : '.');

  // Strip thousands separators
  if (thouSep) {
    const escapedThouSep = thouSep === '.' ? '\\.' : thouSep;
    s = s.replace(new RegExp(escapedThouSep, 'g'), '');
  }

  // Normalize decimal separator to '.'
  if (decSep === ',') {
    s = s.replace(',', '.');
  }

  // Remove any remaining spaces
  s = s.replace(/\s+/g, '');

  const num = parseFloat(s);
  if (Number.isNaN(num) || !Number.isFinite(num)) {
    return null;
  }

  const paise = Math.round(Math.abs(num) * 100);
  return {
    paise,
    isNegative,
  };
}
