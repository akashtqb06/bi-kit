import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import { UnauthorizedError } from '@src/lib/auth/policy';

function getApiRouteFiles(dir: string, fileList: string[] = []): string[] {
    const files = fs.readdirSync(dir);
    for (const file of files) {
        const fullPath = path.join(dir, file);
        const stat = fs.statSync(fullPath);
        if (stat.isDirectory()) {
            getApiRouteFiles(fullPath, fileList);
        } else if (file === 'route.ts') {
            fileList.push(fullPath);
        }
    }
    return fileList;
}

describe('API Security Gate: Authentication Enforcement on All Route Handlers', () => {
    const apiRootDir = path.join(process.cwd(), 'src/app/api');
    const routeFiles = getApiRouteFiles(apiRootDir);

    it('finds all API route files in src/app/api', () => {
        expect(routeFiles.length).toBeGreaterThanOrEqual(40);
    });

    for (const filePath of routeFiles) {
        const relPath = path.relative(process.cwd(), filePath);
        const apiPath = relPath
            .replace(/^src\/app/, '')
            .replace(/\/route\.ts$/, '');

        // Exclude intentionally public routes
        if (apiPath === '/api/health') {
            continue;
        }

        it(`rejects unauthenticated requests with 401 on ${apiPath}`, async () => {
            const routeModule = await import(filePath);
            const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE'] as const;

            let methodTested = false;

            for (const method of methods) {
                const handler = routeModule[method];
                if (typeof handler === 'function') {
                    methodTested = true;
                    const req = new Request(`http://localhost${apiPath}`, {
                        method,
                        headers: {
                            'Content-Type': 'application/json',
                        },
                        body: method !== 'GET' ? JSON.stringify({}) : undefined,
                    });

                    const dummyContext = {
                        params: Promise.resolve({
                            id: 'test-unauth-id',
                            queryId: 'test-query-id',
                        }),
                    };

                    try {
                        const response = await handler(req, dummyContext);
                        expect(response.status).toBe(401);
                    } catch (err: unknown) {
                        // Handler threw UnauthorizedError directly before handleApiError
                        const isUnauthorized =
                            err instanceof UnauthorizedError ||
                            (err instanceof Error && err.name === 'UnauthorizedError') ||
                            (err instanceof Error && err.message.toLowerCase().includes('unauthorized'));
                        expect(isUnauthorized).toBe(true);
                    }
                }
            }

            expect(methodTested).toBe(true);
        });
    }
});

