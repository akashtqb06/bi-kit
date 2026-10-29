import { eq, inArray, or } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { charts, dashboards, dataSources, folders, queries, workbooks } from '@src/lib/db/schema';
import { listDataSources } from '@src/lib/data-sources/service';
import { listWorkbooks } from '@src/lib/workbooks/service';

export async function cleanTestData(): Promise<void> {
    console.log('--- Cleaning Test Data ---');

    // 1. Find all data sources named "Test SQLite Source" or "Test Sample Source"
    const testSources = await db
        .select()
        .from(dataSources)
        .where(or(eq(dataSources.name, 'Test SQLite Source'), eq(dataSources.name, 'Test Sample Source')));

    const testSourceIds = testSources.map((s) => s.id);
    let deletedSourcesCount = 0;
    let deletedQueriesCount = 0;
    let deletedChartsCount = 0;

    if (testSourceIds.length > 0) {
        // Find dependent queries
        const depQueries = await db
            .select()
            .from(queries)
            .where(inArray(queries.dataSourceId, testSourceIds));
        const depQueryIds = depQueries.map((q) => q.id);

        if (depQueryIds.length > 0) {
            // Find dependent charts
            const depCharts = await db
                .select()
                .from(charts)
                .where(inArray(charts.queryId, depQueryIds));
            const depChartIds = depCharts.map((c) => c.id);

            if (depChartIds.length > 0) {
                await db.delete(charts).where(inArray(charts.id, depChartIds));
                deletedChartsCount += depChartIds.length;
            }

            await db.delete(queries).where(inArray(queries.id, depQueryIds));
            deletedQueriesCount += depQueryIds.length;
        }

        await db.delete(dataSources).where(inArray(dataSources.id, testSourceIds));
        deletedSourcesCount += testSourceIds.length;
    }

    // 2. Find workbooks with test names: "Untitled*", "Test*", or known test workbook names
    const allWorkbooks = await db.select().from(workbooks);
    const testWorkbookNames = new Set([
        'Test Retail Workbook',
        'Alpha Finance',
        'Beta Marketing',
        'Duplicate Test Workbook',
        'Dashboard Test Workbook',
        'WB Bulk',
        'Dependency Workbook',
        'Bulk A',
        'Bulk B',
        'WB 1',
        'WB 2',
        'Original',
        'Original (Copy)',
        'Child test',
        'Route Test',
        'Route Test (Copy)',
    ]);

    const workbooksToDelete = allWorkbooks.filter((wb) => {
        // Never delete the seeded Demo Store workbook
        if (wb.name === 'Order Analysis' || wb.slug === 'order-analysis') {
            return false;
        }
        if (wb.name.startsWith('Test') || wb.name.startsWith('Untitled')) {
            return true;
        }
        return testWorkbookNames.has(wb.name);
    });

    let deletedWorkbooksCount = 0;
    let deletedDashboardsCount = 0;

    for (const wb of workbooksToDelete) {
        const wbCharts = await db.select().from(charts).where(eq(charts.workbookId, wb.id));
        if (wbCharts.length > 0) {
            await db.delete(charts).where(eq(charts.workbookId, wb.id));
            deletedChartsCount += wbCharts.length;
        }

        const wbQueries = await db.select().from(queries).where(eq(queries.workbookId, wb.id));
        if (wbQueries.length > 0) {
            await db.delete(queries).where(eq(queries.workbookId, wb.id));
            deletedQueriesCount += wbQueries.length;
        }

        const wbDashboards = await db.select().from(dashboards).where(eq(dashboards.workbookId, wb.id));
        if (wbDashboards.length > 0) {
            await db.delete(dashboards).where(eq(dashboards.workbookId, wb.id));
            deletedDashboardsCount += wbDashboards.length;
        }

        const wbFolders = await db.select().from(folders).where(eq(folders.workbookId, wb.id));
        if (wbFolders.length > 0) {
            await db.delete(folders).where(eq(folders.workbookId, wb.id));
        }

        await db.delete(workbooks).where(eq(workbooks.id, wb.id));
        deletedWorkbooksCount++;
    }

    console.log('Removed Test Entities:');
    console.log(`  - Data Sources: ${deletedSourcesCount}`);
    console.log(`  - Workbooks:    ${deletedWorkbooksCount}`);
    console.log(`  - Queries:      ${deletedQueriesCount}`);
    console.log(`  - Charts:       ${deletedChartsCount}`);
    console.log(`  - Dashboards:   ${deletedDashboardsCount}`);

    const remainingSources = await listDataSources();
    const remainingWorkbooks = await listWorkbooks();
    console.log(`Clean-up complete. Remaining: ${remainingSources.length} sources, ${remainingWorkbooks.length} workbooks.`);
}

if (process.argv[1] && process.argv[1].endsWith('clean-tests.ts')) {
    cleanTestData()
        .then(() => process.exit(0))
        .catch((err) => {
            console.error('Failed to clean test data:', err);
            process.exit(1);
        });
}
