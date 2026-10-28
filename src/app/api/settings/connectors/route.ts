import { NextResponse } from 'next/server';
import { z } from 'zod';
import { requireUserApi } from '@src/lib/auth/dal';
import { getAllowedConnectorTypes, setAllowedConnectorTypes } from '@src/lib/settings/allowed-connectors';
import { handleApiError, apiError } from '@src/app/api/utils';

const putSchema = z.object({
    allowedConnectorTypes: z.array(z.string().min(1)),
});

export async function GET(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }
        const allowedConnectorTypes = getAllowedConnectorTypes();
        return NextResponse.json({ data: { allowedConnectorTypes } });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function PUT(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        if (user.role !== 'admin') {
            return apiError('Administrator access required.', 403);
        }
        const body: unknown = await req.json();
        const input = putSchema.parse(body);

        setAllowedConnectorTypes(input.allowedConnectorTypes);
        const updated = getAllowedConnectorTypes();
        return NextResponse.json({ data: { allowedConnectorTypes: updated } });
    } catch (err) {
        return handleApiError(err);
    }
}

