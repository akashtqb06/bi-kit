import { describe, it, expect, beforeAll } from 'vitest';
import { db } from '@src/lib/db';
import { users, dataSources } from '@src/lib/db/schema';
import { dataStoreTables } from '@src/lib/db/schema/data-store';
import { newId } from '@src/lib/db/id';
import { DatastoreConnector } from '@src/lib/connectors/drivers/datastore/connector';
import { getStoreSchemaName } from '../service';
import { executeDbQuery } from '../sync-engine';
import { ConnectorError } from '@src/lib/connectors/types';

describe('Data Store Isolation & Security', () => {
    let userAId: string;
    let userBId: string;
    let sourceAId: string;
    let sourceBId: string;
    const tableAName = 'confidential_orders';

    beforeAll(async () => {
        userAId = `user_a_${newId().slice(0, 8)}`;
        userBId = `user_b_${newId().slice(0, 8)}`;

        await db.insert(users).values([
            { id: userAId, email: `${userAId}@example.com`, name: 'User A', passwordHash: 'hash' },
            { id: userBId, email: `${userBId}@example.com`, name: 'User B', passwordHash: 'hash' },
        ]);

        sourceAId = newId();
        sourceBId = newId();

        await db.insert(dataSources).values([
            { id: sourceAId, ownerId: userAId, name: 'Data Store A', type: 'datastore', config: { isBuiltin: true, userId: userAId } },
            { id: sourceBId, ownerId: userBId, name: 'Data Store B', type: 'datastore', config: { isBuiltin: true, userId: userBId } },
        ]);

        const schemaA = getStoreSchemaName(userAId);
        await executeDbQuery(`CREATE SCHEMA IF NOT EXISTS "${schemaA}"`);
        await executeDbQuery(`
            CREATE TABLE "${schemaA}"."${tableAName}" (
                id integer primary key,
                customer_name text,
                revenue bigint
            )
        `);
        await executeDbQuery(`
            INSERT INTO "${schemaA}"."${tableAName}" (id, customer_name, revenue)
            VALUES (1, 'Secret Client', 500000)
        `);

        // Record User A's table in data_store_tables
        await db.insert(dataStoreTables).values({
            ownerId: userAId,
            dataSourceId: sourceAId,
            kind: 'table',
            sourceTable: 'orders',
            storeSchema: schemaA,
            storeTable: tableAName,
            columns: [
                { name: 'id', type: 'integer', nativeType: 'integer', isPk: true },
                { name: 'customer_name', type: 'text', nativeType: 'text' },
                { name: 'revenue', type: 'bigint', nativeType: 'bigint' },
            ],
            rowCount: 1,
            sizeBytes: 1024,
            status: 'synced',
        });
    });

    it('User B cannot see User A store tables during catalog introspection', async () => {
        const connectorA = new DatastoreConnector({ isBuiltin: true, userId: userAId });
        const schemaA = await connectorA.introspect();
        expect(schemaA.tables.some((t) => t.name === tableAName)).toBe(true);

        const connectorB = new DatastoreConnector({ isBuiltin: true, userId: userBId });
        const schemaB = await connectorB.introspect();
        expect(schemaB.tables.some((t) => t.name === tableAName)).toBe(false);
        expect(schemaB.tables.length).toBe(0);
    });

    it('User B cannot query User A store tables using crafted table name references', async () => {
        const connectorB = new DatastoreConnector({ isBuiltin: true, userId: userBId });

        // User B tries to query User A's table directly
        await expect(
            connectorB.run({
                kind: 'sql',
                sql: `SELECT * FROM ${tableAName}`,
            })
        ).rejects.toThrow(ConnectorError);

        await expect(
            connectorB.run({
                kind: 'sql',
                sql: `SELECT * FROM ${tableAName}`,
            })
        ).rejects.toMatchObject({
            code: 'NO_TABLES',
        });
    });

    it('User B cannot query User A store schema directly with qualified schema syntax', async () => {
        const connectorB = new DatastoreConnector({ isBuiltin: true, userId: userBId });
        const schemaA = getStoreSchemaName(userAId);

        await expect(
            connectorB.run({
                kind: 'sql',
                sql: `SELECT * FROM "${schemaA}"."${tableAName}"`,
            })
        ).rejects.toMatchObject({
            code: 'ACCESS_DENIED',
        });
    });

    it('User B cannot query application metadata or users table via datastore connector', async () => {
        const connectorB = new DatastoreConnector({ isBuiltin: true, userId: userBId });

        await expect(
            connectorB.run({
                kind: 'sql',
                sql: `SELECT email FROM users`,
            })
        ).rejects.toMatchObject({
            code: 'ACCESS_DENIED',
        });
    });

    it('rejects mutation queries on datastore connector', async () => {
        const connectorA = new DatastoreConnector({ isBuiltin: true, userId: userAId });

        await expect(
            connectorA.run({
                kind: 'sql',
                sql: `DROP TABLE ${tableAName}`,
            })
        ).rejects.toMatchObject({
            code: 'READONLY_VIOLATION',
        });

        await expect(
            connectorA.run({
                kind: 'sql',
                sql: `DELETE FROM ${tableAName}`,
            })
        ).rejects.toMatchObject({
            code: 'READONLY_VIOLATION',
        });
    });

    it('User A can successfully query their own store table via the scoping compiler', async () => {
        const connectorA = new DatastoreConnector({ isBuiltin: true, userId: userAId });
        const result = await connectorA.run({
            kind: 'sql',
            sql: `SELECT customer_name, revenue FROM ${tableAName}`,
        });

        expect(result.rowCount).toBe(1);
        expect(result.columns).toEqual(['customer_name', 'revenue']);
        expect(result.rows[0][0]).toBe('Secret Client');
    });
});

