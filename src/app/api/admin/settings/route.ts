import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import {
    getGeneralSettings,
    getEnvironmentInfo,
    updateGeneralSettings,
} from '@src/lib/settings/app-settings';
import { handleApiError, apiError } from '@src/app/api/utils';

const patchSettingsSchema = z.object({
    appName: z.string().trim().min(1).max(100).optional(),
    allowRegistration: z.boolean().optional(),
    sessionLifetimeDays: z.number().int().min(1).max(365).optional(),
    allowedConnectorTypes: z.array(z.string().min(1)).optional(),
});

export async function GET(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const settings = await getGeneralSettings();
        const envInfo = getEnvironmentInfo();

        return NextResponse.json({
            data: {
                settings,
                env: envInfo,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function PATCH(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }

        const body: unknown = await req.json();
        const input = patchSettingsSchema.parse(body);

        const updated = await updateGeneralSettings(input, user.id);
        const envInfo = getEnvironmentInfo();

        return NextResponse.json({
            data: {
                settings: updated,
                env: envInfo,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}

