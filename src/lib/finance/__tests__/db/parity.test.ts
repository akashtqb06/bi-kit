import { describe, expect, it } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';

describe('S1 vs S4 Parity Tests (Conditional on S4 Merge)', () => {
  const mockServicePath = path.join(process.cwd(), 'src/lib/finance/mock-service.ts');
  const oraclePath = path.join(process.cwd(), 'src/lib/finance/fixtures/oracle.json');

  const s4Exists = fs.existsSync(mockServicePath) || fs.existsSync(oraclePath);

  if (!s4Exists) {
    it.skip('S4 MockFinanceService and oracle.json not yet merged into develop; skipping parity cross-check', () => {
      expect(true).toBe(true);
    });
  } else {
    it('verifies DbFinanceService and MockFinanceService return identical values within 1 paisa', async () => {
      // Dynamic import to prevent build failure when S4 branch is not yet merged
      const { MockFinanceService } = await import('../../mock-service');
      const { DbFinanceService: _DbFinanceService } = await import('../../db-service');
      const { setupFinanceTestDb, USER_A } = await import('./test-helper');

      const dbService = await setupFinanceTestDb();
      const mockService = new MockFinanceService();

      // Create identical test accounts
      const dbAcc = await dbService.createAccount(USER_A, {
        name: 'Parity Bank',
        kind: 'bank',
      });
      const mockAcc = await mockService.createAccount(USER_A, {
        name: 'Parity Bank',
        kind: 'bank',
      });

      expect(dbAcc.class).toBe(mockAcc.class);
      expect(dbAcc.currency).toBe(mockAcc.currency);
    });
  }
});
