import * as fs from 'fs';
import * as path from 'path';
import Database from 'better-sqlite3';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createConnector } from './factory';
import type { DataSource } from '../db/schema';
import { DATA_DIR } from '../db/paths';

describe('connector security', () => {
    let tempDirectory: string;
    let source: DataSource;

    beforeEach(() => {
        tempDirectory = fs.mkdtempSync(path.join(DATA_DIR, '.connector-security-'));
        const sourcePath = path.join(tempDirectory, 'source.db');
        const db = new Database(sourcePath);
        db.exec('CREATE TABLE items (value INTEGER); INSERT INTO items VALUES (1), (2), (3)');
        db.close();

        source = {
            id: 'connector-security-test',
            ownerId: null,
            name: 'Connector security test',
            slug: null,
            type: 'sqlite',
            config: JSON.stringify({ path: sourcePath }),
            createdAt: new Date(),
            updatedAt: new Date(),
        };
    });

    afterEach(() => {
        fs.rmSync(tempDirectory, { recursive: true, force: true });
    });

    it('rejects paths whose canonical target escapes the data directory', () => {
        const symlinkPath = path.join(tempDirectory, 'external.db');
        fs.symlinkSync(path.resolve(process.cwd(), 'package.json'), symlinkPath);

        expect(() =>
            createConnector({
                ...source,
                config: JSON.stringify({ path: symlinkPath }),
            })
        ).toThrow('inside the data directory');
    });

    it('reports a missing source file with a stable not-found code', () => {
        expect(() =>
            createConnector({
                ...source,
                config: JSON.stringify({ path: path.join(tempDirectory, 'missing.db') }),
            })
        ).toThrow(expect.objectContaining({ code: 'SOURCE_NOT_FOUND' }));
    });

    it('enforces read-only execution and the result row cap', async () => {
        const connector = createConnector(source);
        try {
            await expect(
                connector.execute('DELETE FROM items', [], { limit: 2, timeoutMs: 1_000 })
            ).rejects.toMatchObject({ code: 'NOT_READONLY' });
            await expect(
                connector.execute('SELECT 1; SELECT 2', [], {
                    limit: 2,
                    timeoutMs: 1_000,
                })
            ).rejects.toMatchObject({ code: 'EXEC_FAILED' });

            await expect(
                connector.execute('SELECT value FROM items ORDER BY value', [], {
                    limit: 2,
                    timeoutMs: 1_000,
                })
            ).resolves.toMatchObject({
                columns: ['value'],
                rows: [[1], [2]],
                rowCount: 2,
                truncated: true,
            });
        } finally {
            connector.close();
        }
    });

    it('terminates a query that exceeds its deadline', async () => {
        const connector = createConnector(source);
        try {
            await expect(
                connector.execute(
                    'WITH RECURSIVE numbers(value) AS (SELECT 1 UNION ALL SELECT value + 1 FROM numbers WHERE value < 100000000) SELECT sum(value) FROM numbers',
                    [],
                    { limit: 10, timeoutMs: 100 }
                )
            ).rejects.toMatchObject({ code: 'QUERY_TIMEOUT' });
        } finally {
            connector.close();
        }
    });
});
