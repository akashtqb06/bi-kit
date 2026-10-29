/**
 * Service factory — resolves the correct FinanceService implementation.
 *
 * Kept in a separate file so static imports of the real db-service and
 * mock-service implementations are available without creating a runtime
 * circular dependency through service.ts.
 *
 * Runtime dependency graph (type-only imports stripped):
 *   get-service.ts → db-service/index.ts  (no back-ref to service.ts at runtime)
 *   get-service.ts → mock-service/index.ts (no back-ref to service.ts at runtime)
 */
import type { FinanceService } from './service';
import { DbFinanceService } from './db-service';
import { MockFinanceService } from './mock-service';

export function getFinanceService(): FinanceService {
  const backend = process.env.FINANCE_BACKEND || 'db';
  if (backend === 'mock') {
    if (process.env.NODE_ENV === 'production') {
      throw new Error('FINANCE_BACKEND=mock is strictly prohibited in production');
    }
    return new MockFinanceService();
  }
  return new DbFinanceService();
}

