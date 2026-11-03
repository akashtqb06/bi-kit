import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import {
  parsePfCsv,
  parsePfPortalText,
  computeReconciliation,
} from '../parser';
import { sanitizeSourceLabel, redactForLogs } from '../privacy';

describe('EPFO Passbook Parser & Privacy Tests', () => {
  const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
  const fixtureCsv = fs.readFileSync(fixturePath, 'utf8');

  it('parses epf-passbook-2026-27.csv and matches expected component totals', () => {
    const parsed = parsePfCsv(fixtureCsv);
    expect(parsed.rows.length).toBe(10);
    expect(parsed.unresolvedCount).toBe(0);

    const rec = computeReconciliation(parsed.rows);

    // Expected in rupees:
    // contributions: employee 31,360 / employer 23,472 / pension 7,888
    // In paise (* 100):
    expect(rec.contributions.employee).toBe(3136000);
    expect(rec.contributions.employer).toBe(2347200);
    expect(rec.contributions.pension).toBe(788800);

    // transfer-ins: employee 1,08,556 / employer 47,614 / pension 51,362
    expect(rec.transferIns.employee).toBe(10855600);
    expect(rec.transferIns.employer).toBe(4761400);
    expect(rec.transferIns.pension).toBe(5136200);

    // withdrawals: 0
    expect(rec.withdrawals.employee).toBe(0);
    expect(rec.withdrawals.employer).toBe(0);
    expect(rec.withdrawals.pension).toBe(0);

    // closing: employee 1,39,916 / employer 71,086 / pension 59,250
    expect(rec.closingBalance.employee).toBe(13991600);
    expect(rec.closingBalance.employer).toBe(7108600);
    expect(rec.closingBalance.pension).toBe(5925000);

    // PF balance (employee + employer) = 1,39,916 + 71,086 = 2,11,002 (21100200 paise)
    const pfBalance = rec.closingBalance.employee + rec.closingBalance.employer;
    expect(pfBalance).toBe(21100200);

    // EPS memo = 59,250 (5925000 paise)
    expect(rec.closingBalance.pension).toBe(5925000);
  });

  it('parses portal-style pasted text with ₹, lakh commas, and cut-off first column', () => {
    const portalSample = `
Particulars	EPF Wages	EPS Wages	Employee Share (12%)	Employer Share (3.67%)	Pension Share (8.33%)
Cont. for the Due-Month 202605	₹ 28,000	₹ 15,000	₹ 3,360	₹ 2,110	₹ 1,250
Cont. for the Due-Month 202606	₹ 46,667	₹ 15,000	₹ 5,600	₹ 4,350	₹ 1,250
TRANSFER CLAIM - PRINCIPAL AMOUNT | SOURCE MEMBER ID: MHBAN00012340000005944	-	-	₹ 13,932	₹ 4,257	₹ 7,500
TRANSFER CLAIM - INTEREST AMOUNT | SOURCE MEMBER ID: MHBAN0001234000000074	-	-	₹ 3,693	₹ 1,694	₹ 0
Total Contributions	₹ 74,667	₹ 30,000	₹ 8,960	₹ 6,460	₹ 2,500
Closing Balance	-	-	₹ 26,585	₹ 12,411	₹ 10,000
`;

    const parsed = parsePfPortalText(portalSample);
    expect(parsed.rows.length).toBe(4);
    expect(parsed.parsedTotals?.contributions?.employee).toBe(896000);
    expect(parsed.parsedTotals?.closingBalance?.employee).toBe(2658500);

    // Member ID privacy: reduced to last 4
    const transferPrincipal = parsed.rows.find((r) => r.entryKind === 'transfer_in_principal');
    expect(transferPrincipal?.sourceLabel).toBe('Previous account ending 5944');

    const transferInterest = parsed.rows.find((r) => r.entryKind === 'transfer_in_interest');
    expect(transferInterest?.sourceLabel).toBe('Previous account ending 0074');

    const rec = computeReconciliation(parsed.rows, parsed.parsedTotals);
    // Closing employee: 3360 + 5600 + 13932 + 3693 = 26585 (2658500 paise)
    expect(rec.isMatched).toBe(true);
  });

  it('flags unknown rows without dropping them silently', () => {
    const textWithUnknown = `
Cont. for the Due-Month 202605	₹ 28,000	₹ 15,000	₹ 3,360	₹ 2,110	₹ 1,250
Special Administrative Adjustment Row	₹ 0	₹ 0	₹ 1,000	₹ 500	₹ 200
`;
    const parsed = parsePfPortalText(textWithUnknown);
    expect(parsed.rows.length).toBe(2);
    expect(parsed.unresolvedCount).toBe(1);

    const unknownRow = parsed.rows[1];
    expect(unknownRow.requiresClassification).toBe(true);
    expect(unknownRow.employeeAmount).toBe(100000);
  });

  it('detects reconciliation totals mismatch and reports diff per component', () => {
    const mismatchText = `
Cont. for the Due-Month 202605	₹ 28,000	₹ 15,000	₹ 3,360	₹ 2,110	₹ 1,250
Total Contributions	₹ 28,000	₹ 15,000	₹ 5,000	₹ 2,110	₹ 1,250
Closing Balance	-	-	₹ 5,000	₹ 2,110	₹ 1,250
`;
    const parsed = parsePfPortalText(mismatchText);
    const rec = computeReconciliation(parsed.rows, parsed.parsedTotals);

    expect(rec.isMatched).toBe(false);
    expect(rec.diff).toBeDefined();
    // Actual closing employee = 3,360; parsed closing = 5,000 => diff = -1,640 (-164000 paise)
    expect(rec.diff?.employee).toBe(-164000);
  });

  it('redacts full member IDs and amounts from error logs', () => {
    const rawError = 'Failed parsing row MHBAN00012340000005944 with amount ₹ 1,08,556';
    const redacted = redactForLogs(rawError);

    expect(redacted).not.toContain('MHBAN00012340000005944');
    expect(redacted).not.toContain('1,08,556');
    expect(redacted).toContain('[REDACTED_ID]');
    expect(redacted).toContain('[REDACTED_AMOUNT]');
  });

  it('properly reduces source member ID to last 4 only', () => {
    expect(sanitizeSourceLabel('MEMBER ID: MHBAN00012340000005944')).toBe('Previous account ending 5944');
    expect(sanitizeSourceLabel('SOURCE MEMBER ID: 100000074')).toBe('Previous account ending 0074');
    expect(sanitizeSourceLabel('Previous account ending 5944')).toBe('Previous account ending 5944');
  });
});
