import fs from 'node:fs';
import path from 'node:path';
import { describe, it, expect } from 'vitest';

const CSV_DIR = path.resolve(process.cwd(), 'fixtures/finance/csv');

describe('CSV Fixtures Parse Sanity Tests', () => {
  it('parses HDFC statement with debit/credit columns and thousands separators', () => {
    const raw = fs.readFileSync(path.join(CSV_DIR, 'hdfc_statement.csv'), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBeGreaterThan(5);

    const header = lines[0];
    expect(header).toContain('Withdrawal Amt.');
    expect(header).toContain('Deposit Amt.');

    // Parse data rows
    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      // Handle quoted commas
      const matches = line.match(/(".*?"|[^",\s]+)(?=\s*,|\s*$)/g);
      expect(matches).toBeDefined();
    }
  });

  it('parses ICICI statement with single signed amount column and ISO dates', () => {
    const raw = fs.readFileSync(path.join(CSV_DIR, 'icici_statement.csv'), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBeGreaterThan(4);

    const header = lines[0].split(',');
    expect(header).toContain('Transaction Date');
    expect(header).toContain('Amount');

    for (let i = 1; i < lines.length; i++) {
      const [dateStr, , amountStr] = lines[i].split(',');
      expect(dateStr).toMatch(/^\d{4}-\d{2}-\d{2}$/);
      const num = parseFloat(amountStr);
      expect(Number.isFinite(num)).toBe(true);
    }
  });

  it('handles SBI statement with noisy narrations, duplicates, and malformed rows', () => {
    const raw = fs.readFileSync(path.join(CSV_DIR, 'sbi_noisy_statement.csv'), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBeGreaterThan(5);

    let duplicatesFound = 0;
    let malformedFound = 0;
    const seen = new Set<string>();

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      if (seen.has(line)) {
        duplicatesFound++;
      }
      seen.add(line);

      if (line.includes('INVALID_MALFORMED_LINE_CORRUPTED_RECORD') || line.includes('N/A')) {
        malformedFound++;
      }
    }

    expect(duplicatesFound).toBeGreaterThanOrEqual(1);
    expect(malformedFound).toBeGreaterThanOrEqual(1);
  });

  it('handles Axis statement with UTF-8 BOM cleanly', () => {
    const rawBuffer = fs.readFileSync(path.join(CSV_DIR, 'axis_utf8_bom_statement.csv'));
    // Verify BOM bytes: 0xEF, 0xBB, 0xBF
    expect(rawBuffer[0]).toBe(0xef);
    expect(rawBuffer[1]).toBe(0xbb);
    expect(rawBuffer[2]).toBe(0xbf);

    const rawStr = rawBuffer.toString('utf8');
    // Stripping BOM
    const cleanStr = rawStr.charCodeAt(0) === 0xfeff ? rawStr.slice(1) : rawStr;
    const lines = cleanStr.trim().split('\n');
    expect(lines[0].startsWith('Date,Transaction Details')).toBe(true);
  });

  it('parses Credit Card statement with purchases and payments', () => {
    const raw = fs.readFileSync(path.join(CSV_DIR, 'credit_card_statement.csv'), 'utf8');
    const lines = raw.trim().split('\n');
    expect(lines.length).toBeGreaterThan(4);

    const header = lines[0];
    expect(header).toContain('Transaction Date');
    expect(header).toContain('Posting Date');
    expect(header).toContain('Amount');

    // Find payment row
    const paymentLine = lines.find((l) => l.includes('-8839') || l.includes('PAYMENT RECEIVED'));
    expect(paymentLine).toBeDefined();
  });
});

