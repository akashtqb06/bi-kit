import { NextResponse } from 'next/server';
import { requireUserApi } from '@src/lib/auth/dal';
import { handleApiError } from '@src/app/api/utils';
import { createDataStoreTablesSchema } from '@src/lib/data-store/types';
import {
    listStoreTables,
    createStoreTables,
    getOrCreateDatastoreSource,
} from '@src/lib/data-store/service';
import { syncTable } from '@src/lib/data-store/sync-engine';

export async function GET(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        // Ensure user has their Data Store data source created
        await getOrCreateDatastoreSource(user.id);

        const url = new URL(req.url);
        const dataSourceId = url.searchParams.get('dataSourceId') || undefined;
        const search = url.searchParams.get('search') || undefined;

        const tables = await listStoreTables(user.id, { dataSourceId, search });
        return NextResponse.json({ data: tables });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const body: unknown = await req.json();
        const input = createDataStoreTablesSchema.parse(body);

        const created = await createStoreTables(user.id, input);

        // Start background synchronization for each created table
        for (const tbl of created) {
            void syncTable(tbl.id, { triggeredBy: 'create' });
        }

        return NextResponse.json({ data: created }, { status: 201 });
    } catch (err) {
        return handleApiError(err);
    }
}
