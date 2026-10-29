/**
 * Finance Service Implementation Coverage Checker
 * Compares FinanceService methods vs DbFinanceService and MockFinanceService implementations.
 */

import { DbFinanceService } from '../src/lib/finance/db-service';
import { MockFinanceService } from '../src/lib/finance/mock-service';

interface MethodMeta {
  feature: string;
  name: string;
}

const FINANCE_METHODS: MethodMeta[] = [
  // Accounts
  { feature: 'accounts', name: 'listAccounts' },
  { feature: 'accounts', name: 'getAccount' },
  { feature: 'accounts', name: 'createAccount' },
  { feature: 'accounts', name: 'updateAccount' },
  { feature: 'accounts', name: 'deleteAccount' },
  // Categories
  { feature: 'accounts', name: 'listCategories' },
  { feature: 'accounts', name: 'getCategory' },
  { feature: 'accounts', name: 'createCategory' },
  { feature: 'accounts', name: 'updateCategory' },
  { feature: 'accounts', name: 'deleteCategory' },
  // Transactions
  { feature: 'transactions', name: 'listTransactions' },
  { feature: 'transactions', name: 'getTransaction' },
  { feature: 'transactions', name: 'createTransaction' },
  { feature: 'transactions', name: 'updateTransaction' },
  { feature: 'transactions', name: 'deleteTransaction' },
  // Valuations
  { feature: 'accounts', name: 'listValuations' },
  { feature: 'accounts', name: 'createValuation' },
  // Budgets
  { feature: 'budgets', name: 'listBudgets' },
  { feature: 'budgets', name: 'getBudget' },
  { feature: 'budgets', name: 'createBudget' },
  { feature: 'budgets', name: 'updateBudget' },
  { feature: 'budgets', name: 'deleteBudget' },
  // Recurring
  { feature: 'recurring', name: 'listRecurringRules' },
  { feature: 'recurring', name: 'getRecurringRule' },
  { feature: 'recurring', name: 'createRecurringRule' },
  { feature: 'recurring', name: 'updateRecurringRule' },
  { feature: 'recurring', name: 'deleteRecurringRule' },
  // Overview / Stats
  { feature: 'overview', name: 'getOverviewStats' },
  { feature: 'overview', name: 'getNetWorthHistory' },
  // Cron Automation
  { feature: 'recurring', name: 'processRecurringRules' },
  { feature: 'accounts', name: 'snapshotValuations' },
];

function checkImplementation(
  instance: Record<string, unknown>,
  method: string
): 'Implemented' | 'Stub (501)' | 'Missing' {
  const fn = instance[method];
  if (typeof fn !== 'function') {
    return 'Missing';
  }
  const source = fn.toString();
  if (source.includes('NotImplementedError')) {
    return 'Stub (501)';
  }
  return 'Implemented';
}

function pad(str: string, length: number): string {
  return str.padEnd(length, ' ');
}

export function generateCoverageReport(): void {
  const dbService = new DbFinanceService() as unknown as Record<string, unknown>;
  const mockService = new MockFinanceService() as unknown as Record<string, unknown>;

  console.log('\n========================================================================================');
  console.log('                           FinanceService Implementation Matrix                          ');
  console.log('========================================================================================\n');

  const colMethod = 28;
  const colDb = 18;
  const colMock = 18;
  const colFeature = 14;

  const header = `| ${pad('Method', colMethod)} | ${pad('DbFinanceService', colDb)} | ${pad('MockFinanceService', colMock)} | ${pad('Feature', colFeature)} |`;
  const separator = `+${'-'.repeat(colMethod + 2)}+${'-'.repeat(colDb + 2)}+${'-'.repeat(colMock + 2)}+${'-'.repeat(colFeature + 2)}+`;

  console.log(separator);
  console.log(header);
  console.log(separator);

  let dbImplemented = 0;
  let mockImplemented = 0;

  for (const item of FINANCE_METHODS) {
    const dbStatus = checkImplementation(dbService, item.name);
    const mockStatus = checkImplementation(mockService, item.name);

    if (dbStatus === 'Implemented') dbImplemented++;
    if (mockStatus === 'Implemented') mockImplemented++;

    console.log(
      `| ${pad(item.name, colMethod)} | ${pad(dbStatus, colDb)} | ${pad(mockStatus, colMock)} | ${pad(item.feature, colFeature)} |`
    );
  }

  console.log(separator);

  const total = FINANCE_METHODS.length;
  const dbPct = Math.round((dbImplemented / total) * 100);
  const mockPct = Math.round((mockImplemented / total) * 100);

  console.log(`\nCoverage Summary:`);
  console.log(`  DbFinanceService:   ${dbImplemented}/${total} methods implemented (${dbPct}%)`);
  console.log(`  MockFinanceService: ${mockImplemented}/${total} methods implemented (${mockPct}%)\n`);
}

generateCoverageReport();

