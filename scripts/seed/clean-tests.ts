import { eq, inArray, or } from 'drizzle-orm';
import { db } from '@src/lib/db';
import { charts, dashboards, dataSources, folders, queries, workbooks } from '@src/lib/db/schema';
import { listDataSources } from '@src/lib/data-sources/service';
import { listWorkbooks } from '@src/lib/workbooks/service';

export async function cleanTestData(): Promise<void> {
    console.log('--- Cleaning Test Data ---');

    // 1. Find all data sources named "Test SQLite Source" or "Test Sample Source"
    const testSources = db
        .select()
        .from(dataSources)
        .where(or(eq(dataSources.name, 'Test SQLite Source'), eq(dataSources.name, 'Test Sample Source')))
        .all();

    const testSourceIds = testSources.map((s) => s.id);
    let deletedSourcesCount = 0;
    let deletedQueriesCount = 0;
    let deletedChartsCount = 0;

    if (testSourceIds.length > 0) {
        // Find dependent queries
        const depQueries = db
            .select()
            .from(queries)
            .where(inArray(queries.dataSourceId, testSourceIds))
            .all();
        const depQueryIds = depQueries.map((q) => q.id);

        if (depQueryIds.length > 0) {
            // Find dependent charts
            const depCharts = db
                .select()
                .from(charts)
                .where(inArray(charts.queryId, depQueryIds))
                .all();
            const depChartIds = depCharts.map((c) => c.id);

            if (depChartIds.length > 0) {
                db.delete(charts).where(inArray(charts.id, depChartIds)).run();
                deletedChartsCount += depChartIds.length;
            }

            db.delete(queries).where(inArray(queries.id, depQueryIds)).run();
            deletedQueriesCount += depQueryIds.length;
        }

        db.delete(dataSources).where(inArray(dataSources.id, testSourceIds)).run();
        deletedSourcesCount += testSourceIds.length;
    }

    // 2. Find workbooks with test names: "Untitled*", "Test*", or known test workbook names
    const allWorkbooks = db.select().from(workbooks).all();
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
        const wbCharts = db.select().from(charts).where(eq(charts.workbookId, wb.id)).all();
        if (wbCharts.length > 0) {
            db.delete(charts).where(eq(charts.workbookId, wb.id)).run();
            deletedChartsCount += wbCharts.length;
        }

        const wbQueries = db.select().from(queries).where(eq(queries.workbookId, wb.id)).all();
        if (wbQueries.length > 0) {
            db.delete(queries).where(eq(queries.workbookId, wb.id)).run();
            deletedQueriesCount += wbQueries.length;
        }

        const wbDashboards = db.select().from(dashboards).where(eq(dashboards.workbookId, wb.id)).all();
        if (wbDashboards.length > 0) {
            db.delete(dashboards).where(eq(dashboards.workbookId, wb.id)).run();
            deletedDashboardsCount += wbDashboards.length;
        }

        const wbFolders = db.select().from(folders).where(eq(folders.workbookId, wb.id)).all();
        if (wbFolders.length > 0) {
            db.delete(folders).where(eq(folders.workbookId, wb.id)).run();
        }

        db.delete(workbooks).where(eq(workbooks.id, wb.id)).run();
        deletedWorkbooksCount++;
    }

    console.log('Removed Test Entities:');
    console.log(`  - Data Sources: ${deletedSourcesCount}`);
    console.log(`  - Workbooks:    ${deletedWorkbooksCount}`);
    console.log(`  - Queries:      ${deletedQueriesCount}`);
    console.log(`  - Charts:       ${deletedChartsCount}`);
    console.log(`  - Dashboards:   ${deletedDashboardsCount}`);

    console.log('\n--- Active Data Sources (API output) ---');
    const remainingSources = listDataSources();
    console.log(JSON.stringify(remainingSources, null, 2));

    console.log('\n--- Active Workbooks (API output) ---');
    const remainingWorkbooks = listWorkbooks();
    console.log(JSON.stringify(remainingWorkbooks, null, 2));
}

if (process.argv[1] && process.argv[1].endsWith('clean-tests.ts')) {
    cleanTestData().catch((err: unknown) => {
        console.error('clean-tests failed:', err);
        process.exitCode = 1;
    });
}

