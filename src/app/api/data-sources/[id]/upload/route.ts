import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { requireUserApi, assertCan } from '@src/lib/auth/dal';
import { getDataSource, getDataSourcePublic, getCachedSchema, setCachedSchema } from '@src/lib/data-sources/service';
import { handleApiError, apiError } from '@src/app/api/utils';
import {
    getManagedDirForSource,
    validateFileSignature,
    computeSchemaDiff,
    FILE_MAX_BYTES,
    FILE_MAX_MB,
} from '@src/lib/connectors/storage';
import { importExcelToDatabase } from '@src/lib/connectors/drivers/excel/importer';
import { importCsvToDatabase } from '@src/lib/data-sources/csv-import';
import { SqliteConnector } from '@src/lib/connectors/drivers/sqlite/connector';
import { invalidateConnector } from '@src/lib/connectors/manager';
import { db } from '@src/lib/db';
import { dataSources } from '@src/lib/db/schema';
import { eq } from 'drizzle-orm';

type RouteParams = { params: Promise<{ id: string }> };

export async function PUT(
    req: Request,
    { params }: RouteParams
): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const { id } = await params;
        const source = getDataSource(id);
        assertCan(user, 'edit', { type: 'data_source', id, ownerId: source.ownerId });

        const formData = await req.formData();
        const file = formData.get('file');

        if (!file || !(file instanceof File)) {
            return apiError('No file provided for upload.', 400);
        }

        if (file.size > FILE_MAX_BYTES) {
            return apiError(`File exceeds maximum limit of ${FILE_MAX_MB} MB.`, 400);
        }

        const ext = path.extname(file.name).toLowerCase();
        let fileType: 'sqlite' | 'excel' | 'csv' = (source.type === 'sqlite' || source.type === 'excel' || source.type === 'csv') ? source.type : 'sqlite';

        if (ext === '.xlsx' || ext === '.xlsm') {
            fileType = 'excel';
        } else if (ext === '.db' || ext === '.sqlite') {
            fileType = 'sqlite';
        } else if (ext === '.csv' || ext === '.txt') {
            fileType = 'csv';
        }

        const managedDir = getManagedDirForSource(id);
        const sourceFilePath = path.join(managedDir, `source${ext}`);
        const dataDbPath = path.join(managedDir, 'data.db');

        // Write uploaded file
        const buffer = Buffer.from(await file.arrayBuffer());
        fs.writeFileSync(sourceFilePath, buffer);

        // Validate signature
        validateFileSignature(sourceFilePath, fileType);

        const oldSnapshot = getCachedSchema(id);
        let rowCount = 0;

        if (fileType === 'excel') {
            const importRes = await importExcelToDatabase(sourceFilePath, dataDbPath);
            rowCount = importRes.totalRows;
        } else if (fileType === 'csv') {
            const csvText = buffer.toString('utf8');
            const config = importCsvToDatabase(csvText, id, file.name, dataDbPath);
            rowCount = config.rowCount ?? 0;
        } else if (fileType === 'sqlite') {
            fs.copyFileSync(sourceFilePath, dataDbPath);
        }

        // Introspect new schema snapshot
        const connector = new SqliteConnector(dataDbPath);
        const newSnapshot = await connector.introspect();
        await connector.close();

        setCachedSchema(id, newSnapshot);
        const diff = computeSchemaDiff(oldSnapshot, newSnapshot);

        // Update database configuration
        const newConfig = {
            managedPath: path.join('files', id, 'data.db'),
            sourcePath: path.join('files', id, `source${ext}`),
            fileName: file.name,
            size: file.size,
            importedAt: new Date().toISOString(),
        };

        db.update(dataSources)
            .set({
                config: JSON.stringify(newConfig),
                status: 'ok',
                lastTestedAt: new Date(),
                updatedAt: new Date(),
            })
            .where(eq(dataSources.id, id))
            .run();

        await invalidateConnector(id);

        return NextResponse.json({
            data: {
                source: getDataSourcePublic(id),
                rowCount,
                diff,
            },
        });
    } catch (err) {
        return handleApiError(err);
    }
}
