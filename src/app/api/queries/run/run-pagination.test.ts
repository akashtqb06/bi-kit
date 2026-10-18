import { describe, it, expect, beforeAll } from 'vitest';
import * as runQueryApi from '@src/app/api/queries/run/route';
import { db } from '@src/lib/db/client';
import { dataSources, users } from '@src/lib/db/schema';
import { SAMPLE_DB_PATH } from '@src/lib/db/paths';

function postJson(url: string, body: unknown): Request {
    return new Request(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
    });
}

describe('POST /api/queries/run pagination', () => {
    let sampleDataSourceId: string;

    beforeAll(() => {
        const existing = db.select().from(dataSources).all();
        const found = existing.find((d) => d.type === 'sqlite');
        if (found) {
            sampleDataSourceId = found.id;
        } else {
            const user = db.select().from(users).get()!;
            const id = 'test-sample-ds';
            db.insert(dataSources)
                .values({
                    id,
                    ownerId: user.id,
                    name: 'Demo Store',
                    type: 'sqlite',
                    config: JSON.stringify({ path: SAMPLE_DB_PATH }),
                })
                .run();
            sampleDataSourceId = id;
        }
    });

    it('returns paginated rows with limit 100, page 1, and total count', async () => {
        const res = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDataSourceId,
                mode: 'builder',
                definition: {
                    source: { table: 'orders' },
                    steps: [],
                },
                page: 1,
                pageSize: 100,
            })
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data).toBeDefined();
        expect(json.data.page).toBe(1);
        expect(json.data.pageSize).toBe(100);
        expect([150, 12000]).toContain(json.data.totalRows);
        expect(json.data.rowCount).toBe(100);
        expect(json.data.rows.length).toBe(100);
    });

    it('returns page 2 with remaining rows', async () => {
        const res = await runQueryApi.POST(
            postJson('http://localhost/api/queries/run', {
                dataSourceId: sampleDataSourceId,
                mode: 'builder',
                definition: {
                    source: { table: 'orders' },
                    steps: [],
                },
                page: 2,
                pageSize: 100,
            })
        );

        expect(res.status).toBe(200);
        const json = await res.json();
        expect(json.data.page).toBe(2);
        expect([150, 12000]).toContain(json.data.totalRows);
        const expectedRowCount = json.data.totalRows === 150 ? 50 : 100;
        expect(json.data.rowCount).toBe(expectedRowCount);
        expect(json.data.rows.length).toBe(expectedRowCount);
    });
});
