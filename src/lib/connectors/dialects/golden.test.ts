import { describe, it, expect } from 'vitest';
import { compile } from '@src/lib/query-engine/compiler';
import { validateReadOnly, ReadOnlyValidationError } from '@src/lib/query-engine/validate-readonly';
import { inlineParams } from '@src/lib/query-engine/inline-params';
import {
    sqliteDialect,
    postgresDialect,
    mysqlDialect,
    mssqlDialect,
    getDialect,
} from './index';
import type { SchemaInfo } from '@src/lib/connectors/types';
import type { QueryDefinition } from '@src/lib/query-engine/definition';

const sampleSchema: SchemaInfo = {
    tables: [
        {
            name: 'orders',
            columns: [
                { name: 'order_id', type: 'text', nullable: false },
                { name: 'customer_id', type: 'text', nullable: false },
                { name: 'order_status', type: 'text', nullable: false },
                { name: 'order_purchase_timestamp', type: 'date', nullable: false },
                { name: 'total', type: 'number', nullable: false },
            ],
        },
        {
            name: 'order_items',
            columns: [
                { name: 'order_id', type: 'text', nullable: false },
                { name: 'product_id', type: 'text', nullable: false },
                { name: 'quantity', type: 'number', nullable: false },
                { name: 'price', type: 'number', nullable: false },
            ],
        },
    ],
};

describe('Dialects Golden SQL Compilation', () => {
    const complexDef: QueryDefinition = {
        source: { table: 'orders' },
        steps: [
            {
                type: 'filter',
                conditions: {
                    logic: 'and',
                    items: [
                        { column: 'order_status', op: '=', value: 'delivered' },
                        { column: 'total', op: '>=', value: 100 },
                    ],
                },
            },
            {
                type: 'join',
                joinType: 'inner',
                table: 'order_items',
                on: [{ left: 'order_id', right: 'order_id' }],
            },
            {
                type: 'summarize',
                groupBy: [{ column: 'order_purchase_timestamp', dateGrain: 'month' }],
                aggregates: [
                    { fn: 'sum', column: 'price', alias: 'total_revenue' },
                    { fn: 'count_distinct', column: 'order_id', alias: 'distinct_orders' },
                ],
            },
            {
                type: 'order',
                items: [{ column: 'total_revenue', dir: 'desc' }],
            },
            {
                type: 'limit',
                value: 20,
            },
        ],
    };

    it('compiles for SQLite with double quotes, strftime, and ? placeholders', () => {
        const res = compile(complexDef, { schema: sampleSchema, dialect: sqliteDialect });

        expect(res.sql).toContain('strftime(');
        expect(res.sql).toContain('"order_status" = ?');
        expect(res.sql).toContain('LIMIT 20');
        expect(res.sql).toContain('SUM("price") AS "total_revenue"');
        expect(res.params).toEqual(['delivered', 100]);

        const inlined = inlineParams(res.sql, res.params, sqliteDialect);
        expect(inlined).toContain("'delivered'");
        expect(inlined).not.toContain('?');
    });

    it('compiles for PostgreSQL with double quotes, date_trunc, and $1..$n placeholders', () => {
        const res = compile(complexDef, { schema: sampleSchema, dialect: postgresDialect });

        expect(res.sql).toContain("date_trunc('month'");
        expect(res.sql).toContain('"order_status" = $1');
        expect(res.sql).toContain('"total" >= $2');
        expect(res.sql).toContain('LIMIT 20');
        expect(res.params).toEqual(['delivered', 100]);

        const inlined = inlineParams(res.sql, res.params, postgresDialect);
        expect(inlined).toContain("'delivered'");
        expect(inlined).not.toContain('$1');
    });

    it('compiles for MySQL with backticks, DATE_FORMAT, and ? placeholders', () => {
        const res = compile(complexDef, { schema: sampleSchema, dialect: mysqlDialect });

        expect(res.sql).toContain('`order_status` = ?');
        expect(res.sql).toContain('`total` >= ?');
        expect(res.sql).toContain('DATE_FORMAT(');
        expect(res.sql).toContain('LIMIT 20');
        expect(res.params).toEqual(['delivered', 100]);

        const inlined = inlineParams(res.sql, res.params, mysqlDialect);
        expect(inlined).toContain('`orders`');
        expect(inlined).toContain("'delivered'");
        expect(inlined).not.toContain('?');
    });

    it('compiles for SQL Server with brackets, DATEADD/DATEDIFF, @p1 placeholders, and TOP/paginate', () => {
        const res = compile(complexDef, { schema: sampleSchema, dialect: mssqlDialect });

        expect(res.sql).toContain('[order_status] = @p1');
        expect(res.sql).toContain('[total] >= @p2');
        expect(res.sql).toContain('DATEADD(month, DATEDIFF(month, 0');
        expect(res.sql).toContain('SELECT TOP 20 *');
        expect(res.params).toEqual(['delivered', 100]);

        const inlined = inlineParams(res.sql, res.params, mssqlDialect);
        expect(inlined).toContain('[orders]');
        expect(inlined).toContain("'delivered'");
        expect(inlined).not.toContain('@p1');

        const paginated = mssqlDialect.paginate('SELECT * FROM [orders]', 20, 0);
        expect(paginated).toContain('OFFSET 0 ROWS FETCH NEXT 20 ROWS ONLY');
    });

    it('handles MSSQL CTE ordering restriction with TOP 100 PERCENT in intermediate CTEs', () => {
        const cteDef: QueryDefinition = {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'order',
                    items: [{ column: 'total', dir: 'desc' }],
                },
                {
                    type: 'summarize',
                    groupBy: [{ column: 'customer_id' }],
                    aggregates: [{ fn: 'count', column: 'order_id', alias: 'orders_count' }],
                },
            ],
        };

        const res = compile(cteDef, { schema: sampleSchema, dialect: mssqlDialect });
        expect(res.sql).toContain('SELECT TOP 100 PERCENT');
    });

    it('getDialect returns correct dialect by connector type and defaults gracefully to SQLite', () => {
        expect(getDialect('postgres').name).toBe('postgres');
        expect(getDialect('mysql').name).toBe('mysql');
        expect(getDialect('mssql').name).toBe('mssql');
        expect(getDialect('sqlite').name).toBe('sqlite');
        expect(getDialect('csv').name).toBe('sqlite');
        expect(getDialect('excel').name).toBe('sqlite');
        expect(getDialect('unknown-custom').name).toBe('sqlite');
    });
});

