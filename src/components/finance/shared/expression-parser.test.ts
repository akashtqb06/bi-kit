import { describe, it, expect } from 'vitest';
import { parseAmountExpression } from './expression-parser';

describe('Amount Expression Parser', () => {
  it('parses simple numbers', () => {
    const res = parseAmountExpression('250');
    expect(res.isValid).toBe(true);
    expect(res.result).toBe(250);
    expect(res.paise).toBe(25000);
    expect(res.formatted).toBe('250.00');
  });

  it('parses simple addition like 250+40', () => {
    const res = parseAmountExpression('250+40');
    expect(res.isValid).toBe(true);
    expect(res.result).toBe(290);
    expect(res.paise).toBe(29000);
  });

  it('parses subtraction, multiplication, and division', () => {
    expect(parseAmountExpression('500 - 50').result).toBe(450);
    expect(parseAmountExpression('120 * 3').result).toBe(360);
    expect(parseAmountExpression('120 x 3').result).toBe(360);
    expect(parseAmountExpression('1000 / 4').result).toBe(250);
  });

  it('respects operator precedence: 10 + 20 * 3 = 70', () => {
    const res = parseAmountExpression('10 + 20 * 3');
    expect(res.result).toBe(70);
  });

  it('handles parentheses: (10 + 20) * 3 = 90', () => {
    const res = parseAmountExpression('(10 + 20) * 3');
    expect(res.result).toBe(90);
  });

  it('handles decimals: 45.5 + 4.5 = 50.0', () => {
    const res = parseAmountExpression('45.5 + 4.5');
    expect(res.result).toBe(50);
    expect(res.paise).toBe(5000);
  });

  it('handles incomplete expressions gracefully while typing', () => {
    const res1 = parseAmountExpression('250+');
    expect(res1.isValid).toBe(false);
    expect(res1.error).toBe('Incomplete expression');

    const res2 = parseAmountExpression('(10 + 20');
    expect(res2.isValid).toBe(false);
    expect(res2.error).toBe('Mismatched parentheses');
  });

  it('detects division by zero', () => {
    const res = parseAmountExpression('100 / 0');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Division by zero');
  });

  it('rejects invalid characters', () => {
    const res = parseAmountExpression('100 + abc');
    expect(res.isValid).toBe(false);
    expect(res.error).toBe('Invalid characters in expression');
  });
});
