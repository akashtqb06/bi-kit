import { describe, it, expect, beforeEach } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { db, finAccounts, finPfEntries, finTransactions, finUserSettings, finValuations, users } from '@src/lib/db';
import { eq, and } from 'drizzle-orm';
import { parsePfCsv, parsePfPortalText } from '../../domain/pf/parser';
import {
  commitPfPassbook,
  getPfAccountSummary,
  listPfEntries,
} from '../../db-service/pf';
import { getOverviewStats } from '../../db-service/stats';

const USER_A = 'usr_pf_test_user_a';
const USER_B = 'usr_pf_test_user_b';

describe('EPFO Passbook & PF Integration Tests', () => {
  let accountA: string;
  let accountB: string;

  beforeEach(async () => {
    // Clean up test users and data
    await db.delete(finPfEntries).where(eq(finPfEntries.userId, USER_A));
    await db.delete(finPfEntries).where(eq(finPfEntries.userId, USER_B));
    await db.delete(finTransactions).where(eq(finTransactions.userId, USER_A));
    await db.delete(finTransactions).where(eq(finTransactions.userId, USER_B));
    await db.delete(finAccounts).where(eq(finAccounts.userId, USER_A));
    await db.delete(finAccounts).where(eq(finAccounts.userId, USER_B));
    await db.delete(finUserSettings).where(eq(finUserSettings.userId, USER_A));
    await db.delete(finUserSettings).where(eq(finUserSettings.userId, USER_B));
    await db.delete(users).where(eq(users.id, USER_A));
    await db.delete(users).where(eq(users.id, USER_B));

    // Create test users
    await db.insert(users).values([
      { id: USER_A, email: 'pf_user_a@example.com', name: 'User A', passwordHash: 'hash', role: 'member' },
      { id: USER_B, email: 'pf_user_b@example.com', name: 'User B', passwordHash: 'hash', role: 'member' },
    ]);

    // Create EPF accounts
    const [accA] = await db
      .insert(finAccounts)
      .values({
        userId: USER_A,
        name: 'My EPFO Account',
        kind: 'epf',
        class: 'asset',
        currency: 'INR',
      })
      .returning();
    accountA = accA.id;

    const [accB] = await db
      .insert(finAccounts)
      .values({
        userId: USER_B,
        name: "User B's EPF",
        kind: 'epf',
        class: 'asset',
        currency: 'INR',
      })
      .returning();
    accountB = accB.id;
  });

  it('imports fixture epf-passbook-2026-27.csv with exact prompt numbers and creates valuation anchor', async () => {
    const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
    const fixtureCsv = fs.readFileSync(fixturePath, 'utf8');

    const parsed = parsePfCsv(fixtureCsv);
    expect(parsed.rows.length).toBe(10);

    const result = await commitPfPassbook(USER_A, accountA, {
      entries: parsed.rows,
      setClosingBalanceAnchor: true,
      anchorDate: '2026-10-31',
    });

    expect(result.added).toBe(10);
    expect(result.updated).toBe(0);
    expect(result.unchanged).toBe(0);
    expect(result.anchorCreated).toBe(true);

    // Expected closing numbers in paise:
    // Employee: 1,39,916 INR = 13,991,600 paise
    // Employer: 71,086 INR = 7,108,600 paise
    // Pension: 59,250 INR = 5,925,000 paise
    expect(result.closingBalance.employee).toBe(13991600);
    expect(result.closingBalance.employer).toBe(7108600);
    expect(result.closingBalance.pension).toBe(5925000);

    // Summary check
    const summary = await getPfAccountSummary(USER_A, accountA, '2026-27');
    // PF balance (employee + employer) = 2,11,002 INR (21,100,200 paise)
    expect(summary.pfBalance).toBe(21100200);
    expect(summary.employeeShare).toBe(13991600);
    expect(summary.employerShare).toBe(7108600);
    expect(summary.pensionBalance).toBe(5925000);

    // This FY contributions: employee 31,360 / employer 23,472 / pension 7,888
    expect(summary.thisFyContributions.employee).toBe(3136000);
    expect(summary.thisFyContributions.employer).toBe(2347200);
    expect(summary.thisFyContributions.pension).toBe(788800);

    // This FY transfer-ins: employee 1,08,556 / employer 47,614 / pension 51,362
    expect(summary.thisFyTransferIns.employee).toBe(10855600);
    expect(summary.thisFyTransferIns.employer).toBe(4761400);
    expect(summary.thisFyTransferIns.pension).toBe(5136200);

    // Check valuation anchor in fin_valuations
    const [anchor] = await db
      .select()
      .from(finValuations)
      .where(and(eq(finValuations.accountId, accountA), eq(finValuations.date, '2026-10-31')));
    expect(anchor).toBeDefined();
    expect(Number(anchor.value)).toBe(21100200);
  });

  it('calculates net worth with EPS excluded by default and included when setting is ON', async () => {
    const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
    const fixtureCsv = fs.readFileSync(fixturePath, 'utf8');
    const parsed = parsePfCsv(fixtureCsv);

    await commitPfPassbook(USER_A, accountA, {
      entries: parsed.rows,
      setClosingBalanceAnchor: true,
      anchorDate: '2026-10-31',
    });

    // Default setting: includeEpsInNetWorth is false
    const statsDefault = await getOverviewStats(USER_A);
    // Net worth includes 2,11,002 and not EPS memo (59,250)
    expect(statsDefault.netWorth).toBe(21100200);
    expect(statsDefault.totalAssets).toBe(21100200);

    // Now turn ON includeEpsInNetWorth
    await db
      .insert(finUserSettings)
      .values({
        userId: USER_A,
        includeEpsInNetWorth: true,
      })
      .onConflictDoUpdate({
        target: [finUserSettings.userId],
        set: { includeEpsInNetWorth: true },
      });

    const statsWithEps = await getOverviewStats(USER_A);
    // Net worth = 2,11,002 + 59,250 = 2,70,252 (27,025,200 paise)
    expect(statsWithEps.netWorth).toBe(27025200);
    expect(statsWithEps.totalAssets).toBe(27025200);
  });

  it('guarantees PF entries NEVER affect transactions, income, expense, or budgets', async () => {
    const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
    const fixtureCsv = fs.readFileSync(fixturePath, 'utf8');
    const parsed = parsePfCsv(fixtureCsv);

    await commitPfPassbook(USER_A, accountA, {
      entries: parsed.rows,
    });

    // 1. fin_transactions must be completely empty for USER_A
    const txRows = await db
      .select()
      .from(finTransactions)
      .where(eq(finTransactions.userId, USER_A));
    expect(txRows.length).toBe(0);

    // 2. Overview income and expense must be 0
    const stats = await getOverviewStats(USER_A);
    expect(stats.monthlyIncome).toBe(0);
    expect(stats.monthlyExpense).toBe(0);
    expect(stats.spendByCategory?.length ?? 0).toBe(0);
  });

  it('enforces idempotent re-import and adds new row when November is imported later', async () => {
    const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
    const fixtureCsv = fs.readFileSync(fixturePath, 'utf8');
    const parsed1 = parsePfCsv(fixtureCsv);

    // Initial import: 10 rows added
    const res1 = await commitPfPassbook(USER_A, accountA, { entries: parsed1.rows });
    expect(res1.added).toBe(10);

    // Re-importing exact same passbook: 0 added, 0 updated, 10 unchanged
    const res2 = await commitPfPassbook(USER_A, accountA, { entries: parsed1.rows });
    expect(res2.added).toBe(0);
    expect(res2.updated).toBe(0);
    expect(res2.unchanged).toBe(10);

    // Now import a later passbook that adds November contribution
    const parsedNov = parsePfCsv(`
${fixtureCsv.trim()}
contribution,2026-11,,,46667,19667,5600,3962,1638,
`);

    const res3 = await commitPfPassbook(USER_A, accountA, { entries: parsedNov.rows });
    expect(res3.added).toBe(1);
    expect(res3.unchanged).toBe(10);

    const totalEntries = await listPfEntries(USER_A, accountA);
    expect(totalEntries.length).toBe(11);
  });

  it('guarantees strict user isolation and privacy (no long IDs in database)', async () => {
    const portalSample = `
Cont. for the Due-Month 202605	₹ 28,000	₹ 15,000	₹ 3,360	₹ 2,110	₹ 1,250
TRANSFER CLAIM - PRINCIPAL AMOUNT | SOURCE MEMBER ID: MHBAN00012340000005944	-	-	₹ 13,932	₹ 4,257	₹ 7,500
`;
    const parsed = parsePfPortalText(portalSample);
    await commitPfPassbook(USER_A, accountA, { entries: parsed.rows });

    // 1. Verify User B cannot view User A's entries
    const userBEntries = await listPfEntries(USER_B, accountB);
    expect(userBEntries.length).toBe(0);

    await expect(listPfEntries(USER_B, accountA)).rejects.toThrow();

    // 2. Verify no long IDs in database
    const dbRows = await db
      .select()
      .from(finPfEntries)
      .where(eq(finPfEntries.accountId, accountA));

    for (const row of dbRows) {
      if (row.sourceLabel) {
        expect(row.sourceLabel).not.toContain('MHBAN00012340000005944');
        expect(row.sourceLabel).toContain('5944');
        expect(row.sourceLabel.length).toBeLessThan(40);
      }
    }
  });
});
