import { describe, it, expect } from 'vitest';
import { formatINR, paiseToRupees, rupeesToPaise, formatPercent } from './format';

describe('INR Formatting and Currency Utilities', () => {
  it('converts between paise and rupees accurately', () => {
    expect(paiseToRupees(100)).toBe(1);
    expect(paiseToRupees(12345)).toBe(123.45);
    expect(rupeesToPaise(1)).toBe(100);
    expect(rupeesToPaise(123.45)).toBe(12345);
    expect(rupeesToPaise(250)).toBe(25000);
  });

  it('formats zero and small amounts', () => {
    expect(formatINR(0)).toBe('₹0');
    expect(formatINR(5000)).toBe('₹50');
    expect(formatINR(5050)).toBe('₹50.50');
  });

  it('formats lakhs and crores with Indian grouping', () => {
    // 1 Lakh rupees = 10,000,000 paise
    expect(formatINR(10000000)).toBe('₹1,00,000');
    // 10 Lakhs = 1,00,00,000 rupees = 1,000,000,000 paise
    expect(formatINR(100000000)).toBe('₹10,00,000');
    // 1 Crore rupees = 1,00,00,000 rupees
    expect(formatINR(1000000000)).toBe('₹1,00,00,000');
  });

  it('handles negative values appropriately', () => {
    expect(formatINR(-4250000)).toBe('-₹42,500');
    expect(formatINR(-150000, { signDisplay: 'always' })).toBe('-₹1,500');
  });

  it('handles positive sign display when requested', () => {
    expect(formatINR(500000, { signDisplay: 'always' })).toBe('+₹5,000');
  });

  it('supports compact notation for large numbers', () => {
    expect(formatINR(15000000, { compact: true })).toBe('₹1.50 L');
    expect(formatINR(2500000000, { compact: true })).toBe('₹2.50 Cr');
    expect(formatINR(5000000, { compact: true })).toBe('₹50.0 K');
  });

  it('formats percent correctly', () => {
    expect(formatPercent(14.5)).toBe('14.5%');
    expect(formatPercent(5.2, true)).toBe('+5.2%');
    expect(formatPercent(-3.4, true)).toBe('-3.4%');
  });
});
