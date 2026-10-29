import fs from 'node:fs';
import path from 'node:path';
import net from 'node:net';
import readline from 'node:readline';
import { sql } from 'drizzle-orm';
import { AVATARS_DIR, CSV_DIR, DATA_DIR, SAMPLE_DB_PATH, UPLOADS_DIR } from '@src/lib/db/paths';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres']);

async function promptQuestion(promptText: string): Promise<string> {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout,
    });

    return new Promise((resolve) => {
        rl.question(promptText, (answer) => {
            rl.close();
            resolve(answer.trim());
        });
    });
}

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
    // 1. Always refuse when NODE_ENV=production
    if (process.env.NODE_ENV === 'production') {
        console.error('Refusing to reset database in production environment (NODE_ENV=production).');
        process.exit(1);
    }

    // 2. Check DATABASE_URL locality guard
    const dbUrl = process.env.DATABASE_URL || 'postgres://postgres:bi_password_123!@localhost:5432/bikit_dev';
    let host = 'localhost';
    let dbName = 'bikit_dev';
    try {
        const parsed = new URL(dbUrl);
        host = parsed.hostname.toLowerCase();
        dbName = parsed.pathname.replace(/^\//, '');
    } catch {
        // ignore
    }

    const isLocal = LOCAL_HOSTNAMES.has(host);
    const hasRemoteFlag = process.argv.includes('--i-know-this-is-remote');

    if (!isLocal) {
        if (!hasRemoteFlag) {
            console.error(
                `[SAFETY REFUSAL] Refusing to reset non-local database at host "${host}".\nPass --i-know-this-is-remote and confirm database name to proceed.`
            );
            process.exit(1);
        }

        const typedName = await promptQuestion(
            `\n[WARNING] You are about to reset remote database at "${host}".\nType the database name ("${dbName}") to confirm: `
        );

        if (typedName !== dbName) {
            console.error('Confirmation mismatch: Database name typed does not match. Aborting reset.');
            process.exit(1);
        }
    }

    const hasForceFlag = process.argv.includes('--force');
    if (!hasForceFlag) {
        const portActive = await checkPortListening(3000);
        if (portActive) {
            console.error('Refusing to reset database while dev server is listening on port 3000. Stop it first or pass --force.');
            process.exit(1);
        }
    }

    console.log('Resetting database schema, sample SQLite db, CSV, upload, and avatar artifacts...');
    const deletedFiles: string[] = [];

    function removeFile(filePath: string) {
        if (fs.existsSync(filePath)) {
            fs.rmSync(filePath, { force: true });
            deletedFiles.push(filePath);
        }
    }

    // Delete sample database and WAL/SHM
    for (const suffix of ['', '-wal', '-shm']) {
        removeFile(`${SAMPLE_DB_PATH}${suffix}`);
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

    console.log('Deleted local file artifacts:');
    if (deletedFiles.length === 0) {
        console.log('  (no files existed to delete)');
    } else {
        deletedFiles.forEach((file) => console.log(`  - ${file}`));
    }

    const { resetConnection, db } = await import('@src/lib/db');
    resetConnection();

    // 1. Drop and recreate public schema (and drop drizzle migrations tracking schema)
    console.log('Dropping and recreating PostgreSQL public and drizzle schemas...');
    await db.execute(sql`DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public; DROP SCHEMA IF EXISTS drizzle CASCADE;`);

    // 2. Run migrations
    const { runMigrations } = await import('@src/lib/db/migrate');
    await runMigrations();
    console.log('Migrated application database successfully.');

    // 3. Seed Users
    const { seedUsers } = await import('./users');
    const { admin, member } = await seedUsers();

    // 4. Seed Demo Data (sample.db)
    const { seedDemoDatabase } = await import('./demo-data');
    seedDemoDatabase();

    // 5. Seed Workbooks (admin & member)
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
        users: (await db.select({ count: sql<number>`count(*)::int` }).from(users))[0]?.count ?? 0,
        sessions: (await db.select({ count: sql<number>`count(*)::int` }).from(sessions))[0]?.count ?? 0,
        login_attempts: (await db.select({ count: sql<number>`count(*)::int` }).from(loginAttempts))[0]?.count ?? 0,
        app_settings: (await db.select({ count: sql<number>`count(*)::int` }).from(appSettings))[0]?.count ?? 0,
        data_sources: (await db.select({ count: sql<number>`count(*)::int` }).from(dataSources))[0]?.count ?? 0,
        workbooks: (await db.select({ count: sql<number>`count(*)::int` }).from(workbooks))[0]?.count ?? 0,
        queries: (await db.select({ count: sql<number>`count(*)::int` }).from(queries))[0]?.count ?? 0,
        charts: (await db.select({ count: sql<number>`count(*)::int` }).from(charts))[0]?.count ?? 0,
        dashboards: (await db.select({ count: sql<number>`count(*)::int` }).from(dashboards))[0]?.count ?? 0,
        dashboard_favorites: (await db.select({ count: sql<number>`count(*)::int` }).from(dashboardFavorites))[0]?.count ?? 0,
        dashboard_views: (await db.select({ count: sql<number>`count(*)::int` }).from(dashboardViews))[0]?.count ?? 0,
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
