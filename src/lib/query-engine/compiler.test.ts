import { describe, it, expect } from 'vitest';
import { compile, CompileError } from './compiler';
import { validateReadOnly, validateReadOnlyShape, ReadOnlyValidationError } from './validate-readonly';
import { inferOutputColumns, getAvailableColumnsForStep } from './infer-columns';
import type { SchemaInfo } from '@src/lib/connectors/types';

// ---------------------------------------------------------------------------
// Test schema
// ---------------------------------------------------------------------------

const schema: SchemaInfo = {
    tables: [
        {
            name: 'orders',
            columns: [
                { name: 'id', type: 'INTEGER', nullable: false },
                { name: 'customer_id', type: 'INTEGER', nullable: false },
                { name: 'amount', type: 'REAL', nullable: false },
                { name: 'status', type: 'TEXT', nullable: false },
                { name: 'created_at', type: 'TEXT', nullable: true },
            ],
        },
        {
            name: 'customers',
            columns: [
                { name: 'id', type: 'INTEGER', nullable: false },
                { name: 'name', type: 'TEXT', nullable: false },
                { name: 'region', type: 'TEXT', nullable: true },
            ],
        },
    ],
};

const ctx = { schema };

// ---------------------------------------------------------------------------
// compile() — basic cases
// ---------------------------------------------------------------------------

