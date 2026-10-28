import { describe, it, expect } from 'vitest';
import { validateMongoPipeline } from './validate-pipeline';
import { ReadOnlyValidationError } from '@src/lib/connectors/errors';

describe('MongoDB Pipeline Validation & Security', () => {
    it('accepts valid read-only aggregation pipelines', () => {
        const pipeline = [
            { $match: { status: 'active', amount: { $gt: 100 } } },
            { $project: { _id: 0, status: 1, amount: 1 } },
            { $group: { _id: '$status', count: { $sum: 1 } } },
            { $sort: { count: -1 } },
            { $skip: 10 },
            { $limit: 50 },
            { $sample: { size: 100 } },
            { $count: 'total_records' },
        ];

        expect(() => validateMongoPipeline(pipeline)).not.toThrow();
    });

    it('rejects forbidden mutation stages at the top level', () => {
        expect(() =>
            validateMongoPipeline([{ $out: 'stolen_collection' }])
        ).toThrow(ReadOnlyValidationError);

        expect(() =>
            validateMongoPipeline([
                { $match: { x: 1 } },
                { $merge: { into: 'target_collection' } },
            ])
        ).toThrow(ReadOnlyValidationError);
    });

    it('rejects dangerous arbitrary JavaScript operators', () => {
        expect(() =>
            validateMongoPipeline([
                {
                    $match: {
                        $expr: {
                            $function: {
                                body: 'function() { return true; }',
                                args: [],
                                lang: 'js',
                            },
                        },
                    },
                },
            ])
        ).toThrow(ReadOnlyValidationError);

        expect(() =>
            validateMongoPipeline([
                {
                    $group: {
                        _id: '$cat',
                        custom: {
                            $accumulator: {
                                init: 'function() { return 0; }',
                                accumulate: 'function(s, v) { return s + v; }',
                                lang: 'js',
                            },
                        },
                    },
                },
            ])
        ).toThrow(ReadOnlyValidationError);

        expect(() =>
            validateMongoPipeline([
                { $match: { $where: 'this.password.length > 5' } },
            ])
        ).toThrow(ReadOnlyValidationError);
    });

    it('rejects forbidden operators deeply nested inside $lookup pipelines', () => {
        const pipeline = [
            {
                $lookup: {
                    from: 'other',
                    let: { order_id: '$id' },
                    pipeline: [
                        { $match: { status: 'pending' } },
                        { $out: 'nested_escape' },
                    ],
                    as: 'joined',
                },
            },
        ];

        expect(() => validateMongoPipeline(pipeline)).toThrow(ReadOnlyValidationError);
    });

    it('rejects forbidden operators deeply nested inside $facet pipelines', () => {
        const pipeline = [
            {
                $facet: {
                    categorized: [{ $match: { cat: 'A' } }],
                    dangerous: [
                        {
                            $match: {
                                $expr: {
                                    $function: {
                                        body: 'function() {}',
                                        args: [],
                                        lang: 'js',
                                    },
                                },
                            },
                        },
                    ],
                },
            },
        ];

        expect(() => validateMongoPipeline(pipeline)).toThrow(ReadOnlyValidationError);
    });

    it('rejects unknown or non-whitelisted stages', () => {
        expect(() =>
            validateMongoPipeline([
                { $collStats: { latencyStats: { histograms: true } } },
            ])
        ).toThrow(ReadOnlyValidationError);
    });

    it('rejects non-array pipeline input', () => {
        expect(() => validateMongoPipeline({} as unknown as unknown[])).toThrow(
            ReadOnlyValidationError
        );
    });
});
