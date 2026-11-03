/**
 * Privacy and redaction utilities for EPFO member passbook data.
 *
 * Rules:
 * - Never store the full member ID, UAN, or any PF/PPF account number.
 * - Source IDs found in pasted text are reduced to their last 4 characters before anything is saved, logged or returned.
 * - The raw pasted text is never stored.
 * - Redact amounts and IDs from error logs.
 */

// Pattern for typical EPFO Member IDs (e.g. MHBAN00012340000005944 or similar alphanumeric IDs >= 10 chars)
// or patterns explicitly following "MEMBER ID:" or "UAN:"
const MEMBER_ID_REGEX = /(?:SOURCE\s+MEMBER\s+ID|MEMBER\s+ID|UAN)[\s:]*([A-Za-z0-9/_-]{8,})/i;
const LONG_ID_REGEX = /\b[A-Z]{2}[A-Z0-9]{3,5}[0-9]{7,}\b/g;

/**
 * Sanitizes a source member ID or description text to display only the last 4 characters.
 * Example:
 * "TRANSFER CLAIM - PRINCIPAL AMOUNT | SOURCE MEMBER ID: MHBAN00012340000005944"
 * => "Previous account ending 5944"
 */
export function sanitizeSourceLabel(rawLabel?: string | null): string {
  if (!rawLabel) return '';

  const trimmed = rawLabel.trim();
  if (!trimmed) return '';

  // Check if it already ends with "ending XXXX"
  if (/ending\s+[A-Za-z0-9]{4}$/i.test(trimmed)) {
    return trimmed;
  }

  // Check for explicit member ID pattern
  const memberMatch = trimmed.match(MEMBER_ID_REGEX);
  if (memberMatch && memberMatch[1]) {
    const fullId = memberMatch[1].replace(/[^A-Za-z0-9]/g, '');
    const last4 = fullId.slice(-4);
    return `Previous account ending ${last4}`;
  }

  // Check for general long alphanumeric ID
  const longMatches = Array.from(trimmed.matchAll(LONG_ID_REGEX));
  if (longMatches.length > 0 && longMatches[0][0]) {
    const fullId = longMatches[0][0];
    const last4 = fullId.slice(-4);
    return `Previous account ending ${last4}`;
  }

  // If there are digits in the label, extract the last 4 digits
  const digitMatches = trimmed.match(/\d{4,}/g);
  if (digitMatches && digitMatches.length > 0) {
    const lastMatch = digitMatches[digitMatches.length - 1];
    const last4 = lastMatch.slice(-4);
    return `Previous account ending ${last4}`;
  }

  // Fallback: strip any words longer than 6 alphanumeric characters and return safe label
  return trimmed.replace(/[A-Za-z0-9]{7,}/g, '[REDACTED]');
}

/**
 * Redacts IDs (10+ characters) and potential sensitive numeric amounts from log messages.
 */
export function redactForLogs(input: string): string {
  if (!input) return '';
  return input
    .replace(/(?:MEMBER\s+ID|UAN)[\s:]*[A-Za-z0-9/_-]+/gi, '[REDACTED_ID]')
    .replace(/\b[A-Z0-9]{10,}\b/g, '[REDACTED_ID]')
    .replace(/(?:₹|Rs\.?)\s*[0-9,]+(?:\.[0-9]+)?/gi, '[REDACTED_AMOUNT]')
    .replace(/\b\d{5,}\b/g, '[REDACTED_NUM]');
}

