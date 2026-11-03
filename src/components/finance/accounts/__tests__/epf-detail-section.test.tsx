import { describe, it, expect, vi } from 'vitest';
import * as React from 'react';
import { renderToString } from 'react-dom/server';
import { EpfDetailSection } from '../epf-detail-section';

vi.mock('next/navigation', () => ({
  useRouter: () => ({
    push: vi.fn(),
    replace: vi.fn(),
    prefetch: vi.fn(),
  }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => '/finance/accounts/acc_epf_test',
}));

describe('EpfDetailSection Component', () => {
  it('renders summary cards and passbook ledger structure cleanly', () => {
    const html = renderToString(
      <EpfDetailSection accountId="acc_epf_test" accountName="EPFO Main" />
    );
    expect(html).toContain('EPFO Member Passbook');
    expect(html).toContain('Employee Provident Fund (EPF 12%), Employer Share (3.67%), and EPS Pension (8.33%)');
    expect(html).toContain('Pension (EPS) Memo');
    expect(html).toContain('Separate memo (Excluded from net worth)');
    expect(html).toContain('Interest Accrued');
    expect(html).toContain('Monthly Contributions &amp; EPF Wages');
    expect(html).toContain('Closing Balance Summary');
    expect(html).toContain('PF Total:');
    expect(html).toContain('Import Passbook');
    expect(html).toContain('Set Anchor');
  });
});
