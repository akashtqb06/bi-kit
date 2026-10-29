import { nanoid } from 'nanoid';
import type { CategorizationRule } from './types';
import type { CategoryDTO } from '../contract';

export const DEFAULT_KEYWORD_CATEGORY_MAP: Record<string, string> = {
  // Food & Dining
  swiggy: 'Food & Dining',
  zomato: 'Food & Dining',
  starbucks: 'Food & Dining',
  'chai point': 'Food & Dining',
  mcdonalds: 'Food & Dining',
  restaurant: 'Food & Dining',
  brewpub: 'Food & Dining',
  toit: 'Food & Dining',

  // Groceries
  supermarket: 'Groceries',
  groceries: 'Groceries',
  billa: 'Groceries',
  'nature basket': 'Groceries',
  kirana: 'Groceries',
  bigbasket: 'Groceries',
  blinkit: 'Groceries',
  zepto: 'Groceries',
  instamart: 'Groceries',

  // Transport & Travel
  uber: 'Transport',
  ola: 'Transport',
  metro: 'Transport',
  indigo: 'Travel',
  'flight ticket': 'Travel',
  irctc: 'Travel',

  // Fuel
  shell: 'Fuel',
  petrol: 'Fuel',
  fuel: 'Fuel',
  hpcl: 'Fuel',
  bpcl: 'Fuel',

  // Rent & Housing
  'house rent': 'Rent',
  rent: 'Rent',
  wework: 'Rent',
  coworking: 'Rent',

  // Utilities
  bescom: 'Utilities',
  electricity: 'Utilities',
  broadband: 'Utilities',
  airtel: 'Utilities',
  jio: 'Utilities',

  // Shopping
  amazon: 'Shopping',
  flipkart: 'Shopping',
  'apple store': 'Shopping',
  myntra: 'Shopping',

  // Health
  apollo: 'Health',
  pharmacy: 'Health',
  hospital: 'Health',

  // Subscriptions & Entertainment
  netflix: 'Subscriptions',
  spotify: 'Subscriptions',
  'google cloud': 'Subscriptions',
  hosting: 'Subscriptions',
  bookmyshow: 'Entertainment',

  // Loans & Education
  'home finance': 'EMI & Loans',
  emi: 'EMI & Loans',
  loan: 'EMI & Loans',
  tuition: 'Education',
  school: 'Education',

  // Income
  salary: 'Salary',
  payout: 'Salary',
  retainer: 'Salary',
  refund: 'Refunds',
  dividend: 'Dividends',
  interest: 'Interest',
};

/**
 * Builds rules from the default keyword mapping matched against available system categories.
 */
export function buildDefaultRules(categories: CategoryDTO[]): CategorizationRule[] {
  const categoryMap = new Map<string, { id: string; type: 'expense' | 'income' }>();
  for (const cat of categories) {
    categoryMap.set(cat.name.toLowerCase().trim(), { id: cat.id, type: cat.type });
  }

  const rules: CategorizationRule[] = [];
  for (const [kw, catName] of Object.entries(DEFAULT_KEYWORD_CATEGORY_MAP)) {
    const cat = categoryMap.get(catName.toLowerCase().trim());
    if (cat) {
      rules.push({
        id: `rule-default-${kw.replace(/\s+/g, '-')}`,
        keyword: kw,
        categoryId: cat.id,
        categoryType: cat.type,
      });
    }
  }

  return rules;
}

/**
 * Learns categorization rules by inspecting existing transactions.
 * Extracts payees or frequent narration keywords mapped to user-assigned categories.
 */
export function learnRulesFromTransactions(
  transactions: Array<{
    payee?: string | null;
    note?: string | null;
    categoryId?: string | null;
  }>,
  existingRules: CategorizationRule[] = []
): CategorizationRule[] {
  const seenKeywords = new Set(existingRules.map((r) => r.keyword.toLowerCase().trim()));
  const learned: CategorizationRule[] = [...existingRules];

  const payeeCategoryTally = new Map<string, Map<string, number>>();

  for (const tx of transactions) {
    if (!tx.categoryId) continue;
    const payee = tx.payee?.trim().toLowerCase();
    if (!payee || payee.length < 3) continue;

    if (!payeeCategoryTally.has(payee)) {
      payeeCategoryTally.set(payee, new Map());
    }
    const tally = payeeCategoryTally.get(payee)!;
    tally.set(tx.categoryId, (tally.get(tx.categoryId) || 0) + 1);
  }

  // Pick dominant category for each learned payee
  for (const [payee, tally] of payeeCategoryTally.entries()) {
    if (seenKeywords.has(payee)) continue;

    let bestCatId = '';
    let bestCount = 0;
    for (const [catId, count] of tally.entries()) {
      if (count > bestCount) {
        bestCount = count;
        bestCatId = catId;
      }
    }

    if (bestCatId) {
      learned.push({
        id: `rule-learned-${nanoid(8)}`,
        keyword: payee,
        categoryId: bestCatId,
      });
      seenKeywords.add(payee);
    }
  }

  return learned;
}

/**
 * Suggests a category for a transaction description by evaluating user & default rules.
 * If txType ('income' | 'expense') is provided, rules matching the transaction's direction
 * are given priority. Longer, more specific keyword matches are given precedence.
 */
export function suggestCategory(
  description: string,
  rules: CategorizationRule[],
  txType?: 'expense' | 'income' | 'adjustment'
): { categoryId: string; matchedKeyword: string } | null {
  if (!description) return null;
  const lower = description.toLowerCase();

  // Sort rules: matching transaction direction first, then by keyword length descending
  const sorted = [...rules].sort((a, b) => {
    if (txType && a.categoryType && b.categoryType) {
      const aMatchesType = a.categoryType === txType;
      const bMatchesType = b.categoryType === txType;
      if (aMatchesType !== bMatchesType) {
        return aMatchesType ? -1 : 1;
      }
    }
    return b.keyword.length - a.keyword.length;
  });

  for (const rule of sorted) {
    const kw = rule.keyword.toLowerCase().trim();
    if (!kw) continue;

    // Check if substring exists in description
    if (lower.includes(kw)) {
      return {
        categoryId: rule.categoryId,
        matchedKeyword: rule.keyword,
      };
    }
  }

  return null;
}
