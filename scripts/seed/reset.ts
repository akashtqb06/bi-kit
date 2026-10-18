import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import { sql } from 'drizzle-orm';
import { APP_DB_PATH, AVATARS_DIR, CSV_DIR, DATA_DIR, SAMPLE_DB_PATH, UPLOADS_DIR } from '@src/lib/db/paths';
import { assertTestIsolationGuard } from '@src/lib/db/guard';

async function checkPortListening(port: number): Promise<boolean> {
    const checkHost = (host: string): Promise<boolean> => {
        return new Promise((resolve) => {
            const socket = new net.Socket();
            socket.setTimeout(400);
            socket.once('connect', () => {
                socket.destroy();
                resolve(true);
            });
            socket.once('timeout', () => {
                socket.destroy();
                resolve(false);
            });
            socket.once('error', () => {
                socket.destroy();
                resolve(false);
            });
            socket.connect(port, host);
        });
    };

    const isIpv4 = await checkHost('127.0.0.1');
    if (isIpv4) return true;
    const isIpv6 = await checkHost('::1');
    return isIpv6;
}

async function resetDatabase(): Promise<void> {
    assertTestIsolationGuard(APP_DB_PATH);

    const hasForceFlag = process.argv.includes('--force');
    if (!hasForceFlag) {
        const portActive = await checkPortListening(3000);
        if (portActive) {
            console.error('Refusing to reset database while dev server is listening on port 3000. Stop it first or pass --force.');
            process.exit(1);
        }
    }

    console.log('Resetting local databases, CSV, upload, and avatar artifacts...');
    const deletedFiles: string[] = [];

    function removeFile(filePath: string) {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { force: true });
            deletedFiles.push(filePath);
        }
    }

    // Delete databases and WAL/SHM
    for (const databasePath of [APP_DB_PATH, SAMPLE_DB_PATH]) {
        for (const suffix of ['', '-wal', '-shm']) {
            removeFile(`${databasePath}${suffix}`);
        }
    }

    // Delete data/csv/*, data/uploads/*, data/avatars/* (keep .gitkeep)
    for (const dir of [CSV_DIR, UPLOADS_DIR, AVATARS_DIR]) {
        if (fs.existsSync(dir)) {
            const entries = fs.readdirSync(dir, { withFileTypes: true });
            for (const entry of entries) {
                if (entry.name === '.gitkeep') continue;
                const fullPath = path.join(dir, entry.name);
                fs.rmSync(fullPath, { recursive: true, force: true });
                deletedFiles.push(fullPath);
            }
        }
    }

    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.mkdirSync(CSV_DIR, { recursive: true });
    fs.mkdirSync(UPLOADS_DIR, { recursive: true });
    fs.mkdirSync(AVATARS_DIR, { recursive: true });

    console.log('Deleted files:');
    if (deletedFiles.length === 0) {
        console.log('  (no files existed to delete)');
    } else {
        deletedFiles.forEach((file) => console.log(`  - ${file}`));
    }

    const { resetConnection, db } = await import('@src/lib/db');
    resetConnection();

    // 1. Run migrations
    const { runMigrations } = await import('@src/lib/db/migrate');
    runMigrations();
    console.log(`Migrated application database at ${APP_DB_PATH}`);

    // 2. Seed Users
    const { seedUsers } = await import('./users');
    const { admin, member } = await seedUsers();

    // 3. Seed Demo Data (sample.db)
    const { seedDemoDatabase } = await import('./demo-data');
    seedDemoDatabase();

    // 4. Seed Workbooks (admin & member)
    const { seedSampleWorkbook } = await import('./sample-workbook');
    await seedSampleWorkbook();

    const {
        users,
        sessions,
        loginAttempts,
        appSettings,
        dataSources,
        workbooks,
        queries,
        charts,
        dashboards,
        dashboardFavorites,
        dashboardViews,
    } = await import('@src/lib/db/schema');

    const counts = {
        users: db.select({ count: sql<number>`count(*)` }).from(users).get()?.count ?? 0,
        sessions: db.select({ count: sql<number>`count(*)` }).from(sessions).get()?.count ?? 0,
        login_attempts: db.select({ count: sql<number>`count(*)` }).from(loginAttempts).get()?.count ?? 0,
        app_settings: db.select({ count: sql<number>`count(*)` }).from(appSettings).get()?.count ?? 0,
        data_sources: db.select({ count: sql<number>`count(*)` }).from(dataSources).get()?.count ?? 0,
        workbooks: db.select({ count: sql<number>`count(*)` }).from(workbooks).get()?.count ?? 0,
        queries: db.select({ count: sql<number>`count(*)` }).from(queries).get()?.count ?? 0,
        charts: db.select({ count: sql<number>`count(*)` }).from(charts).get()?.count ?? 0,
        dashboards: db.select({ count: sql<number>`count(*)` }).from(dashboards).get()?.count ?? 0,
        dashboard_favorites: db.select({ count: sql<number>`count(*)` }).from(dashboardFavorites).get()?.count ?? 0,
        dashboard_views: db.select({ count: sql<number>`count(*)` }).from(dashboardViews).get()?.count ?? 0,
    };

    console.log('\nFinal row counts per table:');
    console.log(`  users:               ${counts.users}`);
    console.log(`  sessions:            ${counts.sessions}`);
    console.log(`  login_attempts:      ${counts.login_attempts}`);
    console.log(`  app_settings:        ${counts.app_settings}`);
    console.log(`  data_sources:        ${counts.data_sources}`);
    console.log(`  workbooks:           ${counts.workbooks}`);
    console.log(`  queries:             ${counts.queries}`);
    console.log(`  charts:              ${counts.charts}`);
    console.log(`  dashboards:          ${counts.dashboards}`);
    console.log(`  dashboard_favorites: ${counts.dashboard_favorites}`);
    console.log(`  dashboard_views:     ${counts.dashboard_views}`);

    const adminPassword = process.env.SEED_ADMIN_PASSWORD ?? 'ChangeMe123!';
    const memberPassword = process.env.SEED_DEMO_USER_PASSWORD ?? 'ChangeMe123!';

    console.log('\nDemo Logins:');
    console.log(`  Admin:        ${admin.email} (password: ${adminPassword})`);
    console.log(`  Demo Member:  ${member.email} (password: ${memberPassword})`);
    console.log('\nDatabase reset and demo data setup completed successfully.');
}

resetDatabase().catch((error: unknown) => {
    console.error('Database reset failed:', error);
    process.exit(1);
});
