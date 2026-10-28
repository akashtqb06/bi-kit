import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';
import { afterEach, describe, expect, it } from 'vitest';
import { newId } from '@src/lib/db/id';
import { importCsvToDatabase } from './csv-import';
import { CSV_DIR } from '@src/lib/db/paths';

describe('CSV import', () => {
    const sourceIds: string[] = [];

    afterEach(() => {
        for (const sourceId of sourceIds.splice(0)) {
            const databasePath = path.join(CSV_DIR, `${sourceId}.db`);
            for (const suffix of ['', '-wal', '-shm']) {
                fs.rmSync(`${databasePath}${suffix}`, { force: true });
            }
        }
    });

    it('sanitizes names, infers types, inserts rows, and replaces the existing table', () => {
        const sourceId = newId();
        sourceIds.push(sourceId);
        const first = importCsvToDatabase(
            'Order ID,Amount,Created At,Name,name\n1,3.5,2026-01-01,Alice,ALICE\n2,4.5,2026-01-02,Bob,BOB\n',
            sourceId,
            'Sales report.csv'
        );

        expect(first).toMatchObject({
            tableName: 'sales_report',
            originalFileName: 'Sales report.csv',
            rowCount: 2,
        });
        const databasePath = path.resolve(process.cwd(), (first.dbPath || first.managedPath)!);
        const database = new Database(databasePath, { readonly: true });
        try {
            const columns = database.prepare(`PRAGMA table_info("${first.tableName}")`).all() as {
                name: string;
                type: string;
            }[];
            expect(columns.map((column) => [column.name, column.type])).toEqual([
                ['order_id', 'INTEGER'],
                ['amount', 'REAL'],
                ['created_at', 'DATE'],
                ['name', 'TEXT'],
                ['name_2', 'TEXT'],
            ]);
            expect(database.prepare(`SELECT * FROM "${first.tableName}" ORDER BY order_id`).all()).toHaveLength(2);
        } finally {
            database.close();
        }

        const replacement = importCsvToDatabase('New Value\n7\n', sourceId, 'New file.csv', first.dbPath);
        expect(replacement).toMatchObject({ tableName: 'new_file', rowCount: 1 });
        const replacedDatabase = new Database(path.resolve(process.cwd(), (replacement.dbPath || replacement.managedPath)!), { readonly: true });
        try {
            expect(replacedDatabase.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all()).toEqual([
                { name: 'new_file' },
            ]);
            expect(replacedDatabase.prepare('SELECT new_value FROM new_file').get()).toEqual({ new_value: 7 });
        } finally {
            replacedDatabase.close();
        }
    });
});