describe('Read-Only SQL Validation Across Dialects', () => {
    it('accepts valid read-only SELECT and WITH statements', () => {
        expect(() => validateReadOnly('SELECT 1', 'sqlite')).not.toThrow();
        expect(() => validateReadOnly('SELECT * FROM "orders" WHERE "status" = \'active\'', 'postgres')).not.toThrow();
        expect(() => validateReadOnly('SELECT * FROM `orders` LIMIT 10', 'mysql')).not.toThrow();
        expect(() => validateReadOnly('WITH cte AS (SELECT 1 AS val) SELECT * FROM cte', 'mssql')).not.toThrow();
    });

    it('rejects multiple statements separated by semicolons', () => {
        expect(() => validateReadOnly('SELECT 1; SELECT 2', 'sqlite')).toThrow(ReadOnlyValidationError);
        expect(() => validateReadOnly('SELECT 1; DROP TABLE orders;', 'postgres')).toThrow(ReadOnlyValidationError);
    });

    it('rejects mutation statements across all dialects', () => {
        expect(() => validateReadOnly('DELETE FROM orders', 'sqlite')).toThrow(ReadOnlyValidationError);
        expect(() => validateReadOnly('INSERT INTO orders VALUES (1)', 'postgres')).toThrow(ReadOnlyValidationError);
        expect(() => validateReadOnly('UPDATE orders SET status = "bad"', 'mysql')).toThrow(ReadOnlyValidationError);
        expect(() => validateReadOnly('DROP TABLE orders', 'mssql')).toThrow(ReadOnlyValidationError);
        expect(() => validateReadOnly('ALTER TABLE orders ADD col int', 'sqlite')).toThrow(ReadOnlyValidationError);
    });

    it('rejects dialect-specific escape hatches and dangerous commands', () => {
        // Postgres COPY
        expect(() => validateReadOnly('COPY orders TO \'/tmp/pwn\'', 'postgres')).toThrow(ReadOnlyValidationError);
        // Postgres pg_sleep
        expect(() => validateReadOnly('SELECT pg_sleep(10)', 'postgres')).toThrow(ReadOnlyValidationError);

        // MySQL INTO OUTFILE
        expect(() => validateReadOnly('SELECT * FROM orders INTO OUTFILE \'/tmp/data.csv\'', 'mysql')).toThrow(ReadOnlyValidationError);

        // MSSQL EXEC / xp_cmdshell
        expect(() => validateReadOnly('EXEC xp_cmdshell \'whoami\'', 'mssql')).toThrow(ReadOnlyValidationError);
        expect(() => validateReadOnly('EXECUTE sp_executesql N\'SELECT 1\'', 'mssql')).toThrow(ReadOnlyValidationError);
    });
});
