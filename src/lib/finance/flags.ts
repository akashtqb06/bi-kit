import { NextResponse } from 'next/server';

export type FinanceFeature =
  | 'overview'
  | 'transactions'
  | 'accounts'
  | 'setup'
  | 'budgets'
  | 'recurring'
  | 'import';

export const ALL_FINANCE_FEATURES: readonly FinanceFeature[] = [
  'overview',
  'transactions',
  'accounts',
  'setup',
  'budgets',
  'recurring',
  'import',
] as const;

/**
 * Features fully implemented and production-ready by default.
 * Defaults to: overview, transactions, accounts, import.
 */
export const DEFAULT_ENABLED_FEATURES: readonly FinanceFeature[] = [
  'overview',
  'transactions',
  'accounts',
  'setup',
  'import',
] as const;

export function getEnabledFinanceFeatures(): Set<FinanceFeature> {
  const envVal = process.env.FINANCE_FEATURES;
  if (!envVal || !envVal.trim()) {
    return new Set(DEFAULT_ENABLED_FEATURES);
  }
  const parsed = envVal
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter((s): s is FinanceFeature =>
      (ALL_FINANCE_FEATURES as readonly string[]).includes(s)
    );
  return new Set(parsed);
}

export function isFinanceFeatureEnabled(feature: FinanceFeature): boolean {
  return getEnabledFinanceFeatures().has(feature);
}

export function isAnyFinanceFeatureEnabled(): boolean {
  return getEnabledFinanceFeatures().size > 0;
}

/**
 * Helper to gate an API route. If the required feature is not enabled,
 * returns a 501 Not Implemented response; otherwise returns null.
 */
export function checkFeatureGatedApi(feature: FinanceFeature): NextResponse | null {
  if (!isFinanceFeatureEnabled(feature)) {
    return NextResponse.json(
      {
        error: 'not_implemented',
        feature,
        message: `Feature '${feature}' is currently disabled. Enable it in FINANCE_FEATURES.`,
      },
      { status: 501 }
    );
  }
  return null;
}

