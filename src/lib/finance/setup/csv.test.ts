import { describe, it, expect } from 'vitest';
import {
  parseAccountsCSV,
  normalizeDate,
  getCSVTemplateContent,
} from './csv';

describe('Setup CSV Parser', () => {
  it('parses standard template CSV with all account kinds without errors', () => {
    const template = getCSVTemplateContent();
    const result = parseAccountsCSV(template);

    expect(result.errors).toHaveLength(0);
    expect(result.accounts.length).toBeGreaterThanOrEqual(8);

    const cash = result.accounts.find((a) => a.kind === 'cash');
    expect(cash).toBeDefined();
    expect(cash?.name).toBe('Main Cash');
    expect(cash?.balancePaise).toBe(500000); // ₹5,000

    const card = result.accounts.find((a) => a.kind === 'credit_card');
    expect(card).toBeDefined();
    expect(card?.owedPaise).toBe(1500000); // ₹15,000
    expect(card?.balancePaise).toBe(-1500000);
    expect(card?.creditLimitPaise).toBe(20000000); // ₹2,00,000
    expect(card?.statementDay).toBe(15);
    expect(card?.dueDay).toBe(5);

    const fd = result.accounts.find((a) => a.kind === 'fixed_deposit');
    expect(fd).toBeDefined();
    expect(fd?.principalPaise).toBe(10000000); // ₹1,00,000
    expect(fd?.interestRate).toBe(7.1);
    expect(fd?.compoundingFrequency).toBe('quarterly');

    const mf = result.accounts.find((a) => a.kind === 'mutual_fund');
    expect(mf).toBeDefined();
    expect(mf?.currentValuePaise).toBe(35000000); // ₹3,50,000
    expect(mf?.totalInvestedPaise).toBe(28000000); // ₹2,80,000
  });

  it('handles currency symbols, commas, and Indian lakh grouping', () => {
    const csv = `Name,Kind,Balance
HDFC Bank,bank,"₹ 1,25,000.50"
Wallet,cash,"₹ 5,00,000"
Savings,bank,"12,50,000"
`;
    const result = parseAccountsCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.accounts).toHaveLength(3);

    expect(result.accounts[0].balancePaise).toBe(12500050); // 1,25,000.50
    expect(result.accounts[1].balancePaise).toBe(50000000); // 5,00,000
    expect(result.accounts[2].balancePaise).toBe(125000000); // 12,50,000
  });

  it('handles accounting parentheses for negative values', () => {
    const csv = `Name,Kind,Balance
Overdraft,bank,"(1,500.00)"
Loan Acc,loan,"(4,50,000)"
`;
    const result = parseAccountsCSV(csv);
    expect(result.errors).toHaveLength(0);
    expect(result.accounts).toHaveLength(2);

    expect(result.accounts[0].balancePaise).toBe(-150000);
    expect(result.accounts[1].owedPaise).toBe(45000000);
    expect(result.accounts[1].balancePaise).toBe(-45000000);
  });

  it('flags missing required columns (Name and Kind)', () => {
    const csv = `Balance,Amount
1000,500
`;
    const result = parseAccountsCSV(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].message).toContain('Missing required column');
    expect(result.accounts).toHaveLength(0);
  });

  it('flags invalid account kinds and provides row-level errors', () => {
    const csv = `Name,Kind,Balance
Test Account,crypto_wallet,5000
Valid Cash,cash,2000
`;
    const result = parseAccountsCSV(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain('Invalid account kind "crypto_wallet"');
    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].name).toBe('Valid Cash');
  });

  it('validates dates and flags bad date formats', () => {
    const csv = `Name,Kind,Start Date,Maturity Date
FD Bad Date,fixed_deposit,not-a-date,2027-01-01
FD Good Date,fixed_deposit,2026-01-01,15/01/2027
`;
    const result = parseAccountsCSV(csv);
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].row).toBe(2);
    expect(result.errors[0].message).toContain('Invalid start date');

    expect(result.accounts).toHaveLength(1);
    expect(result.accounts[0].startDate).toBe('2026-01-01');
    expect(result.accounts[0].maturityDate).toBe('2027-01-15');
  });

  it('normalizes various date formats', () => {
    expect(normalizeDate('2026-10-29')).toBe('2026-10-29');
    expect(normalizeDate('29-10-2026')).toBe('2026-10-29');
    expect(normalizeDate('29/10/2026')).toBe('2026-10-29');
    expect(normalizeDate('2026/10/29')).toBe('2026-10-29');
    expect(normalizeDate('invalid')).toBeNull();
  });
});
