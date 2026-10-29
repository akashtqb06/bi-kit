import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { checkNeedsResync } from '@src/lib/data-store/service';
import { getUserQuotas } from '@src/lib/data-store/quotas';

export async function GET(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const needsResync = await checkNeedsResync(user.id);
        const quotas = await getUserQuotas(user.id);

        return NextResponse.json({
            data: {
                needsResync,
                quotas,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}