describe('compile()', () => {
    it('compiles a bare source with no steps', () => {
        const result = compile({ source: { table: 'orders' }, steps: [] }, ctx);
        expect(result.sql).toContain('SELECT * FROM');
        expect(result.sql).toContain('"orders"');
        expect(result.params).toHaveLength(0);
    });

    it('rejects an unknown source table', () => {
        expect(() => compile({ source: { table: 'nonexistent' }, steps: [] }, ctx)).toThrow(CompileError);
    });

    it('rejects SQL injected through a source table identifier', () => {
        expect(() =>
            compile(
                {
                    source: { table: 'orders"; DROP TABLE customers; --' },
                    steps: [],
                },
                ctx
            )
        ).toThrow(CompileError);
    });

    // -------------------------------------------------------------------------
    // Filter step
    // -------------------------------------------------------------------------

    it('compiles a simple equality filter and binds the value', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'status', op: '=', value: 'completed' }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('WHERE');
        expect(result.sql).toContain('"status" = ?');
        expect(result.params).toEqual(['completed']);
    });

    it('compiles AND + OR multi-condition filter', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'or',
                            items: [
                                { column: 'status', op: '=', value: 'completed' },
                                { column: 'amount', op: '>', value: 100 },
                            ],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('"status" = ? OR "amount" > ?');
        expect(result.params).toEqual(['completed', 100]);
    });

    it('compiles in operator with array params', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'status', op: 'in', value: ['a', 'b', 'c'] }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('"status" IN (?, ?, ?)');
        expect(result.params).toEqual(['a', 'b', 'c']);
    });

    it('compiles between operator with two params', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'amount', op: 'between', value: [10, 100] }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('"amount" BETWEEN ? AND ?');
        expect(result.params).toEqual([10, 100]);
    });

    it('compiles is null without binding a param', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'created_at', op: 'is null' }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('"created_at" IS NULL');
        expect(result.params).toHaveLength(0);
    });

    it('compiles contains with LIKE pattern', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'status', op: 'contains', value: 'pen' }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.params).toEqual(['%pen%']);
        expect(result.sql).toContain('LIKE ?');
    });

    it('rejects a filter on an unknown column', () => {
        expect(() =>
            compile(
                {
                    source: { table: 'orders' },
                    steps: [
                        {
                            type: 'filter',
                            conditions: {
                                logic: 'and',
                                items: [{ column: 'nonexistent', op: '=', value: 1 }],
                            },
                        },
                    ],
                },
                ctx
            )
        ).toThrow(CompileError);
    });

    it('rejects SQL injected through a filter column identifier', () => {
        expect(() =>
            compile(
                {
                    source: { table: 'orders' },
                    steps: [
                        {
                            type: 'filter',
                            conditions: {
                                logic: 'and',
                                items: [
                                    {
                                        column: "status\" = 'x'; DROP TABLE orders; --",
                                        op: '=',
                                        value: 'completed',
                                    },
                                ],
                            },
                        },
                    ],
                },
                ctx
            )
        ).toThrow(CompileError);
    });

    // -------------------------------------------------------------------------
    // Summarize step
    // -------------------------------------------------------------------------

    it('compiles a summarize with groupBy and COUNT', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'summarize',
                        groupBy: [{ column: 'status' }],
                        aggregates: [{ fn: 'count', column: 'id', alias: 'total' }],
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('GROUP BY 1');
        expect(result.sql).toContain('COUNT(');
        expect(result.sql).toContain('"total"');
        expect(result.params).toHaveLength(0);
    });

    it('compiles a summarize with date grain', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'summarize',
                        groupBy: [{ column: 'created_at', dateGrain: 'month' }],
                        aggregates: [{ fn: 'sum', column: 'amount', alias: 'revenue' }],
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain("strftime('%Y-%m'");
        expect(result.sql).toContain('SUM(');
    });

    it('rejects summarize referencing unknown column', () => {
        expect(() =>
            compile(
                {
                    source: { table: 'orders' },
                    steps: [
                        {
                            type: 'summarize',
                            groupBy: [{ column: 'ghost' }],
                            aggregates: [{ fn: 'count', column: 'id', alias: 'n' }],
                        },
                    ],
                },
                ctx
            )
        ).toThrow(CompileError);
    });

    // -------------------------------------------------------------------------
    // Select step
    // -------------------------------------------------------------------------

    it('compiles a select step projecting specific columns', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [{ type: 'select', columns: ['id', 'amount'] }],
            },
            ctx
        );
        expect(result.sql).toContain('"id"');
        expect(result.sql).toContain('"amount"');
        // 'status' should NOT be in the final CTE SELECT
        // (it appears in the source CTE but not the select CTE)
        const lines = result.sql.split('\n');
        const lastSelect = lines.reverse().find((l) => l.trim().startsWith('SELECT'));
        expect(lastSelect).not.toContain('"status"');
    });

    it('rejects select with unknown column', () => {
        expect(() =>
            compile(
                {
                    source: { table: 'orders' },
                    steps: [{ type: 'select', columns: ['ghost'] }],
                },
                ctx
            )
        ).toThrow(CompileError);
    });

    // -------------------------------------------------------------------------
    // Order step
    // -------------------------------------------------------------------------

    it('compiles order by multiple columns', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'order',
                        items: [
                            { column: 'amount', dir: 'desc' },
                            { column: 'id', dir: 'asc' },
                        ],
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('"amount" DESC');
        expect(result.sql).toContain('"id" ASC');
    });

    // -------------------------------------------------------------------------
    // Limit step
    // -------------------------------------------------------------------------

    it('compiles a limit step', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [{ type: 'limit', value: 50 }],
            },
            ctx
        );
        expect(result.sql).toContain('LIMIT 50');
    });

    // -------------------------------------------------------------------------
    // Join step
    // -------------------------------------------------------------------------

    it('compiles an inner join', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'join',
                        joinType: 'inner',
                        table: 'customers',
                        on: [{ left: 'customer_id', right: 'id' }],
                    },
                ],
            },
            ctx
        );
        expect(result.sql).toContain('INNER JOIN');
        expect(result.sql).toContain('"customers"');
        expect(result.params).toHaveLength(0);
    });

    it('rejects join on unknown right column', () => {
        expect(() =>
            compile(
                {
                    source: { table: 'orders' },
                    steps: [
                        {
                            type: 'join',
                            joinType: 'inner',
                            table: 'customers',
                            on: [{ left: 'customer_id', right: 'ghost' }],
                        },
                    ],
                },
                ctx
            )
        ).toThrow(CompileError);
    });

    // -------------------------------------------------------------------------
    // Mutate step
    // -------------------------------------------------------------------------

    it('compiles a mutate step adding a computed column', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [{ type: 'mutate', name: 'amount_cents', expression: 'amount * 100' }],
            },
            ctx
        );
        expect(result.sql).toContain('"amount_cents"');
        expect(result.sql).toContain('amount * 100');
    });

    it('compiles a mutate step replacing/converting an existing column in-place without duplicate columns', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [{ type: 'mutate', name: 'created_at', expression: 'datetime("created_at")' }],
            },
            ctx
        );
        expect(result.sql).toContain('datetime("created_at")');
        const cte1 = result.sql.split('"__s1" AS (')[1];
        const selectPart = cte1.split('FROM')[0];
        // Ensure "created_at" is only present in the expression and alias, not as an unmutated column
        expect(selectPart).not.toContain('"created_at",');
        expect(selectPart).toContain('(datetime("created_at")) AS "created_at"');
    });

    // -------------------------------------------------------------------------
    // Multi-step pipeline
    // -------------------------------------------------------------------------

    it('compiles a full pipeline: join → filter → summarize → order → limit', () => {
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'join',
                        joinType: 'inner',
                        table: 'customers',
                        on: [{ left: 'customer_id', right: 'id' }],
                    },
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'region', op: '=', value: 'west' }],
                        },
                    },
                    {
                        type: 'summarize',
                        groupBy: [{ column: 'region' }],
                        aggregates: [
                            { fn: 'sum', column: 'amount', alias: 'total_spent' },
                            { fn: 'count', column: 'id', alias: 'order_count' },
                        ],
                    },
                    { type: 'order', items: [{ column: 'total_spent', dir: 'desc' }] },
                    { type: 'limit', value: 10 },
                ],
            },
            ctx
        );
        expect(result.sql.match(/AS \(/g)?.length).toBe(6);
        expect(result.sql).toContain('INNER JOIN "customers"');
        expect(result.sql).toContain('WHERE "region" = ?');
        expect(result.sql).toContain('GROUP BY 1');
        expect(result.sql).toContain('ORDER BY "total_spent" DESC');
        expect(result.sql).toContain('LIMIT 10');
        expect(result.params).toEqual(['west']);
    });

    // -------------------------------------------------------------------------
    // SQL injection guard — values must be bound, not interpolated
    // -------------------------------------------------------------------------

    it('does not interpolate filter values into SQL', () => {
        const malicious = "'; DROP TABLE orders; --";
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'status', op: '=', value: malicious }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).not.toContain('DROP');
        expect(result.params).toContain(malicious);
    });

    it('does not interpret SQL-looking filter values as identifiers or SQL', () => {
        const malicious = 'status" OR 1 = 1; DROP TABLE orders; --';
        const result = compile(
            {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [{ column: 'status', op: '=', value: malicious }],
                        },
                    },
                ],
            },
            ctx
        );
        expect(result.sql).not.toContain(malicious);
        expect(result.sql).not.toContain('DROP TABLE');
        expect(result.params).toEqual([malicious]);
    });

    // -------------------------------------------------------------------------
    // Zod validation
    // -------------------------------------------------------------------------

    it('throws ZodError for invalid definition shape', () => {
        expect(() => compile({ source: { table: 123 } }, ctx)).toThrow();
    });
});

