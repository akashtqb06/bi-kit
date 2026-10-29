import { describe, it, expect, beforeEach } from 'vitest';
import { MockFinanceService } from '@src/lib/finance/mock-service';
import { generateDueRecurringTransactions } from '../generator';
import { projectUpcomingOccurrences } from '../date-math';

describe('Recurring Generator: Unit, Back-Fill & Idempotency', () => {
  let mockService: MockFinanceService;
  const userId = 'usr_mock_s6a';

  beforeEach(async () => {
    process.env.FINANCE_BACKEND = 'mock';
    mockService = new MockFinanceService('salaried-urban');

    // Create a checking account and category for tests
    await mockService.createAccount(userId, {
      name: 'Salary Checking',
      kind: 'bank',
      currency: 'INR',
    });
  });

  it('back-fills multiple missed runs when cron has not executed for months', async () => {
    const accounts = await mockService.listAccounts(userId);
    const checkingAcc = accounts[0];

    // Rule created 3 months ago with day 31
    const rule = await mockService.createRecurringRule(userId, {
      accountId: checkingAcc.id,
      type: 'expense',
      amount: 1500000, // ₹15,000 in paise
      payee: 'Landlord House Rent',
      note: 'Monthly Rent [DOM:31]',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-07-31',
      nextOccurrence: '2026-07-31',
    });

    // Run generator as of 2026-10-31
    const result = await generateDueRecurringTransactions({
      userId,
      asOfDate: '2026-10-31',
      backend: 'mock',
      service: mockService,
    });

    expect(result.processed).toBeGreaterThanOrEqual(1);
    expect(result.generated).toBe(4); // 2026-07-31, 2026-08-31, 2026-09-30 (clamped), 2026-10-31
    expect(result.backfilled).toBe(3); // 3 occurrences prior to asOfDate

    const updatedRule = await mockService.getRecurringRule(userId, rule.id);
    expect(updatedRule.nextOccurrence).toBe('2026-11-30'); // Nov clamped to 30

    // Check transactions created
    const txns = await mockService.listTransactions(userId);
    const ruleTxns = txns.transactions.filter((t) => t.recurringRuleId === rule.id);
    expect(ruleTxns.length).toBe(4);
    expect(ruleTxns.map((t) => t.date).sort()).toEqual([
      '2026-07-31',
      '2026-08-31',
      '2026-09-30',
      '2026-10-31',
    ]);

    // Check clientRequestId format: ruleId + date
    for (const t of ruleTxns) {
      expect(t.clientRequestId).toBe(`${rule.id}_${t.date}`);
      expect(t.isRecurring).toBe(true);
    }
  });

  it('is completely idempotent on reruns on the same date', async () => {
    const accounts = await mockService.listAccounts(userId);
    const acc = accounts[0];

    const rule = await mockService.createRecurringRule(userId, {
      accountId: acc.id,
      type: 'expense',
      amount: 49900,
      payee: 'Netflix Subscription',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-10-01',
      nextOccurrence: '2026-10-01',
    });

    // First run
    const res1 = await generateDueRecurringTransactions({
      userId,
      asOfDate: '2026-10-15',
      backend: 'mock',
      service: mockService,
    });
    expect(res1.generated).toBe(1);

    // Immediate second rerun on same date
    const res2 = await generateDueRecurringTransactions({
      userId,
      asOfDate: '2026-10-15',
      backend: 'mock',
      service: mockService,
    });
    expect(res2.generated).toBe(0);

    const txns = await mockService.listTransactions(userId);
    const matching = txns.transactions.filter((t) => t.recurringRuleId === rule.id);
    expect(matching.length).toBe(1);
  });

  it('respects paused rules and generates nothing until resumed', async () => {
    const accounts = await mockService.listAccounts(userId);
    const acc = accounts[0];

    const rule = await mockService.createRecurringRule(userId, {
      accountId: acc.id,
      type: 'expense',
      amount: 100000,
      payee: 'Paused Gym Membership',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-09-01',
      nextOccurrence: '2026-09-01',
    });

    // Pause rule
    await mockService.updateRecurringRule(userId, rule.id, { isActive: false });

    // Run generator as of 2026-10-15
    const resPaused = await generateDueRecurringTransactions({
      userId,
      asOfDate: '2026-10-15',
      backend: 'mock',
      service: mockService,
    });

    // Paused rule was not processed
    const ruleDetail = resPaused.rulesProcessed.find((r) => r.ruleId === rule.id);
    expect(ruleDetail).toBeUndefined();

    const txnsAfterPause = await mockService.listTransactions(userId);
    expect(txnsAfterPause.transactions.some((t) => t.recurringRuleId === rule.id)).toBe(false);

    // Resume rule
    await mockService.updateRecurringRule(userId, rule.id, { isActive: true });

    // Run generator again
    const resResumed = await generateDueRecurringTransactions({
      userId,
      asOfDate: '2026-10-15',
      backend: 'mock',
      service: mockService,
    });

    expect(resResumed.generated).toBe(2); // 2026-09-01 and 2026-10-01
  });

  it('stops generating and deactivates rule when endDate is reached', async () => {
    const accounts = await mockService.listAccounts(userId);
    const acc = accounts[0];

    // 3-month fixed installment
    const rule = await mockService.createRecurringRule(userId, {
      accountId: acc.id,
      type: 'expense',
      amount: 500000,
      payee: 'Short Term Loan Installment',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-06-15',
      endDate: '2026-08-20', // Should only generate June, July, August
      nextOccurrence: '2026-06-15',
    });

    const res = await generateDueRecurringTransactions({
      userId,
      asOfDate: '2026-10-31',
      backend: 'mock',
      service: mockService,
    });

    expect(res.generated).toBe(3); // 2026-06-15, 2026-07-15, 2026-08-15
    const updated = await mockService.getRecurringRule(userId, rule.id);
    expect(updated.isActive).toBe(false); // Expired
  });

  it('projects upcoming occurrences over the next 60 days accurately', async () => {
    const accounts = await mockService.listAccounts(userId);
    const acc = accounts[0];

    const rule = await mockService.createRecurringRule(userId, {
      accountId: acc.id,
      type: 'expense',
      amount: 750000,
      payee: 'HDFC Home Loan EMI',
      frequency: 'monthly',
      interval: 1,
      startDate: '2026-11-05',
      nextOccurrence: '2026-11-05',
    });

    const projections = projectUpcomingOccurrences([rule], '2026-10-28', 60);

    expect(projections.length).toBe(2);
    expect(projections[0].date).toBe('2026-11-05');
    expect(projections[0].daysUntil).toBe(8);
    expect(projections[1].date).toBe('2026-12-05');
    expect(projections[1].daysUntil).toBe(38);
  });
});
