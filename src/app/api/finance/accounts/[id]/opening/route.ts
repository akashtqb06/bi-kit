import { NextRequest, NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { updateAccountOpeningData } from '@src/lib/finance/setup/service';
import { z } from 'zod';

const updateOpeningSchema = z.object({
  openingBalancePaise: z.number().int(),
  openingDate: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Date must be YYYY-MM-DD'),
});

export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const user = await requireUserApi();
    const { id } = await params;
    const json = await request.json();
    const parsed = updateOpeningSchema.parse(json);

    await updateAccountOpeningData(user.id, id, parsed);

    return NextResponse.json({ success: true });
  } catch (err) {
    return handleApiError(err);
  }
}
