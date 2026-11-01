/**
 * Shared Indian currency and date formatters for Finance charts and ledgers.
 * Guarantees integer paise precision and prevents timezone-induced date shifts.
 */

const MONTH_NAMES = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'
] as const;

/**
 * Formats integer paise into Indian currency with standard lakh/crore comma grouping.
 * e.g., 11178130 -> "₹1,11,781.30", -498495 -> "-₹4,984.95"
 */
export function formatInr(
  amountPaise: number,
  options?: {
    signDisplay?: 'auto' | 'always' | 'never' | 'exceptZero';
    minimumFractionDigits?: number;
    maximumFractionDigits?: number;
  }
): string {
  if (!Number.isFinite(amountPaise)) return '₹0.00';

  const rupees = amountPaise / 100;
  const isNegative = rupees < 0;
  const absRupees = Math.abs(rupees);

  const minDigits = options?.minimumFractionDigits ?? 2;
  const maxDigits = options?.maximumFractionDigits ?? 2;

  // Format absolute value in Indian locale
  const formattedAbs = new Intl.NumberFormat('en-IN', {
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(absRupees);

  const signDisplay = options?.signDisplay ?? 'auto';

  if (isNegative) {
    if (signDisplay === 'never') {
      return `₹${formattedAbs}`;
    }
    return `-₹${formattedAbs}`;
  }

  if (signDisplay === 'always' && rupees > 0) {
    return `+₹${formattedAbs}`;
  }

  return `₹${formattedAbs}`;
}

/**
 * Formats integer paise into a compact Indian notation (₹10k, ₹1.2L, ₹3Cr).
 * Safe for Y-axis ticks and tight chart labels.
 */
export function formatInrCompact(amountPaise: number): string {
  if (!Number.isFinite(amountPaise)) return '₹0';

  const isNeg = amountPaise < 0;
  const absRupees = Math.abs(amountPaise) / 100;

  let formatted: string;
  if (absRupees >= 1_00_00_000) {
    const cr = absRupees / 1_00_00_000;
    formatted = `${cr % 1 === 0 ? cr.toFixed(0) : cr.toFixed(1).replace(/\.0$/, '')}Cr`;
  } else if (absRupees >= 1_00_000) {
    const l = absRupees / 1_00_000;
    formatted = `${l % 1 === 0 ? l.toFixed(0) : l.toFixed(1).replace(/\.0$/, '')}L`;
  } else if (absRupees >= 1_000) {
    const k = absRupees / 1_000;
    formatted = `${k % 1 === 0 ? k.toFixed(0) : k.toFixed(1).replace(/\.0$/, '')}k`;
  } else {
    formatted = Math.round(absRupees).toString();
  }

  return `${isNeg ? '-' : ''}₹${formatted}`;
}

/**
 * Formats a date string (YYYY-MM-DD or ISO timestamp) into "29 Oct"
 * WITHOUT constructing a UTC Date object, avoiding timezone day-shifts.
 */
export function formatDateShort(dateStr: string): string {
  if (!dateStr || typeof dateStr !== 'string') return '';

  const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) {
    return dateStr;
  }

  const monthIdx = parseInt(match[2], 10) - 1;
  const day = parseInt(match[3], 10);
  const monthName = MONTH_NAMES[monthIdx] || match[2];

  return `${day} ${monthName}`;
}

/**
 * Format day ordinal using Intl.PluralRules (e.g. 1 -> "1st", 22 -> "22nd")
 */
export function formatDayOrdinal(day: number): string {
  if (!Number.isFinite(day)) return `${day}`;
  const pr = new Intl.PluralRules('en', { type: 'ordinal' });
  const rule = pr.select(day);
  switch (rule) {
    case 'one':
      return `${day}st`;
    case 'two':
      return `${day}nd`;
    case 'few':
      return `${day}rd`;
    default:
      return `${day}th`;
  }
}
