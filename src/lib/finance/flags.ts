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
  'recurring',
  'import',
] as const;

export function enabledFeatures(): Set<FinanceFeature> {
  const envVal =
    (typeof process !== 'undefined' &&
      (process.env.NEXT_PUBLIC_FINANCE_FEATURES || process.env.FINANCE_FEATURES)) ||
    '';
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

export const getEnabledFinanceFeatures = enabledFeatures;

export function isFeatureEnabled(feature: FinanceFeature): boolean {
  return enabledFeatures().has(feature);
}

export const isFinanceFeatureEnabled = isFeatureEnabled;

export function isAnyFinanceFeatureEnabled(): boolean {
  return enabledFeatures().size > 0;
}

/**
 * Helper to gate an API route. If the required feature is not enabled,
 * returns a 501 Not Implemented response; otherwise returns null.
 */
export function checkFeatureGatedApi(feature: FinanceFeature): NextResponse | null {
  if (!isFeatureEnabled(feature)) {
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

