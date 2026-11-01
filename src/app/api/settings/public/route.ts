import { NextResponse } from 'next/server';
import { getPublicSettings } from '@src/lib/settings/app-settings';
import { handleApiError } from '@src/app/api/utils';

export async function GET(): Promise<NextResponse> {
    try {
        const settings = await getPublicSettings();
        return NextResponse.json({ data: settings });
    } catch (err) {
        return handleApiError(err);
    }
}
