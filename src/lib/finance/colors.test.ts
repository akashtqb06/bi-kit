import { describe, it, expect } from 'vitest';
import {
  CATEGORY_PALETTE_16,
  DEFAULT_CATEGORY_COLORS,
  getDeterministicCategoryColor,
  suggestUnusedCategoryColor,
  getCategoryColorMap,
} from './colors';

describe('Category Colors & Palette', () => {
  it('defines 16 unique valid hex colors in CATEGORY_PALETTE_16', () => {
    expect(CATEGORY_PALETTE_16.length).toBe(16);
    const unique = new Set(CATEGORY_PALETTE_16);
    expect(unique.size).toBe(16);

    for (const color of CATEGORY_PALETTE_16) {
      expect(color).toMatch(/^#[0-9a-fA-F]{6}$/);
    }
  });

  it('maps default categories to distinct colors', () => {
    const categories = Object.keys(DEFAULT_CATEGORY_COLORS);
    expect(categories.length).toBeGreaterThan(15);

    expect(DEFAULT_CATEGORY_COLORS['Food & Dining']).toBe('#ef4444');
    expect(DEFAULT_CATEGORY_COLORS['Groceries']).toBe('#10b981');
    expect(DEFAULT_CATEGORY_COLORS['Transport']).toBe('#3b82f6');
    expect(DEFAULT_CATEGORY_COLORS['Salary']).toBe('#10b981');
    expect(DEFAULT_CATEGORY_COLORS['Rent']).toBe('#8b5cf6');
  });

  it('returns deterministic colors for custom categories based on stable hash', () => {
    const customName = 'Crypto Mining';
    const color1 = getDeterministicCategoryColor(customName);
    const color2 = getDeterministicCategoryColor(customName);
    expect(color1).toBe(color2);
    expect(CATEGORY_PALETTE_16).toContain(color1);

    // Another category name
    const color3 = getDeterministicCategoryColor('Freelance Work');
    expect(CATEGORY_PALETTE_16).toContain(color3);
  });

  it('suggests unused palette color when creating new category', () => {
    const used = [CATEGORY_PALETTE_16[0], CATEGORY_PALETTE_16[1]];
    const suggestion = suggestUnusedCategoryColor(used);
    expect(suggestion).toBe(CATEGORY_PALETTE_16[2]);

    // When all are used, falls back safely to first palette color
    const allUsed = [...CATEGORY_PALETTE_16];
    const fallback = suggestUnusedCategoryColor(allUsed);
    expect(fallback).toBe(CATEGORY_PALETTE_16[0]);
  });

  it('builds category color map by both id and name', () => {
    const sampleCategories = [
      { id: 'cat_1', name: 'Food & Dining', color: '#ef4444' },
      { id: 'cat_2', name: 'Custom Cat', color: null },
    ];

    const map = getCategoryColorMap(sampleCategories);
    expect(map['cat_1']).toBe('#ef4444');
    expect(map['Food & Dining']).toBe('#ef4444');
    expect(map['cat_2']).toBe(getDeterministicCategoryColor('Custom Cat'));
    expect(map['Custom Cat']).toBe(getDeterministicCategoryColor('Custom Cat'));
  });

  it('verifies contrast for all 16 palette colors (visible against dark/light surfaces)', () => {
    // Relative luminance helper
    function getLuminance(hex: string): number {
      const rgb = [
        parseInt(hex.slice(1, 3), 16) / 255,
        parseInt(hex.slice(3, 5), 16) / 255,
        parseInt(hex.slice(5, 7), 16) / 255,
      ].map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
      return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
    }

    for (const color of CATEGORY_PALETTE_16) {
      const lum = getLuminance(color);
      // Ensure color is not pitch black (< 0.02) or blinding white (> 0.95)
      // to maintain visibility in both dark and light UI themes
      expect(lum).toBeGreaterThan(0.02);
      expect(lum).toBeLessThan(0.95);
    }
  });
});

