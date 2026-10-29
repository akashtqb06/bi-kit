import { describe, it, expect, vi } from 'vitest';
import {
    createDashboard,
    deleteDashboard,
} from '@src/lib/dashboards/service';
import { createWorkbook, deleteWorkbook } from '@src/lib/workbooks/service';
import { GET as getDashboardsRoute } from '@src/app/api/dashboards/route';
import { PATCH as patchDashboardRoute } from '@src/app/api/dashboards/[id]/route';
import { POST as postDashboardViewRoute } from '@src/app/api/dashboards/[id]/view/route';

vi.mock('@src/lib/auth/session', async (importOriginal) => {
    const actual = await importOriginal<typeof import('@src/lib/auth/session')>();
    return {
        ...actual,
        getSession: vi.fn(async () => {
            const { db } = await import('@src/lib/db');
            const { users } = await import('@src/lib/db/schema');
            const { eq } = await import('drizzle-orm');
            const [adminUser] = await db.select().from(users).where(eq(users.role, 'admin')).limit(1);
            if (!adminUser) return null;
            return {
                user: adminUser,
                session: {
                    id: 'test-admin-session',
                    userId: adminUser.id,
                    tokenHash: 'hash',
                    createdAt: new Date(),
                    lastUsedAt: new Date(),
                    expiresAt: new Date(Date.now() + 3600_000),
                    ipAddress: '127.0.0.1',
                    userAgent: 'Vitest',
                },
            };
        }),
    };
});

