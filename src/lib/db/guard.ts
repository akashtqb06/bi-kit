import path from 'node:path';

/**
 * Hard safety guard to prevent tests or test scripts from ever reading or modifying
 * the project's real `./data` folder.
 *
 * If `NODE_ENV === 'test'` or `VITEST` is set and the resolved path is inside `<projectRoot>/data`,
 * an error is immediately thrown.
 */
export function assertTestIsolationGuard(targetPath?: string): void {
    const isTest = process.env.NODE_ENV === 'test' || Boolean(process.env.VITEST);
    if (!isTest) {
        return;
    }

    const projectDataDir = path.resolve(process.cwd(), 'data');
    const resolvedPath = path.resolve(
        targetPath ?? process.env.APP_DB_PATH ?? path.join(projectDataDir, 'app.db')
    );

    const isInsideProjectData =
        resolvedPath === projectDataDir || resolvedPath.startsWith(projectDataDir + path.sep);

    if (isInsideProjectData) {
        throw new Error(
            `[TEST ISOLATION GUARD] Security violation: Test environment must NEVER access project data folder ("${projectDataDir}"). Resolved target: "${resolvedPath}". Configure test database in temporary directory.`
        );
    }
}

