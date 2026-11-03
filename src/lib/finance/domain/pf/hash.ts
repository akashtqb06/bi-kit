import { createHash } from 'crypto';
import type { PfEntryKind } from '../../contract';

export interface PassbookKeyInput {
  entryKind: PfEntryKind;
  periodMonth?: string | null;
  sourceLabel?: string | null;
  employeeAmount: number; // in integer paise
  employerAmount: number; // in integer paise
  pensionAmount: number;  // in integer paise
}

/**
 * Generates a deterministic hash for passbook entries to ensure idempotent imports.
 * Passbook key is unique per account, hashing:
 * entryKind + periodMonth + sourceLabel + employeeAmount + employerAmount + pensionAmount
 */
export function generatePassbookKey(input: PassbookKeyInput): string {
  const normKind = input.entryKind.trim().toLowerCase();
  const normPeriod = (input.periodMonth || '').trim();
  const normSource = (input.sourceLabel || '').trim().toLowerCase();
  const emp = Math.round(input.employeeAmount);
  const emplyr = Math.round(input.employerAmount);
  const pen = Math.round(input.pensionAmount);

  const raw = `${normKind}|${normPeriod}|${normSource}|${emp}|${emplyr}|${pen}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 32);
}