// ---------------------------------------------------------------------------
// validateReadOnly()
// ---------------------------------------------------------------------------

describe('validateReadOnly()', () => {
    it('accepts a plain SELECT', () => {
        expect(() => validateReadOnly('SELECT 1')).not.toThrow();
    });

    it('accepts a SELECT that references a source table', () => {
        expect(() => validateReadOnlyShape('SELECT id FROM uploaded_table')).not.toThrow();
    });

    it('accepts a SELECT with subquery (values only, no real table)', () => {
        expect(() => validateReadOnly("SELECT * FROM (SELECT 1 AS id, 'x' AS name) AS t")).not.toThrow();
    });

    it('accepts a WITH ... SELECT', () => {
        expect(() => validateReadOnly('WITH cte AS (SELECT 1 AS n) SELECT * FROM cte')).not.toThrow();
    });

    it('rejects INSERT', () => {
        expect(() => validateReadOnly('INSERT INTO orders VALUES (1, 2, 3)')).toThrow(ReadOnlyValidationError);
    });

    it('rejects UPDATE', () => {
        expect(() => validateReadOnly("UPDATE orders SET status = 'x'")).toThrow(ReadOnlyValidationError);
    });

    it('rejects DELETE', () => {
        expect(() => validateReadOnly('DELETE FROM orders WHERE id = 1')).toThrow(ReadOnlyValidationError);
    });

    it('rejects DROP TABLE', () => {
        expect(() => validateReadOnly('DROP TABLE orders')).toThrow(ReadOnlyValidationError);
    });

    it('rejects multiple statements separated by semicolons', () => {
        expect(() => validateReadOnly('SELECT 1; DROP TABLE orders')).toThrow(ReadOnlyValidationError);
    });

    it('does not flag semicolons inside string literals as multiple statements', () => {
        // SQLite allows this: SELECT 'hello; world'
        // validateReadOnly should NOT throw here
        expect(() => validateReadOnly("SELECT 'hello; world'")).not.toThrow();
    });

    it('rejects invalid SQL syntax', () => {
        expect(() => validateReadOnly('SELEKT * FORM foo')).toThrow(ReadOnlyValidationError);
    });

    it('rejects ATTACH DATABASE', () => {
        expect(() => validateReadOnly("ATTACH DATABASE 'evil.db' AS evil")).toThrow(ReadOnlyValidationError);
    });

    it('rejects PRAGMA statements', () => {
        expect(() => validateReadOnly('PRAGMA wal_checkpoint')).toThrow(ReadOnlyValidationError);
    });
});

// ---------------------------------------------------------------------------
// infer-columns
// ---------------------------------------------------------------------------

describe('inferOutputColumns() & getAvailableColumnsForStep()', () => {
    it('infers initial columns from source table', () => {
        const cols = getAvailableColumnsForStep({ source: { table: 'orders' }, steps: [] }, 0, schema);
        expect(cols.map((c) => c.name)).toEqual(['id', 'customer_id', 'amount', 'status', 'created_at']);
    });

    it('infers joined columns for subsequent steps', () => {
        const def = {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'join' as const,
                    joinType: 'inner' as const,
                    table: 'customers',
                    on: [{ left: 'customer_id', right: 'id' }],
                },
            ],
        };
        const colsAfterJoin = getAvailableColumnsForStep(def, 1, schema);
        expect(colsAfterJoin.map((c) => c.name)).toEqual([
            'id',
            'customer_id',
            'amount',
            'status',
            'created_at',
            'name',
            'region',
        ]);
    });

    it('infers mutate and summarize columns', () => {
        const def = {
            source: { table: 'orders' },
            steps: [
                {
                    type: 'mutate' as const,
                    name: 'discounted',
                    expression: 'amount * 0.9',
                },
                {
                    type: 'summarize' as const,
                    groupBy: [{ column: 'status' }],
                    aggregates: [{ fn: 'sum' as const, column: 'discounted', alias: 'total_revenue' }],
                },
            ],
        };
        const finalCols = inferOutputColumns(def, schema);
        expect(finalCols.map((c) => c.name)).toEqual(['status', 'total_revenue']);
    });
});