describe('Dashboards Tile View & API Integration', () => {
    it('returns chartCount, viewCount, isFavorite, lastViewedAt, layout in GET /api/dashboards', async () => {
        const wb = await createWorkbook({ name: 'Tile View Workbook' });
        const d1 = await createDashboard(wb.id, {
            title: 'Tile View Test 1',
            layout: [
                { i: 'tile_1', x: 0, y: 0, w: 6, h: 4, widgetType: 'chart' },
                { i: 'tile_2', x: 6, y: 0, w: 6, h: 4, widgetType: 'chart' },
            ],
        });

        try {
            const req = new Request('http://localhost/api/dashboards');
            const res = await getDashboardsRoute(req);
            expect(res.status).toBe(200);

            const json = (await res.json()) as { data: Array<Record<string, unknown>> };
            const found = json.data.find((d) => d.id === d1.id);

            expect(found).toBeDefined();
            expect(found?.title).toBe('Tile View Test 1');
            expect(found?.workbookId).toBe(wb.id);
            expect(found?.workbookTitle).toBe('Tile View Workbook');
            expect(found?.chartCount).toBe(2);
            expect(found?.viewCount).toBe(0);
            expect(found?.isFavorite).toBe(false);
            expect(found?.lastViewedAt).toBeNull();
            expect(Array.isArray(found?.layout)).toBe(true);
        } finally {
            await deleteDashboard(d1.id);
            await deleteWorkbook(wb.id);
        }
    });

    it('toggles isFavorite via PATCH /api/dashboards/[id]', async () => {
        const wb = await createWorkbook({ name: 'Favorites API Workbook' });
        const d = await createDashboard(wb.id, { title: 'Favorite Dashboard' });

        try {
            expect(d.isFavorite).toBe(false);

            // Toggle favorite to true
            const patchReq = new Request(`http://localhost/api/dashboards/${d.id}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ isFavorite: true }),
            });
            const patchRes = await patchDashboardRoute(patchReq, {
                params: Promise.resolve({ id: d.id }),
            });
            expect(patchRes.status).toBe(200);
            const patchJson = (await patchRes.json()) as { data: { isFavorite: boolean } };
            expect(patchJson.data.isFavorite).toBe(true);

            // Verify persistence in GET /api/dashboards?filter=favorites
            const favReq = new Request('http://localhost/api/dashboards?filter=favorites');
            const favRes = await getDashboardsRoute(favReq);
            const favJson = (await favRes.json()) as { data: Array<{ id: string }> };
            expect(favJson.data.some((item) => item.id === d.id)).toBe(true);
        } finally {
            await deleteDashboard(d.id);
            await deleteWorkbook(wb.id);
        }
    });

    it('increments viewCount and updates lastViewedAt via POST /api/dashboards/[id]/view', async () => {
        const wb = await createWorkbook({ name: 'Views API Workbook' });
        const d = await createDashboard(wb.id, { title: 'Views Dashboard' });

        try {
            expect(d.viewCount).toBe(0);
            expect(d.lastViewedAt).toBeNull();

            // First view
            const viewReq1 = new Request(`http://localhost/api/dashboards/${d.id}/view`, {
                method: 'POST',
            });
            const viewRes1 = await postDashboardViewRoute(viewReq1, {
                params: Promise.resolve({ id: d.id }),
            });
            expect(viewRes1.status).toBe(200);
            const viewJson1 = (await viewRes1.json()) as { data: { viewCount: number; lastViewedAt: string } };
            expect(viewJson1.data.viewCount).toBe(1);
            expect(viewJson1.data.lastViewedAt).toBeTruthy();

            // Second view
            const viewReq2 = new Request(`http://localhost/api/dashboards/${d.id}/view`, {
                method: 'POST',
            });
            const viewRes2 = await postDashboardViewRoute(viewReq2, {
                params: Promise.resolve({ id: d.id }),
            });
            const viewJson2 = (await viewRes2.json()) as { data: { viewCount: number } };
            expect(viewJson2.data.viewCount).toBe(2);

            // Verify recents filter retrieves it
            const recentsReq = new Request('http://localhost/api/dashboards?filter=recents');
            const recentsRes = await getDashboardsRoute(recentsReq);
            const recentsJson = (await recentsRes.json()) as { data: Array<{ id: string; viewCount: number }> };
            const recentItem = recentsJson.data.find((item) => item.id === d.id);
            expect(recentItem).toBeDefined();
            expect(recentItem?.viewCount).toBe(2);
        } finally {
            await deleteDashboard(d.id);
            await deleteWorkbook(wb.id);
        }
    });

    it('filters by search query ?q= matching title or workbookTitle', async () => {
        const wb = await createWorkbook({ name: 'Searchable Enterprise' });
        const d1 = await createDashboard(wb.id, { title: 'UniqueXFinanceReview' });
        const d2 = await createDashboard(wb.id, { title: 'OtherMetrics' });

        try {
            const req = new Request('http://localhost/api/dashboards?q=UniqueX');
            const res = await getDashboardsRoute(req);
            const json = (await res.json()) as { data: Array<{ id: string }> };
            expect(json.data.some((item) => item.id === d1.id)).toBe(true);
            expect(json.data.some((item) => item.id === d2.id)).toBe(false);
        } finally {
            await deleteDashboard(d1.id);
            await deleteDashboard(d2.id);
            await deleteWorkbook(wb.id);
        }
    });

    it('verifies seeded Sales Overview dashboard returns miniature layout with chart types', async () => {
        const req = new Request('http://localhost/api/dashboards?q=Sales%20Overview');
        const res = await getDashboardsRoute(req);
        expect(res.status).toBe(200);
        const json = (await res.json()) as { data: Array<{ title: string; chartCount: number; layout: Array<{ chartType?: string; x: number; y: number; w: number; h: number }> }> };
        const salesOverview = json.data.find((d) => d.title === 'Sales Overview');
        expect(salesOverview).toBeDefined();
        expect(salesOverview!.chartCount).toBeGreaterThan(0);
        expect(salesOverview!.layout.length).toBeGreaterThan(0);

        // Every item has valid grid coordinates for miniature rendering
        for (const item of salesOverview!.layout) {
            expect(item.x).toBeGreaterThanOrEqual(0);
            expect(item.y).toBeGreaterThanOrEqual(0);
            expect(item.w).toBeGreaterThan(0);
            expect(item.h).toBeGreaterThan(0);
            expect(item.x + item.w).toBeLessThanOrEqual(12);
        }

        // Has varied chart types (bar, line, donut, number, etc.)
        const chartTypes = salesOverview!.layout.map((item) => item.chartType);
        expect(chartTypes.some((t) => t === 'line' || t === 'bar' || t === 'number' || t === 'donut')).toBe(true);
    });
});
