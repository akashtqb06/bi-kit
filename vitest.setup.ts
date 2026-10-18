import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';

let testTempDir: string | undefined;

export async function setup() {
    const rawTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-kit-test-'));
    testTempDir = fs.realpathSync(rawTempDir);
    process.env.DATA_DIR = testTempDir;
    process.env.APP_DB_PATH = path.join(testTempDir, 'app.db');
    Object.assign(process.env, { NODE_ENV: 'test' });

    fs.mkdirSync(path.join(testTempDir, 'csv'), { recursive: true });
    fs.mkdirSync(path.join(testTempDir, 'uploads'), { recursive: true });
    fs.mkdirSync(path.join(testTempDir, 'avatars'), { recursive: true });

    // Refresh path constants
    const { refreshPaths } = await import('@src/lib/db/paths');
    refreshPaths();

    // Run migrations using app helper
    const { runMigrations } = await import('@src/lib/db/migrate');
    runMigrations();

    // Seed users, demo database & sample workbook into temp DB
    const { seedUsers } = await import('./scripts/seed/users');
    await seedUsers();
    const { seedDemoDatabase } = await import('./scripts/seed/demo-data');
    seedDemoDatabase();
    const { seedSampleWorkbook } = await import('./scripts/seed/sample-workbook');
    await seedSampleWorkbook();

    return async () => {
        // Global teardown
        try {
            const { db } = await import('@src/lib/db');
            db.$client.close();
        } catch {}
        if (testTempDir && fs.existsSync(testTempDir)) {
            fs.rmSync(testTempDir, { recursive: true, force: true });
        }
    };
}
