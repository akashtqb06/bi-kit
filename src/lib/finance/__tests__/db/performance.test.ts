import { beforeEach, describe, expect, it } from 'vitest';
import { db, finTransactions } from '@src/lib/db';
import { setupFinanceTestDb, USER_A } from './test-helper';
import type { DbFinanceService } from '../../db-service';

describe('Performance Check on Seeded Dataset', () => {
  let service: DbFinanceService;

  beforeEach(async () => {
    service = await setupFinanceTestDb();
  });

  it('overview and 100-row transaction page return in under 300ms locally', async () => {
    // 1. Seed accounts
    const bank = await service.createAccount(USER_A, { name: 'Perf Bank', kind: 'bank' });
    const card = await service.createAccount(USER_A, {
      name: 'Perf Card',
      kind: 'credit_card',
      creditLimit: 20000000,
    });
    const cash = await service.createAccount(USER_A, { name: 'Perf Cash', kind: 'cash' });

    // 2. Batch-insert 500 transactions directly for speed
    const batchData = [];
    for (let i = 0; i < 500; i++) {
      const isExpense = i % 2 === 0;
      const amt = (i + 1) * 100;
      batchData.push({
        userId: USER_A,
        accountId: i % 3 === 0 ? card.id : (i % 3 === 1 ? bank.id : cash.id),
        type: isExpense ? ('expense' as const) : ('income' as const),
        amount: amt,
        signedAmount: isExpense ? -amt : amt,
        date: `2026-0${(i % 9) + 1}-15`,
        payee: `Payee ${i}`,
        note: `Transaction note index ${i}`,
      });
    }

    await db.insert(finTransactions).values(batchData);

    // Warm-up query
    await service.getOverviewStats(USER_A);

    // 3. Measure Overview Performance
    const startOverview = performance.now();
    const overview = await service.getOverviewStats(USER_A);
    const overviewDuration = performance.now() - startOverview;

    expect(overview.totalAssets).toBeGreaterThan(0);
    expect(overviewDuration).toBeLessThan(300);

    // 4. Measure 100-row Paginated Transaction Page
    const startPage = performance.now();
    const page = await service.listTransactions(USER_A, { limit: 100 });
    const pageDuration = performance.now() - startPage;

    expect(page.transactions.length).toBe(100);
    expect(pageDuration).toBeLessThan(300);
  });
});
