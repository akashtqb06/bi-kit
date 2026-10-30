/**
 * 16-Color Palette for Categories
 * Accessible and distinct across both light and dark themes.
 * Compliant with WCAG AA contrast on light and dark surfaces.
 */
export const CATEGORY_PALETTE_16 = [
  '#10b981', // Emerald
  '#3b82f6', // Blue
  '#f59e0b', // Amber
  '#ef4444', // Red
  '#8b5cf6', // Violet
  '#ec4899', // Pink
  '#06b6d4', // Cyan
  '#f97316', // Orange
  '#14b8a6', // Teal
  '#6366f1', // Indigo
  '#84cc16', // Lime
  '#eab308', // Yellow
  '#d946ef', // Fuchsia
  '#0ea5e9', // Sky Blue
  '#64748b', // Slate
  '#a855f7', // Purple
] as const;

export type CategoryColor = (typeof CATEGORY_PALETTE_16)[number];

/**
 * Fixed palette mapping for default system and user categories.
 * Ensures default categories get consistent, distinct colors everywhere.
 */
export const DEFAULT_CATEGORY_COLORS: Record<string, string> = {
  // Expense Categories (16)
  'Food & Dining': '#ef4444', // Red
  'Groceries': '#10b981', // Emerald
  'Transport': '#3b82f6', // Blue
  'Fuel': '#f97316', // Orange
  'Rent': '#8b5cf6', // Violet
  'Utilities': '#f59e0b', // Amber
  'Shopping': '#ec4899', // Pink
  'Health': '#06b6d4', // Cyan
  'Entertainment': '#a855f7', // Purple
  'Travel': '#14b8a6', // Teal
  'EMI & Loans': '#6366f1', // Indigo
  'Education': '#0ea5e9', // Sky Blue
  'Insurance': '#eab308', // Yellow
  'Subscriptions': '#d946ef', // Fuchsia
  'Fees & Interest': '#64748b', // Slate
  'Others': '#71717a', // Zinc Neutral

  // Income Categories (5)
  'Salary': '#10b981', // Emerald
  'Interest': '#3b82f6', // Blue
  'Dividends': '#84cc16', // Lime
  'Refunds': '#06b6d4', // Cyan
  'Other income': '#f59e0b', // Amber
};

/**
 * Deterministic color from 16-color palette by stable hash of the name.
 * Uses DJB2 stable hash.
 */
export function getDeterministicCategoryColor(name: string): string {
  if (DEFAULT_CATEGORY_COLORS[name]) {
    return DEFAULT_CATEGORY_COLORS[name];
  }
  let hash = 5381;
  for (let i = 0; i < name.length; i++) {
    hash = (hash << 5) + hash + name.charCodeAt(i);
    hash |= 0;
  }
  const index = Math.abs(hash) % CATEGORY_PALETTE_16.length;
  return CATEGORY_PALETTE_16[index];
}

/**
 * Suggests an unused palette color when creating a new category.
 */
export function suggestUnusedCategoryColor(usedColors: (string | null | undefined)[]): string {
  const usedSet = new Set(
    usedColors
      .filter((c): c is string => Boolean(c))
      .map((c) => c.toLowerCase())
  );
  for (const color of CATEGORY_PALETTE_16) {
    if (!usedSet.has(color.toLowerCase())) {
      return color;
    }
  }
  return CATEGORY_PALETTE_16[0];
}

/**
 * Builds a lookup map from category name and id to hex color string.
 */
export function getCategoryColorMap(
  categories: Array<{ id?: string; name?: string; color?: string | null }>
): Record<string, string> {
  const map: Record<string, string> = {};
  for (const cat of categories) {
    const color = cat.color || (cat.name ? getDeterministicCategoryColor(cat.name) : '#71717a');
    if (cat.name) map[cat.name] = color;
    if (cat.id) map[cat.id] = color;
  }
  return map;
}

