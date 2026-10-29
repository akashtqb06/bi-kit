import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { beforeAll, afterAll } from 'vitest';

const rawTempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'bi-kit-test-'));
const testTempDir = fs.realpathSync(rawTempDir);
process.env.DATA_DIR = testTempDir;
process.env.APP_DB_PATH = path.join(testTempDir, 'app.db');
Object.assign(process.env, { NODE_ENV: 'test' });

fs.mkdirSync(path.join(testTempDir, 'csv'), { recursive: true });
fs.mkdirSync(path.join(testTempDir, 'uploads'), { recursive: true });
fs.mkdirSync(path.join(testTempDir, 'avatars'), { recursive: true });

beforeAll(async () => {
    const { refreshPaths } = await import('@src/lib/db/paths');
    refreshPaths();
    const { resetConnection } = await import('@src/lib/db');
    resetConnection();
    const { runMigrations } = await import('@src/lib/db/migrate');
    await runMigrations();
    const { seedUsers } = await import('./scripts/seed/users');
    await seedUsers();
    const { seedDemoDatabase } = await import('./scripts/seed/demo-data');
    seedDemoDatabase({ orderCount: 150 });
    const { seedSampleWorkbook } = await import('./scripts/seed/sample-workbook');
    await seedSampleWorkbook();
});

afterAll(async () => {
    try {
        const { closeConnection } = await import('@src/lib/db');
        await closeConnection();
    } catch {}
    if (testTempDir && fs.existsSync(testTempDir)) {
        fs.rmSync(testTempDir, { recursive: true, force: true });
    }
});
