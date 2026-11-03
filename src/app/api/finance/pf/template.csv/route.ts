import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';

export async function GET() {
  try {
    await requireUserApi();

    const templateContent = `entry_kind,period_month,posted_date,source_label,epf_wages,eps_wages,employee,employer,pension,note
contribution,2026-05,,,28000,15000,3360,2110,1250,May 2026 Monthly Contribution
transfer_in_principal,,,Previous account ending 5944,0,0,13932,4257,7500,Transfer Claim Principal
transfer_in_interest,,,Previous account ending 5944,0,0,575,176,0,Transfer Claim Interest
`;

    return new NextResponse(templateContent, {
      status: 200,
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="epfo-passbook-template.csv"',
      },
    });
  } catch (err) {
    return handleApiError(err);
  }
}

