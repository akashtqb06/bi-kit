import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import {
    getConnector,
    invalidateConnector,
    runQuery,
    testConnectorConfig,
} from './manager';
import { registerConnector } from './registry';
import type { Connector, ConnectorDefinition, QueryResult, SchemaSnapshot, TestResult } from './types';
import { z } from 'zod';

class MockConnector implements Connector {
    public isClosed = false;
    public callCount = 0;

    async test(): Promise<TestResult> {
        return { ok: true, latencyMs: 5, serverVersion: '1.0-mock' };
    }

    async introspect(): Promise<SchemaSnapshot> {
        return { tables: [] };
    }

    async run(): Promise<QueryResult> {
        this.callCount++;
        return {
            columns: ['id'],
            rows: [[1]],
            rowCount: 1,
            truncated: false,
            durationMs: 2,
        };
    }

    async close(): Promise<void> {
        this.isClosed = true;
    }
}

let lastCreatedMock: MockConnector | null = null;

const mockDef: ConnectorDefinition = {
    type: 'mock_test',
    label: 'Mock Test Connector',
    category: 'sql',
    description: 'Mock',
    icon: 'Database',
    configSchema: z.object({
        host: z.string().default('mock.host'),
    }),
    fields: [],
    capabilities: {
        rawQuery: 'sql',
        operations: ['select'],
        supportsSchemas: false,
        supportsViews: false,
    },
    create: () => {
        lastCreatedMock = new MockConnector();
        return lastCreatedMock;
    },
};

describe('Connector Manager', () => {
    beforeEach(() => {
        registerConnector(mockDef);
    });

    afterEach(async () => {
        await invalidateConnector('mock-ds-1');
        await invalidateConnector('mock-ds-2');
    });

    it('caches connector instances per data source id & config', async () => {
        const ds = {
            id: 'mock-ds-1',
            type: 'mock_test',
            config: { host: 'mock.host' },
        };

        const conn1 = await getConnector(ds);
        const conn2 = await getConnector(ds);

        expect(conn1).toBe(conn2);
        expect((conn1 as MockConnector).isClosed).toBe(false);
    });

    it('invalidates and closes cached connector on invalidateConnector()', async () => {
        const ds = {
            id: 'mock-ds-1',
            type: 'mock_test',
            config: { host: 'mock.host' },
        };

        const conn1 = (await getConnector(ds)) as MockConnector;
        await invalidateConnector('mock-ds-1');

        expect(conn1.isClosed).toBe(true);

        const conn2 = (await getConnector(ds)) as MockConnector;
        expect(conn2).not.toBe(conn1);
        expect(conn2.isClosed).toBe(false);
    });

    it('caches query results and honors refresh: true', async () => {
        const ds = {
            id: 'mock-ds-2',
            type: 'mock_test',
            config: { host: 'mock.host' },
        };

        const queryReq = {
            kind: 'sql' as const,
            sql: 'SELECT 1;',
            params: [],
        };

        const res1 = await runQuery(ds, queryReq);
        expect(res1.rowCount).toBe(1);
        expect(lastCreatedMock?.callCount).toBe(1);

        // Second call should return cached result without calling connector.run() again
        const res2 = await runQuery(ds, queryReq);
        expect(res2.rowCount).toBe(1);
        expect(lastCreatedMock?.callCount).toBe(1);

        // Third call with refresh: true forces execution
        const res3 = await runQuery(ds, queryReq, { refresh: true });
        expect(res3.rowCount).toBe(1);
        expect(lastCreatedMock?.callCount).toBe(2);
    });

    it('testConnectorConfig tests unsaved configuration and closes connector cleanly', async () => {
        const testRes = await testConnectorConfig('mock_test', { host: 'mock.host' });
        expect(testRes.ok).toBe(true);
        expect(testRes.serverVersion).toBe('1.0-mock');
        expect(lastCreatedMock?.isClosed).toBe(true);
    });
});
