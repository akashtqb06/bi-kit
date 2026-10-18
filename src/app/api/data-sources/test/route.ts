import { NextResponse } from 'next/server';
import { z } from 'zod';
import { SqliteConnector } from '@src/lib/connectors/sqlite-connector';
import { handleApiError } from '@src/app/api/utils';

const testSchema = z.object({
    type: z.literal('sqlite'),
    config: z.object({ path: z.string().min(1) }),
});

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const body: unknown = await req.json();
        const { config } = testSchema.parse(body);

        const connector = new SqliteConnector(config.path);
        try {
            connector.testConnection();
            const tables = connector.getTables();
            return NextResponse.json({ data: { ok: true, tableCount: tables.length } });
        } finally {
            connector.close();
        }
    } catch (err) {
        return handleApiError(err);
    }
}
