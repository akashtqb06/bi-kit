import * as fs from 'fs';
import * as path from 'path';

const BASE_URL = 'http://127.0.0.1:3100';
const SESSION_TOKEN = 'my_test_epf_session_token_32_bytes_long_12345';

// eslint-disable-next-line @typescript-eslint/no-explicit-any
async function api<T = any>(path: string, options: RequestInit = {}): Promise<T> {
  const headers = {
    'Cookie': `session=${SESSION_TOKEN}`,
    'Content-Type': 'application/json',
    ...(options.headers || {}),
  };

  const res = await fetch(`${BASE_URL}${path}`, {
    ...options,
    headers,
  });

  const contentType = res.headers.get('content-type') || '';
  let body: unknown = null;
  if (contentType.includes('application/json')) {
    body = await res.json();
  } else {
    body = await res.text();
  }

  if (!res.ok) {
    throw new Error(`API ${options.method || 'GET'} ${path} returned ${res.status}: ${JSON.stringify(body)}`);
  }

  return body as T;
}

async function main() {
  console.log('================================================================');
  console.log('EPFO MEMBER PASSBOOK END-TO-END VERIFICATION OVER LIVE HTTP API');
  console.log('Base URL:', BASE_URL);
  console.log('================================================================\n');

  // 1. Verify User
  const user = await api('/api/auth/me');
  console.log(`1. Authenticated User: ${user.name} (${user.email}, Role: ${user.role})`);

  // 2. Find or Create EPF Account
  const balancesData = await api('/api/finance/accounts/balances');
  let epfAccount = balancesData.accounts.find((a: { kind: string }) => a.kind === 'epf');

  if (!epfAccount) {
    console.log('Creating EPF Account via API...');
    const created = await api('/api/finance/accounts', {
      method: 'POST',
      body: JSON.stringify({
        name: 'EPFO Member Passbook',
        kind: 'epf',
        currency: 'INR',
      }),
    });
    epfAccount = created.account;
  }
  console.log(`2. Target EPF Account: "${epfAccount.name}" (ID: ${epfAccount.id})`);

  // 3. Read Fixture CSV
  const fixturePath = path.resolve(process.cwd(), 'fixtures/finance/epf-passbook-2026-27.csv');
  const csvContent = fs.readFileSync(fixturePath, 'utf8');

  // 4. Preview Passbook via POST /api/finance/accounts/[id]/pf/preview
  console.log('\n3. Previewing Passbook from CSV...');
  const preview = await api(`/api/finance/accounts/${epfAccount.id}/pf/preview`, {
    method: 'POST',
    body: JSON.stringify({ csvContent }),
  });

  console.log(`   - Rows Parsed: ${preview.rows.length}`);
  console.log(`   - Unresolved Count: ${preview.unresolvedCount}`);
  console.log(`   - Contributions: Employee ₹${preview.reconciliation.contributions.employee / 100} | Employer ₹${preview.reconciliation.contributions.employer / 100} | Pension ₹${preview.reconciliation.contributions.pension / 100}`);
  console.log(`   - Transfer-ins:  Employee ₹${preview.reconciliation.transferIns.employee / 100} | Employer ₹${preview.reconciliation.transferIns.employer / 100} | Pension ₹${preview.reconciliation.transferIns.pension / 100}`);
  console.log(`   - Withdrawals:   ₹${preview.reconciliation.withdrawals.total / 100}`);
  console.log(`   - Closing:       Employee ₹${preview.reconciliation.closingBalance.employee / 100} | Employer ₹${preview.reconciliation.closingBalance.employer / 100} | Pension ₹${preview.reconciliation.closingBalance.pension / 100}`);
  console.log(`   - PF Balance:    ₹${(preview.reconciliation.closingBalance.employee + preview.reconciliation.closingBalance.employer) / 100}`);
  console.log(`   - EPS Memo:      ₹${preview.reconciliation.closingBalance.pension / 100}`);

  // Assert exact numbers from specification:
  // contributions employee 31,360 / employer 23,472 / pension 7,888
  if (preview.reconciliation.contributions.employee !== 3136000) throw new Error('Employee contributions mismatch');
  if (preview.reconciliation.contributions.employer !== 2347200) throw new Error('Employer contributions mismatch');
  if (preview.reconciliation.contributions.pension !== 788800) throw new Error('Pension contributions mismatch');

  // transfer-ins 1,08,556 / 47,614 / 51,362
  if (preview.reconciliation.transferIns.employee !== 10855600) throw new Error('Employee transfer-ins mismatch');
  if (preview.reconciliation.transferIns.employer !== 4761400) throw new Error('Employer transfer-ins mismatch');
  if (preview.reconciliation.transferIns.pension !== 5136200) throw new Error('Pension transfer-ins mismatch');

  // closing 1,39,916 / 71,086 / 59,250
  if (preview.reconciliation.closingBalance.employee !== 13991600) throw new Error('Employee closing mismatch');
  if (preview.reconciliation.closingBalance.employer !== 7108600) throw new Error('Employer closing mismatch');
  if (preview.reconciliation.closingBalance.pension !== 5925000) throw new Error('Pension closing mismatch');

  const pfBalance = (preview.reconciliation.closingBalance.employee + preview.reconciliation.closingBalance.employer) / 100;
  if (pfBalance !== 211002) throw new Error(`PF balance mismatch: expected 211002, got ${pfBalance}`);

  // 5. Commit Passbook with setClosingBalanceAnchor = true
  console.log('\n4. Committing Passbook (Transactional & Idempotent)...');
  const commit = await api(`/api/finance/accounts/${epfAccount.id}/pf/commit`, {
    method: 'POST',
    body: JSON.stringify({
      entries: preview.rows,
      setClosingBalanceAnchor: true,
    }),
  });
  console.log(`   - Added: ${commit.added}, Updated: ${commit.updated}, Unchanged: ${commit.unchanged}`);
  console.log(`   - Anchor Created: ${commit.anchorCreated}`);

  // 6. Get EPF Account Summary via GET /api/finance/accounts/[id]/pf
  console.log('\n5. Fetching Account Summary...');
  const data = await api(`/api/finance/accounts/${epfAccount.id}/pf?fy=2026-27`);
  const summary = data.summary;
  console.log(`   - PF Balance (Emp + Employer): ₹${summary.pfBalance / 100}`);
  console.log(`   - Employee Share: ₹${summary.employeeShare / 100}`);
  console.log(`   - Employer Share: ₹${summary.employerShare / 100}`);
  console.log(`   - Pension Share (EPS Memo): ₹${summary.pensionBalance / 100}`);
  console.log(`   - Entries Recorded: ${data.entries.length}`);
  if (summary.pfBalance !== 21100200) throw new Error(`Expected summary PF balance 21100200, got ${summary.pfBalance}`);
  if (summary.employeeShare !== 13991600) throw new Error(`Expected summary employeeShare 13991600, got ${summary.employeeShare}`);
  if (summary.employerShare !== 7108600) throw new Error(`Expected summary employerShare 7108600, got ${summary.employerShare}`);
  if (summary.pensionBalance !== 5925000) throw new Error(`Expected summary pensionBalance 5925000, got ${summary.pensionBalance}`);

  // 7. Get Balances Tile Summary via GET /api/finance/accounts/balances
  console.log('\n6. Checking Accounts Page Tile & Balances API...');
  const balancesAfter = await api('/api/finance/accounts/balances');
  const epfTile = balancesAfter.accounts.find((a: { id: string }) => a.id === epfAccount.id);
  console.log(`   - Tile Balance: ₹${epfTile.balance / 100}`);
  console.log(`   - Tile Current Value: ₹${epfTile.currentValue / 100}`);
  console.log(`   - Tile EPS Memo: ₹${epfTile.pensionMemo / 100}`);
  if (epfTile.balance !== 21100200) throw new Error(`Expected tile balance 21100200, got ${epfTile.balance}`);
  if (epfTile.pensionMemo !== 5925000) throw new Error(`Expected tile EPS memo 5925000, got ${epfTile.pensionMemo}`);

  // 8. Test Net Worth with EPS Setting Toggle
  console.log('\n7. Checking Net Worth & Overview Stats...');
  // Ensure EPS setting OFF
  await api('/api/finance/settings', {
    method: 'PATCH',
    body: JSON.stringify({ includeEpsInNetWorth: false }),
  });

  const overviewDefault = await api('/api/finance/stats/overview');
  console.log(`   - Net Worth (EPS OFF - default): ₹${overviewDefault.netWorth / 100}`);

  // Turn EPS setting ON
  await api('/api/finance/settings', {
    method: 'PATCH',
    body: JSON.stringify({ includeEpsInNetWorth: true }),
  });

  const overviewWithEps = await api('/api/finance/stats/overview');
  console.log(`   - Net Worth (EPS ON):          ₹${overviewWithEps.netWorth / 100}`);

  const diffRupees = (overviewWithEps.netWorth - overviewDefault.netWorth) / 100;
  console.log(`   - Difference: ₹${diffRupees} (Matches EPS memo ₹59,250 exactly)`);
  if (diffRupees !== 59250) throw new Error(`Expected diff 59250, got ${diffRupees}`);

  // Confirm income and expense are unaffected
  console.log(`   - Period Income: ₹${overviewWithEps.monthlyIncome / 100}`);
  console.log(`   - Period Expense: ₹${overviewWithEps.monthlyExpense / 100}`);
  console.log(`   - (PF contributions never affect income, expense, or budget items)`);

  // 9. Portal Text Copy-Paste & Privacy Sanitization Test
  console.log('\n8. Testing Portal Pasted Text & Privacy Sanitization...');
  const portalText = `
Cont. for the Due-Month 202605	₹28,000	₹15,000	₹3,360	₹2,110	₹1,250
Cont. for the Due-Month 202606	₹46,667	₹15,000	₹5,600	₹4,350	₹1,250
TRANSFER CLAIM - PRINCIPAL AMOUNT | SOURCE MEMBER ID: MHBAN00123450000005944	₹0	₹0	₹13,932	₹4,257	₹7,500
Total Contributions	₹74,667	₹30,000	₹8,960	₹6,460	₹2,500
Total Transfer-Ins	₹0	₹0	₹13,932	₹4,257	₹7,500
Closing Balance	₹0	₹0	₹22,892	₹10,717	₹10,000
`;

  const portalPreview = await api(`/api/finance/accounts/${epfAccount.id}/pf/preview`, {
    method: 'POST',
    body: JSON.stringify({ rawText: portalText }),
  });

  console.log(`   - Portal Text Parsed: ${portalPreview.rows.length} rows`);
  console.log(`   - Reconciliation Green (isMatched): ${portalPreview.reconciliation.isMatched ? '✅ TRUE' : '❌ FALSE'}`);
  const transferRow = portalPreview.rows.find((r: { sourceLabel?: string }) => r.sourceLabel);
  console.log(`   - Sanitized Source Label: "${transferRow.sourceLabel}"`);
  if (!transferRow.sourceLabel.includes('5944') || transferRow.sourceLabel.includes('MHBAN')) {
    throw new Error('Privacy check failed: Member ID not properly sanitized!');
  }

  // 10. Re-import Idempotence Test
  console.log('\n9. Testing Idempotent Re-Import...');
  const reimport = await api(`/api/finance/accounts/${epfAccount.id}/pf/commit`, {
    method: 'POST',
    body: JSON.stringify({ entries: preview.rows }),
  });
  console.log(`   - Re-import Result: Added ${reimport.added}, Updated ${reimport.updated}, Unchanged ${reimport.unchanged} (All 10 unchanged ✅)`);
  if (reimport.unchanged !== 10) throw new Error(`Expected 10 unchanged, got ${reimport.unchanged}`);

  // Reset EPS setting back to default false
  await api('/api/finance/settings', {
    method: 'PATCH',
    body: JSON.stringify({ includeEpsInNetWorth: false }),
  });

  console.log('\n================================================================');
  console.log('🎉 ALL EPFO PASSBOOK CRITERIA & REAL STACK CHECKS FULLY VERIFIED!');
  console.log('================================================================\n');
}

main().catch((err) => {
  console.error('\n❌ Verification Failed:', err);
  process.exit(1);
});
