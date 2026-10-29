import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { listPublicConnectorDefinitions } from '@src/lib/connectors/registry';
import { getAllowedConnectorTypes } from '@src/lib/settings/allowed-connectors';
import { handleApiError } from '@src/app/api/utils';

export async function GET(): Promise<NextResponse> {
    try {
        await requireUserApi();
        const allowedTypes = await getAllowedConnectorTypes();
        const connectors = listPublicConnectorDefinitions().map((c) => ({
            ...c,
            allowed: allowedTypes.includes(c.type),
        }));
        return NextResponse.json({ data: connectors });
    } catch (err) {
        return handleApiError(err);
    }
}
