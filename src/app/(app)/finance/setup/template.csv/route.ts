import { NextResponse } from 'next/server';
import { getCSVTemplateContent } from '@src/lib/finance/setup/csv';

export async function GET() {
  const csv = getCSVTemplateContent();
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': 'attachment; filename="accounts-setup-template.csv"',
    },
  });
}
