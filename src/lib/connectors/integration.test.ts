import { describe, it, expect } from 'vitest';
import { getConnectorDefinition } from './registry';

const shouldRunIntegration = process.env.RUN_INTEGRATION === '1';

describe.skipIf(!shouldRunIntegration)('External SQL Connectors Live Integration Tests', () => {
    describe('PostgreSQL Live Integration', () => {
        it('connects, introspects tables, and executes read-only query', async () => {
            const def = getConnectorDefinition('postgres');
            expect(def).toBeDefined();

            const connector = def!.create({
                host: process.env.PG_HOST || 'localhost',
                port: Number(process.env.PG_PORT || 5433),
                database: process.env.PG_DATABASE || 'bikit_dev',
                username: process.env.PG_USER || 'postgres',
                password: process.env.PG_PASSWORD || 'bi_password_123!',
                ssl: { mode: 'disable' },
            });

            try {
                const testRes = await connector.test();
                expect(testRes.ok).toBe(true);
                expect(testRes.serverVersion).toBeTruthy();

                const snapshot = await connector.introspect();
                expect(snapshot.tables.length).toBeGreaterThan(0);

                const queryRes = await connector.run({
                    kind: 'sql',
                    sql: 'SELECT 1 AS num, \'hello\' AS greeting;',
                    params: [],
                });
                expect(queryRes.rowCount).toBe(1);
                expect(queryRes.rows[0][0]).toBe(1);
            } finally {
                await connector.close();
            }
        });
    });

    describe('MySQL Live Integration', () => {
        it('connects, introspects tables, and executes read-only query', async () => {
            const def = getConnectorDefinition('mysql');
            expect(def).toBeDefined();

            const connector = def!.create({
                host: process.env.MYSQL_HOST || 'localhost',
                port: Number(process.env.MYSQL_PORT || 3307),
                database: process.env.MYSQL_DATABASE || 'bikit_dev',
                username: process.env.MYSQL_USER || 'mysql',
                password: process.env.MYSQL_PASSWORD || 'bi_password_123!',
                ssl: { mode: 'disable' },
            });

            try {
                const testRes = await connector.test();
                expect(testRes.ok).toBe(true);
                expect(testRes.serverVersion).toBeTruthy();

                const snapshot = await connector.introspect();
                expect(snapshot.tables.length).toBeGreaterThan(0);

                const queryRes = await connector.run({
                    kind: 'sql',
                    sql: 'SELECT 42 AS answer;',
                    params: [],
                });
                expect(queryRes.rowCount).toBe(1);
                expect(queryRes.rows[0][0]).toBe(42);
            } finally {
                await connector.close();
            }
        });
    });

    describe('SQL Server Live Integration', () => {
        it('connects, introspects tables, and executes read-only query', async () => {
            const def = getConnectorDefinition('mssql');
            expect(def).toBeDefined();

            const connector = def!.create({
                host: process.env.MSSQL_HOST || 'localhost',
                port: Number(process.env.MSSQL_PORT || 1434),
                database: 'bikit_dev',
                username: process.env.MSSQL_USER || 'sa',
                password: process.env.MSSQL_PASSWORD || 'Bi_Strong_Password_123!',
                encrypt: false,
                trustServerCertificate: true,
            });

            try {
                const testRes = await connector.test();
                expect(testRes.ok).toBe(true);
                expect(testRes.serverVersion).toBeTruthy();

                const snapshot = await connector.introspect();
                expect(snapshot.tables.length).toBeGreaterThan(0);

                const queryRes = await connector.run({
                    kind: 'sql',
                    sql: 'SELECT 100 AS result;',
                    params: [],
                });
                expect(queryRes.rowCount).toBe(1);
                expect(queryRes.rows[0][0]).toBe(100);
            } finally {
                await connector.close();
            }
        });
    });

    describe('MongoDB Live Integration', () => {
        it('connects, introspects collections, and executes read-only pipeline query', async () => {
            const def = getConnectorDefinition('mongodb');
            expect(def).toBeDefined();

            const connector = def!.create({
                mode: 'host',
                host: process.env.MONGO_HOST || 'localhost',
                port: Number(process.env.MONGO_PORT || 27018),
                database: process.env.MONGO_DATABASE || 'bikit_dev',
                username: process.env.MONGO_USER || 'mongoadmin',
                password: process.env.MONGO_PASSWORD || 'bi_password_123!',
                authSource: process.env.MONGO_AUTH_SOURCE || 'admin',
                readPreference: 'secondaryPreferred',
                ssl: false,
                queryTimeoutMs: 15000,
            });

            try {
                const testRes = await connector.test();
                expect(testRes.ok).toBe(true);
                expect(testRes.serverVersion).toBeTruthy();

                const snapshot = await connector.introspect();
                expect(snapshot.tables.length).toBeGreaterThan(0);

                const sampleColl = snapshot.tables[0].name;
                const queryRes = await connector.run({
                    kind: 'mongo',
                    collection: sampleColl,
                    pipeline: [{ $limit: 5 }],
                });
                expect(queryRes.columns.length).toBeGreaterThan(0);
                expect(queryRes.rows.length).toBeLessThanOrEqual(5);
            } finally {
                await connector.close();
            }
        });
    });
});
