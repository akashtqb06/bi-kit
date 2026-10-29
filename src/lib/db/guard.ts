import path from 'node:path';

const LOCAL_HOSTNAMES = new Set(['localhost', '127.0.0.1', '::1', 'host.docker.internal', 'postgres']);

export function isLocalDatabaseUrl(urlStr?: string): boolean {
    if (!urlStr) return true;
    try {
        const parsed = new URL(urlStr);
        return LOCAL_HOSTNAMES.has(parsed.hostname.toLowerCase());
    } catch {
        return false;
    }
}

/**
 * Hard safety guard to prevent tests or test scripts from reading or modifying
 * a remote database or the project's real `./data` folder.
 *
 * If `NODE_ENV === 'test'` or `VITEST` is set and DATABASE_URL is not local,
 * an error is immediately thrown.
 */
export function assertTestIsolationGuard(target?: string): void {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (!isTest) {
        return;
    }

    // Guard against non-local DATABASE_URL
    const dbUrl =
        target && (target.startsWith('postgres://') || target.startsWith('postgresql://'))
            ? target
            : process.env.DATABASE_URL_TEST || process.env.DATABASE_URL;

    if (dbUrl && (dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://'))) {
        if (!isLocalDatabaseUrl(dbUrl)) {
            let host = '';
            try {
                host = new URL(dbUrl).hostname;
            } catch {
                host = 'unknown';
            }
            throw new Error(
                `[TEST ISOLATION GUARD] Security violation: Test environment must NEVER connect to a non-local database ("${host}"). Tests must use PGlite or a local test database.`
            );
        }
    }

    // Keep check for file paths if target looks like a path
    if (target && !target.startsWith('postgres://') && !target.startsWith('postgresql://')) {
        const projectDataDir = path.resolve(process.cwd(), 'data');
        const resolvedPath = path.resolve(target);
        const isInsideProjectData =
            resolvedPath === projectDataDir || resolvedPath.startsWith(projectDataDir + path.sep);

        if (isInsideProjectData) {
            throw new Error(
                `[TEST ISOLATION GUARD] Security violation: Test environment must NEVER access project data folder ("${projectDataDir}"). Resolved target: "${resolvedPath}".`
            );
        }
    }
}
