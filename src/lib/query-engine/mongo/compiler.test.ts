import { describe, it, expect } from 'vitest';
import { compileToPipeline, compileExpressionToMongo } from './compiler';
import { CompileError } from '../compiler';
import type { QueryDefinition } from '../definition';

describe('MongoDB Pipeline Compiler', () => {
    describe('compileExpressionToMongo', () => {
        it('compiles numeric and string literals', () => {
            expect(compileExpressionToMongo('42')).toBe(42);
            expect(compileExpressionToMongo('-12.5')).toBe(-12.5);
            expect(compileExpressionToMongo("'hello world'")).toBe('hello world');
        });

        it('compiles column references', () => {
            expect(compileExpressionToMongo('price')).toBe('$price');
            expect(compileExpressionToMongo('"user.name"')).toBe('$user.name');
        });

        it('compiles arithmetic operators (+, -, *, /)', () => {
            expect(compileExpressionToMongo('price * 1.2')).toEqual({
                $multiply: ['$price', 1.2],
            });
            expect(compileExpressionToMongo('total - discount')).toEqual({
                $subtract: ['$total', '$discount'],
            });
            expect(compileExpressionToMongo('qty + 1')).toEqual({
                $add: ['$qty', 1],
            });
            expect(compileExpressionToMongo('total / 2')).toEqual({
                $divide: ['$total', 2],
            });
        });

        it('compiles type conversion and string functions', () => {
            expect(compileExpressionToMongo('to_number(amount)')).toEqual({
                $toDouble: '$amount',
            });
            expect(compileExpressionToMongo('to_string(id)')).toEqual({
                $toString: '$id',
            });
            expect(compileExpressionToMongo('to_date(signup_time)')).toEqual({
                $toDate: '$signup_time',
            });
            expect(compileExpressionToMongo('concat(first_name, " ", last_name)')).toEqual({
                $concat: ['$first_name', ' ', '$last_name'],
            });
        });

        it('rejects dangerous expressions and code injection', () => {
            expect(() => compileExpressionToMongo('function() { return 1; }')).toThrow(CompileError);
            expect(() => compileExpressionToMongo('eval("1+1")')).toThrow(CompileError);
            expect(() => compileExpressionToMongo('process.exit(1)')).toThrow(CompileError);
            expect(() => compileExpressionToMongo('where 1=1')).toThrow(CompileError);
        });
    });

    describe('compileToPipeline - Steps', () => {
        it('compiles simple source query', () => {
            const def: QueryDefinition = {
                source: { table: 'orders' },
                steps: [],
            };
            const result = compileToPipeline(def);
            expect(result.collection).toBe('orders');
            expect(result.pipeline).toEqual([]);
        });

        it('compiles filter step with various operators', () => {
            const def: QueryDefinition = {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'and',
                            items: [
                                { column: 'status', op: '=', value: 'completed' },
                                { column: 'total', op: '>', value: 100 },
                                { column: 'items_count', op: '<=', value: 5 },
                                { column: 'category', op: 'in', value: 'electronics, toys' },
                                { column: 'tag', op: 'not in', value: 'banned, flagged' },
                                { column: 'notes', op: 'contains', value: 'urgent' },
                                { column: 'code', op: 'starts with', value: 'ORD-' },
                                { column: 'price', op: 'between', value: [10, 50] },
                                { column: 'deleted_at', op: 'is null', value: null },
                                { column: 'completed_at', op: 'is not null', value: null },
                            ],
                        },
                    },
                ],
            };

            const result = compileToPipeline(def);
            expect(result.pipeline).toHaveLength(1);
            const matchStage = result.pipeline[0] as { $match: { $and: Record<string, unknown>[] } };
            expect(matchStage.$match).toBeDefined();
            expect(matchStage.$match.$and).toHaveLength(10);
            expect(matchStage.$match.$and[0]).toEqual({ status: 'completed' });
            expect(matchStage.$match.$and[1]).toEqual({ total: { $gt: 100 } });
            expect(matchStage.$match.$and[2]).toEqual({ items_count: { $lte: 5 } });
            expect(matchStage.$match.$and[3]).toEqual({ category: { $in: ['electronics', 'toys'] } });
            expect(matchStage.$match.$and[4]).toEqual({ tag: { $nin: ['banned', 'flagged'] } });
            expect(matchStage.$match.$and[5]).toEqual({ notes: { $regex: 'urgent', $options: 'i' } });
            expect(matchStage.$match.$and[6]).toEqual({ code: { $regex: '^ORD-', $options: 'i' } });
            expect(matchStage.$match.$and[7]).toEqual({ price: { $gte: 10, $lte: 50 } });
            expect(matchStage.$match.$and[8]).toEqual({
                $or: [{ deleted_at: null }, { deleted_at: { $exists: false } }],
            });
            expect(matchStage.$match.$and[9]).toEqual({
                completed_at: { $ne: null, $exists: true },
            });
        });

        it('compiles filter step with or logic', () => {
            const def: QueryDefinition = {
                source: { table: 'customers' },
                steps: [
                    {
                        type: 'filter',
                        conditions: {
                            logic: 'or',
                            items: [
                                { column: 'city', op: '=', value: 'New York' },
                                { column: 'city', op: '=', value: 'London' },
                            ],
                        },
                    },
                ],
            };

            const result = compileToPipeline(def);
            expect(result.pipeline[0]).toEqual({
                $match: {
                    $or: [{ city: 'New York' }, { city: 'London' }],
                },
            });
        });

        it('compiles join step with left / inner join', () => {
            const def: QueryDefinition = {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'join',
                        table: 'customers',
                        joinType: 'left',
                        on: [{ left: 'customer_id', right: 'id' }],
                    },
                ],
            };

            const result = compileToPipeline(def, {
                schema: {
                    tables: [
                        { name: 'orders', columns: [{ name: 'customer_id', type: 'text', nullable: false }] },
                        { name: 'customers', columns: [{ name: 'id', type: 'text', nullable: false }, { name: 'name', type: 'text', nullable: false }] },
                    ],
                },
            });

            // $lookup + $unwind (with preserveNullAndEmptyArrays) + $addFields
            expect(result.pipeline[0]).toEqual({
                $lookup: {
                    from: 'customers',
                    localField: 'customer_id',
                    foreignField: 'id',
                    as: 'customers',
                },
            });
            expect(result.pipeline[1]).toEqual({
                $unwind: {
                    path: '$customers',
                    preserveNullAndEmptyArrays: true,
                },
            });
            expect(result.pipeline[2]).toEqual({
                $addFields: {
                    'customers.id': '$customers.id',
                    'customers.name': '$customers.name',
                },
            });
        });

        it('compiles mutate step with expressions', () => {
            const def: QueryDefinition = {
                source: { table: 'products' },
                steps: [
                    {
                        type: 'mutate',
                        name: 'profit',
                        expression: 'price - cost',
                    },
                ],
            };

            const result = compileToPipeline(def);
            expect(result.pipeline[0]).toEqual({
                $addFields: {
                    profit: { $subtract: ['$price', '$cost'] },
                },
            });
        });

        it('compiles summarize step with date grains and distinct counts on MongoDB 5.0+', () => {
            const def: QueryDefinition = {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'summarize',
                        groupBy: [
                            { column: 'created_at', dateGrain: 'month' },
                            { column: 'status' },
                        ],
                        aggregates: [
                            { fn: 'sum', column: 'total', alias: 'total_revenue' },
                            { fn: 'count', column: 'id', alias: 'order_count' },
                            { fn: 'count_distinct', column: 'customer_id', alias: 'unique_customers' },
                        ],
                    },
                ],
            };

            const result = compileToPipeline(def, undefined, '7.0.0');
            expect(result.pipeline[0]).toEqual({
                $group: {
                    _id: {
                        created_at: {
                            $dateTrunc: { date: '$created_at', unit: 'month' },
                        },
                        status: '$status',
                    },
                    total_revenue: { $sum: '$total' },
                    order_count: { $sum: 1 },
                    __set_unique_customers: { $addToSet: '$customer_id' },
                },
            });

            // Reshaping project stage
            const projectStage = result.pipeline[1] as { $project: Record<string, unknown> };
            expect(projectStage.$project.created_at).toBe('$_id.created_at');
            expect(projectStage.$project.status).toBe('$_id.status');
            expect(projectStage.$project.total_revenue).toBe(1);
            expect(projectStage.$project.order_count).toBe(1);
            expect(projectStage.$project.unique_customers).toEqual({ $size: '$__set_unique_customers' });
        });

        it('compiles summarize step with date grain fallback on older MongoDB servers (< 5.0)', () => {
            const def: QueryDefinition = {
                source: { table: 'orders' },
                steps: [
                    {
                        type: 'summarize',
                        groupBy: [{ column: 'created_at', dateGrain: 'year' }],
                        aggregates: [{ fn: 'count', column: '*', alias: 'count' }],
                    },
                ],
            };

            const result = compileToPipeline(def, undefined, '4.4.10');
            const groupStage = result.pipeline[0] as { $group: { _id: Record<string, unknown> } };
            expect(groupStage.$group._id.created_at).toEqual({
                $dateToString: { format: '%Y-01-01 00:00:00', date: '$created_at' },
            });
        });

        it('compiles select, order, and limit steps', () => {
            const def: QueryDefinition = {
                source: { table: 'customers' },
                steps: [
                    { type: 'select', columns: ['name', 'email'] },
                    { type: 'order', items: [{ column: 'name', dir: 'asc' }] },
                    { type: 'limit', value: 25 },
                ],
            };

            const result = compileToPipeline(def);
            expect(result.pipeline).toEqual([
                { $project: { _id: 0, name: 1, email: 1 } },
                { $sort: { name: 1 } },
                { $limit: 25 },
            ]);
        });
    });
});
