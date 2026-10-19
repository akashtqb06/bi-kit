import path from 'node:path';
import { assertTestIsolationGuard } from './guard';

// keep: single source of truth for paths
export function getDataDir(): string {
    return path.resolve(process.cwd(), process.env.DATA_DIR ?? 'data');
}

export function getAppDbPath(): string {
    const dir = getDataDir();
    const appPath = path.resolve(process.cwd(), process.env.APP_DB_PATH ?? path.join(dir, 'app.db'));
    assertTestIsolationGuard(appPath);
    return appPath;
}

export function getSampleDbPath(): string {
    const samplePath = path.join(getDataDir(), 'sample.db');
    assertTestIsolationGuard(samplePath);
    return samplePath;
}

export function getCsvDir(): string {
    return path.join(getDataDir(), 'csv');
}

export function getUploadsDir(): string {
    return path.join(getDataDir(), 'uploads');
}

export function getAvatarsDir(): string {
    return path.join(getDataDir(), 'avatars');
}

export let DATA_DIR = getDataDir();
export let APP_DB_PATH = getAppDbPath();
export let SAMPLE_DB_PATH = getSampleDbPath();
export let CSV_DIR = getCsvDir();
export let UPLOADS_DIR = getUploadsDir();
export let AVATARS_DIR = getAvatarsDir();

export function refreshPaths(): void {
    DATA_DIR = getDataDir();
    APP_DB_PATH = getAppDbPath();
    SAMPLE_DB_PATH = getSampleDbPath();
    CSV_DIR = getCsvDir();
    UPLOADS_DIR = getUploadsDir();
    AVATARS_DIR = getAvatarsDir();
}

