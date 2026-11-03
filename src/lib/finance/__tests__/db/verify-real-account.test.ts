import { describe, it, expect } from 'vitest';
import * as fs from 'fs';
import * as path from 'path';
import { db, finAccounts, finTransactions, finUserSettings, users } from '@src/lib/db';
import { eq, and, isNull } from 'drizzle-orm';
import { parsePfCsv, parsePfPortalText, computeReconciliation } from '@src/lib/finance/domain/pf/parser';
import { commitPfPassbook, getPfAccountSummary } from '@src/lib/finance/db-service/pf';
import { getOverviewStats } from '@src/lib/finance/db-service/stats';

describe('Real Account Verification (Docker Stack & EPFO Passbook)', () => {
  it('imports fixture, reconciles green, verifies net worth, anchor, privacy, and portal text', async () => {
    // 1. Get real user
    const [realUser] = await db.select().from(users).limit(1);
    const userId = realUser.id;

    // 2. Create or find EPF account
    let [account] = await db
      .select()
      .from(finAccounts)
      .where(and(eq(finAccounts.userId, userId), eq(finAccounts.kind, 'epf')))
      .limit(1);

    if (!account) {
      const [created] = await db
        .insert(finAccounts)
        .values({
          userId,
          name: 'EPFO Member Passbook',
          kind: 'epf',
          class: 'asset',
          currency: 'INR',
          isActive: true,
        })
        .returning();
      account = created;
    }

    expect(account).toBeDefined();
    expect(account.kind).toBe('epf');

    // 3. Read fixture CSV
    const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
    const csvText = fs.readFileSync(fixturePath, 'utf8');

    // 4. Parse CSV and compute reconciliation
    const parsed = parsePfCsv(csvText);
    expect(parsed.rows.length).toBe(10);

    const passbookTotals = {
      contributions: { employee: 3136000, employer: 2347200, pension: 788800, total: 6272000 },
      transferIns: { employee: 10855600, employer: 4761400, pension: 5136200, total: 20753200 },
      withdrawals: { employee: 0, employer: 0, pension: 0, total: 0 },
      closingBalance: { employee: 13991600, employer: 7108600, pension: 5925000, total: 27025200 },
    };
    const rec = computeReconciliation(parsed.rows, passbookTotals);
    expect(rec.isMatched).toBe(true);

    // Verify exact prompt numbers:
    // contributions employee 31,360 / employer 23,472 / pension 7,888
    expect(rec.contributions.employee).toBe(3136000);
    expect(rec.contributions.employer).toBe(2347200);
    expect(rec.contributions.pension).toBe(788800);

    // transfer-ins 1,08,556 / 47,614 / 51,362
    expect(rec.transferIns.employee).toBe(10855600);
    expect(rec.transferIns.employer).toBe(4761400);
    expect(rec.transferIns.pension).toBe(5136200);

    // withdrawals 0
    expect(rec.withdrawals.employee).toBe(0);
    expect(rec.withdrawals.employer).toBe(0);
    expect(rec.withdrawals.pension).toBe(0);

    // closing 1,39,916 / 71,086 / 59,250
    expect(rec.closingBalance.employee).toBe(13991600);
    expect(rec.closingBalance.employer).toBe(7108600);
    expect(rec.closingBalance.pension).toBe(5925000);

    // PF balance 2,11,002 (employee + employer); EPS memo 59,250
    const pfBalanceRupees = (rec.closingBalance.employee + rec.closingBalance.employer) / 100;
    expect(pfBalanceRupees).toBe(211002);
    expect(rec.closingBalance.pension / 100).toBe(59250);

    // 5. Commit passbook
    const commitResult = await commitPfPassbook(userId, account.id, {
      entries: parsed.rows,
      setClosingBalanceAnchor: true,
    });
    expect(commitResult.added).toBe(10);
    expect(commitResult.anchorCreated).toBe(true);
    expect(commitResult.closingBalance.employee).toBe(13991600);
    expect(commitResult.closingBalance.employer).toBe(7108600);
    expect(commitResult.closingBalance.pension).toBe(5925000);

    // 6. Check account summary
    const summary = await getPfAccountSummary(userId, account.id, '2026-27');
    expect(summary.pfBalance).toBe(21100200);
    expect(summary.employeeShare).toBe(13991600);
    expect(summary.employerShare).toBe(7108600);
    expect(summary.pensionBalance).toBe(5925000);
    expect(summary.thisFyContributions.employee).toBe(3136000);
    expect(summary.thisFyContributions.employer).toBe(2347200);
    expect(summary.thisFyContributions.pension).toBe(788800);
    expect(summary.thisFyTransferIns.employee).toBe(10855600);
    expect(summary.thisFyTransferIns.employer).toBe(4761400);
    expect(summary.thisFyTransferIns.pension).toBe(5136200);

    // 7. Check overview stats and net worth with EPS toggle
    // EPS OFF (default)
    await db
      .insert(finUserSettings)
      .values({ userId, includeEpsInNetWorth: false })
      .onConflictDoUpdate({
        target: [finUserSettings.userId],
        set: { includeEpsInNetWorth: false },
      });

    const statsWithoutEps = await getOverviewStats(userId);

    // EPS ON
    await db
      .insert(finUserSettings)
      .values({ userId, includeEpsInNetWorth: true })
      .onConflictDoUpdate({
        target: [finUserSettings.userId],
        set: { includeEpsInNetWorth: true },
      });

    const statsWithEps = await getOverviewStats(userId);

    // Difference between EPS ON and EPS OFF is exactly the EPS memo (59,250)
    const diffPaise = statsWithEps.netWorth - statsWithoutEps.netWorth;
    expect(diffPaise).toBe(5925000);

    // 8. Confirm NO transactions in fin_transactions for EPF account
    const txs = await db
      .select()
      .from(finTransactions)
      .where(and(eq(finTransactions.accountId, account.id), isNull(finTransactions.deletedAt)));
    expect(txs.length).toBe(0);

    // 9. Test portal text copy paste parsing
    const portalText = `
Cont. for the Due-Month 202605	₹28,000	₹15,000	₹3,360	₹2,110	₹1,250
Cont. for the Due-Month 202606	₹46,667	₹15,000	₹5,600	₹4,350	₹1,250
TRANSFER CLAIM - PRINCIPAL AMOUNT | SOURCE MEMBER ID: MHBAN00123450000005944	₹0	₹0	₹13,932	₹4,257	₹7,500
Total Contributions	₹74,667	₹30,000	₹8,960	₹6,460	₹2,500
Total Transfer-Ins	₹0	₹0	₹13,932	₹4,257	₹7,500
Closing Balance	₹0	₹0	₹22,892	₹10,717	₹10,000
`;
    const parsedPortal = parsePfPortalText(portalText);
    const recPortal = computeReconciliation(parsedPortal.rows, parsedPortal.parsedTotals);
    expect(recPortal.isMatched).toBe(true);

    const prevAccLabel = parsedPortal.rows.find(r => r.sourceLabel)?.sourceLabel;
    expect(prevAccLabel).toBe('Previous account ending 5944');
    expect(prevAccLabel).not.toContain('MHBAN');

    // Restore EPS setting to default false
    await db
      .update(finUserSettings)
      .set({ includeEpsInNetWorth: false })
      .where(eq(finUserSettings.userId, userId));
  });
});
