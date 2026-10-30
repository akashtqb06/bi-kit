/**
 * Currency and Number Formatting Utilities for Personal Finance (INR)
 *
 * Implements Indian numbering system (Lakh/Crore grouping) and
 * paise (integer minor units, 1 INR = 100 paise) conversions.
 */

/**
 * Converts minor integer units (paise) to major fractional units (rupees).
 */
export function paiseToRupees(paise: number): number {
  return paise / 100;
}

/**
 * Converts major fractional units (rupees) to integer minor units (paise).
 */
export function rupeesToPaise(rupees: number): number {
  return Math.round(rupees * 100);
}

export interface FormatINROptions {
  /**
   * Whether to force displaying decimal paise.
   * If 'auto', decimals are shown only when fractional paise exist (e.g., 250.50 vs 250).
   * Default is 'auto'.
   */
  decimals?: 'always' | 'auto' | 'never';
  /**
   * Sign display option: 'auto' (shows - for negative), 'always' (+ or -), 'never' (absolute value).
   */
  signDisplay?: 'auto' | 'always' | 'never';
  /**
   * Whether to include the currency symbol (₹). Default true.
   */
  showSymbol?: boolean;
  /**
   * If true, abbreviates large numbers (e.g. ₹1.5 L, ₹2.4 Cr, ₹50 K).
   */
  compact?: boolean;
}

/**
 * Formats a paise amount into Indian Rupees (INR) with standard Lakh/Crore grouping.
 * e.g., 10000000 paise = 100000 rupees -> ₹1,00,000
 */
export function formatINR(paise: number, options: FormatINROptions = {}): string {
  const {
    decimals = 'auto',
    signDisplay = 'auto',
    showSymbol = true,
    compact = false,
  } = options;

  if (isNaN(paise) || !isFinite(paise)) {
    return showSymbol ? '₹0' : '0';
  }

  const isNegative = paise < 0;
  const absPaise = Math.abs(paise);
  const absRupees = absPaise / 100;

  // Sign determination
  let signStr = '';
  if (signDisplay === 'always') {
    signStr = isNegative ? '-' : '+';
  } else if (signDisplay === 'auto' && isNegative) {
    signStr = '-';
  }

  const symbol = showSymbol ? '₹' : '';

  if (compact) {
    if (absRupees >= 10000000) {
      // Crores
      const cr = absRupees / 10000000;
      return `${signStr}${symbol}${cr.toFixed(cr >= 10 ? 1 : 2)} Cr`;
    }
    if (absRupees >= 100000) {
      // Lakhs
      const l = absRupees / 100000;
      return `${signStr}${symbol}${l.toFixed(l >= 10 ? 1 : 2)} L`;
    }
    if (absRupees >= 1000) {
      // Thousands
      const k = absRupees / 1000;
      return `${signStr}${symbol}${k.toFixed(k >= 10 ? 1 : 2)} K`;
    }
  }

  let minFractionDigits = 0;
  let maxFractionDigits = 0;

  if (decimals === 'always') {
    minFractionDigits = 2;
    maxFractionDigits = 2;
  } else if (decimals === 'never') {
    minFractionDigits = 0;
    maxFractionDigits = 0;
  } else {
    // 'auto': show 2 decimals only if paise has fractional part (not divisible by 100)
    const hasFractions = absPaise % 100 !== 0;
    minFractionDigits = hasFractions ? 2 : 0;
    maxFractionDigits = hasFractions ? 2 : 0;
  }

  const formattedNum = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: minFractionDigits,
    maximumFractionDigits: maxFractionDigits,
  }).format(absRupees);

  return `${signStr}${symbol}${formattedNum}`;
}

/**
 * Format helper for percent values (e.g. 14.5% or +5.2%)
 */
export function formatPercent(value: number, showSign = false): string {
  const sign = showSign && value > 0 ? '+' : '';
  return `${sign}${value.toFixed(1)}%`;
}

/**
 * Formats a liability balance in plain words: "Owes ₹2,159", "Credit ₹500", or "₹0".
 * For credit cards: negative balance means money is owed, positive balance means overpaid credit.
 */
export function formatLiabilityBalance(balance: number): string {
  if (balance < 0) {
    return `Owes ${formatINR(Math.abs(balance))}`;
  }
  if (balance > 0) {
    return `Credit ${formatINR(balance)}`;
  }
  return '₹0';
}

/**
 * Formats an account's balance for display in dropdowns, tiles, and tables.
 * Displays plain words for liabilities ("Owes ₹X", "Credit ₹Y") without internal negative signs.
 */
export function formatAccountDisplayBalance(acc: {
  class?: string;
  kind?: string;
  balance: number;
  outstanding?: number;
}): string {
  const isLiability =
    acc.class === 'liability' ||
    acc.kind === 'credit_card' ||
    acc.kind === 'loan' ||
    acc.kind === 'other_liability';

  if (isLiability) {
    if (acc.kind === 'loan' || acc.kind === 'other_liability') {
      const outstanding = acc.outstanding ?? Math.max(0, acc.balance);
      return outstanding > 0 ? `Owes ${formatINR(outstanding)}` : '₹0';
    }
    return formatLiabilityBalance(acc.balance);
  }

  return formatINR(acc.balance);
}

/**
 * Formats an investment gain/return amount with proper sign prefix.
 * e.g. +₹1,500 or -₹500.
 */
export function formatGain(gain: number): {
  text: string;
  isPositive: boolean;
  isNegative: boolean;
} {
  const isPositive = gain > 0;
  const isNegative = gain < 0;
  const prefix = isPositive ? '+' : '';
  return {
    text: `${prefix}${formatINR(gain)}`,
    isPositive,
    isNegative,
  };
}
