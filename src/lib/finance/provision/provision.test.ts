import { describe, it, expect, beforeAll } from 'vitest';
import * as schema from '@src/lib/db/schema';
import { getDb, resetConnection } from '@src/lib/db/client';
import { runMigrations } from '@src/lib/db/migrate';
import { newId } from '@src/lib/db/id';
import { provisionFinanceWorkspace } from './workspace';
import { eq } from 'drizzle-orm';

describe('Finance Workspace Provisioning & Idempotence', () => {
    const testUserId = 'user_prov_' + newId();
    let db: ReturnType<typeof getDb>;

    beforeAll(async () => {
        db = resetConnection();
        await runMigrations();

        await db.insert(schema.users).values({
            id: testUserId,
            email: `prov-${newId()}@example.com`,
            name: 'Provisioning Tester',
            role: 'member',
            passwordHash: 'dummy_hash',
        });
    });

    it('creates data source, workbook, queries, charts, and dashboard on first call', async () => {
        const result = await provisionFinanceWorkspace(testUserId);

        expect(result.dataSource).toBeDefined();
        expect(result.dataSource.name).toBe('My Finance');
        expect(result.dataSource.type).toBe('finance');
        expect(result.dataSource.ownerId).toBe(testUserId);

        expect(result.workbook).toBeDefined();
        expect(result.workbook.name).toBe('Personal Finance');
        expect(result.workbook.ownerId).toBe(testUserId);

        expect(result.queries).toHaveLength(9);
        expect(result.charts).toHaveLength(9); // 8 visual charts + 1 transactions table

        expect(result.dashboard).toBeDefined();
        expect(result.dashboard.name).toBe('Money Overview');
        expect(result.dashboard.workbookId).toBe(result.workbook.id);

        // Verify layout
        const layout = result.dashboard.layout as unknown as Array<{ x: number; y: number; w: number; h: number }>;
        expect(layout).toHaveLength(9);
        for (const item of layout) {
            expect(item.w).toBeGreaterThan(0);
            expect(item.h).toBeGreaterThan(0);
            expect(item.x + item.w).toBeLessThanOrEqual(12);
        }

        // Verify date filter
        const filters = result.dashboard.filters as unknown as Array<{ column: string; type: string }>;
        expect(filters).toHaveLength(1);
        expect(filters[0].column).toBe('date');
        expect(filters[0].type).toBe('date_range');
    });

    it('is completely idempotent: multiple calls do not create duplicates', async () => {
        const first = await provisionFinanceWorkspace(testUserId);
        const second = await provisionFinanceWorkspace(testUserId);
        const third = await provisionFinanceWorkspace(testUserId);

        expect(second.dataSource.id).toBe(first.dataSource.id);
        expect(second.workbook.id).toBe(first.workbook.id);
        expect(second.dashboard.id).toBe(first.dashboard.id);

        expect(third.dataSource.id).toBe(first.dataSource.id);
        expect(third.workbook.id).toBe(first.workbook.id);
        expect(third.dashboard.id).toBe(first.dashboard.id);

        // Verify DB counts in PostgreSQL
        const allDs = await db
            .select()
            .from(schema.dataSources)
            .where(eq(schema.dataSources.ownerId, testUserId));
        expect(allDs).toHaveLength(1);

        const allWb = await db
            .select()
            .from(schema.workbooks)
            .where(eq(schema.workbooks.ownerId, testUserId));
        expect(allWb).toHaveLength(1);

        const allQueries = await db
            .select()
            .from(schema.queries)
            .where(eq(schema.queries.workbookId, first.workbook.id));
        expect(allQueries).toHaveLength(9);

        const allCharts = await db
            .select()
            .from(schema.charts)
            .where(eq(schema.charts.workbookId, first.workbook.id));
        expect(allCharts).toHaveLength(9);

        const allDashboards = await db
            .select()
            .from(schema.dashboards)
            .where(eq(schema.dashboards.workbookId, first.workbook.id));
        expect(allDashboards).toHaveLength(1);
    });
});
