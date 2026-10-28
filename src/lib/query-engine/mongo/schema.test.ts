import { describe, it, expect } from 'vitest';
import { formatMongoResults, getDotPathValue, normalizeBsonValue } from './normalize';
import { ObjectId, Decimal128, Long } from 'mongodb';

describe('MongoDB Schema & Result Normalization', () => {
    describe('normalizeBsonValue', () => {
        it('normalizes ObjectId to string', () => {
            const id = new ObjectId('507f1f77bcf86cd799439011');
            expect(normalizeBsonValue(id)).toBe('507f1f77bcf86cd799439011');
        });

        it('normalizes Date to ISO string', () => {
            const d = new Date('2026-01-15T12:00:00.000Z');
            expect(normalizeBsonValue(d)).toBe('2026-01-15T12:00:00.000Z');
        });

        it('normalizes Decimal128 and Long to number', () => {
            const dec = Decimal128.fromString('129.95');
            expect(normalizeBsonValue(dec)).toBe(129.95);

            const long = Long.fromNumber(1000);
            expect(normalizeBsonValue(long)).toBe(1000);
        });

        it('serializes arrays to JSON string', () => {
            const arr = ['tag1', 'tag2'];
            expect(normalizeBsonValue(arr)).toBe(JSON.stringify(arr));
        });

        it('serializes plain objects to JSON string', () => {
            const obj = { street: '123 Main St', city: 'Metro' };
            expect(normalizeBsonValue(obj)).toBe(JSON.stringify(obj));
        });
    });

    describe('getDotPathValue', () => {
        const doc = {
            id: 'ord_1',
            customer: {
                name: 'Alice',
                address: {
                    city: 'Gotham',
                    coords: {
                        lat: 40.7,
                    },
                },
            },
        };

        it('retrieves top level and nested fields via dot paths', () => {
            expect(getDotPathValue(doc, 'id')).toBe('ord_1');
            expect(getDotPathValue(doc, 'customer.name')).toBe('Alice');
            expect(getDotPathValue(doc, 'customer.address.city')).toBe('Gotham');
            expect(getDotPathValue(doc, 'customer.address.coords.lat')).toBe(40.7);
        });

        it('returns null for missing paths', () => {
            expect(getDotPathValue(doc, 'customer.address.zip')).toBeNull();
            expect(getDotPathValue(doc, 'nonexistent.path')).toBeNull();
        });
    });

    describe('formatMongoResults', () => {
        it('formats documents into tabular columns and rows', () => {
            const docs = [
                {
                    _id: new ObjectId('507f1f77bcf86cd799439011'),
                    total: Decimal128.fromString('49.99'),
                    customer: {
                        name: 'Bob',
                        age: 30,
                    },
                    tags: ['sale', 'new'],
                },
                {
                    _id: new ObjectId('507f1f77bcf86cd799439012'),
                    total: Decimal128.fromString('89.50'),
                    customer: {
                        name: 'Charlie',
                        age: 25,
                    },
                    tags: ['clearance'],
                },
            ];

            const result = formatMongoResults(docs);
            expect(result.columns).toEqual([
                '_id',
                'total',
                'customer.name',
                'customer.age',
                'tags',
            ]);
            expect(result.rows).toHaveLength(2);
            expect(result.rows[0][0]).toBe('507f1f77bcf86cd799439011');
            expect(result.rows[0][1]).toBe(49.99);
            expect(result.rows[0][2]).toBe('Bob');
            expect(result.rows[0][3]).toBe(30);
            expect(result.rows[0][4]).toBe(JSON.stringify(['sale', 'new']));
        });

        it('respects explicitly provided column list', () => {
            const docs = [
                { a: 1, b: 2, c: 3 },
                { a: 4, b: 5, c: 6 },
            ];

            const result = formatMongoResults(docs, ['c', 'a']);
            expect(result.columns).toEqual(['c', 'a']);
            expect(result.rows[0]).toEqual([3, 1]);
            expect(result.rows[1]).toEqual([6, 4]);
        });
    });
});
