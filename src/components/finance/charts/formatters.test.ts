import { describe, it, expect } from 'vitest';
import {
  formatInr,
  formatInrCompact,
  formatDateShort,
  formatDayOrdinal,
} from './formatters';

describe('Finance Chart Formatters', () => {
  describe('formatInr (Lakh/Crore grouping)', () => {
    it('formats positive paise with Indian lakh grouping', () => {
      expect(formatInr(11178130)).toBe('₹1,11,781.30');
      expect(formatInr(811885)).toBe('₹8,118.85');
    });

    it('formats negative paise accurately', () => {
      expect(formatInr(-498495)).toBe('-₹4,984.95');
      expect(formatInr(-1000000)).toBe('-₹10,000.00');
    });

    it('formats zero paise', () => {
      expect(formatInr(0)).toBe('₹0.00');
    });

    it('honors signDisplay: always', () => {
      expect(formatInr(811885, { signDisplay: 'always' })).toBe('+₹8,118.85');
      expect(formatInr(-498495, { signDisplay: 'always' })).toBe('-₹4,984.95');
      expect(formatInr(0, { signDisplay: 'always' })).toBe('₹0.00');
    });
  });

  describe('formatInrCompact', () => {
    it('formats thousands as k', () => {
      expect(formatInrCompact(1000000)).toBe('₹10k');
      expect(formatInrCompact(2500000)).toBe('₹25k');
    });

    it('formats lakhs as L', () => {
      expect(formatInrCompact(12000000)).toBe('₹1.2L');
      expect(formatInrCompact(10000000)).toBe('₹1L');
    });

    it('formats crores as Cr', () => {
      expect(formatInrCompact(3_00_00_00_000)).toBe('₹3Cr');
      expect(formatInrCompact(1_50_00_00_000)).toBe('₹1.5Cr');
    });

    it('formats negative amounts compactly', () => {
      expect(formatInrCompact(-5000000)).toBe('-₹50k');
      expect(formatInrCompact(-12000000)).toBe('-₹1.2L');
    });

    it('formats sub-thousand rupees directly', () => {
      expect(formatInrCompact(95000)).toBe('₹950');
      expect(formatInrCompact(0)).toBe('₹0');
    });
  });

  describe('formatDateShort (No day shifts)', () => {
    it('formats YYYY-MM-DD string correctly', () => {
      expect(formatDateShort('2026-10-29')).toBe('29 Oct');
      expect(formatDateShort('2026-01-01')).toBe('1 Jan');
    });

    it('formats timestamp at 00:30 IST without day shift', () => {
      expect(formatDateShort('2026-10-30T00:30:00+05:30')).toBe('30 Oct');
      expect(formatDateShort('2026-10-30T00:05:00Z')).toBe('30 Oct');
    });
  });

  describe('formatDayOrdinal', () => {
    it('formats ordinals accurately via Intl.PluralRules', () => {
      expect(formatDayOrdinal(1)).toBe('1st');
      expect(formatDayOrdinal(2)).toBe('2nd');
      expect(formatDayOrdinal(3)).toBe('3rd');
      expect(formatDayOrdinal(4)).toBe('4th');
      expect(formatDayOrdinal(11)).toBe('11th');
      expect(formatDayOrdinal(12)).toBe('12th');
      expect(formatDayOrdinal(21)).toBe('21st');
      expect(formatDayOrdinal(22)).toBe('22nd');
      expect(formatDayOrdinal(23)).toBe('23rd');
      expect(formatDayOrdinal(30)).toBe('30th');
      expect(formatDayOrdinal(31)).toBe('31st');
    });
  });
});
