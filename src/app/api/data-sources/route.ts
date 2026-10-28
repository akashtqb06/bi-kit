import { NextResponse } from 'next/server';
import fs from 'node:fs';
import path from 'node:path';
import { createDataSourceSchema, bulkDeleteDataSourcesSchema } from '@src/lib/schemas';
import {
    listDataSources,
    createDataSource,
    bulkDeleteDataSources,
    setCachedSchema,
} from '@src/lib/data-sources/service';
import { handleApiError, apiError } from '@src/app/api/utils';
import { requireUserApi } from '@src/lib/auth/dal';
import { DATA_DIR } from '@src/lib/db/paths';
import { newId } from '@src/lib/db/id';
import { getManagedDirForSource } from '@src/lib/connectors/storage';
import { importExcelToDatabase } from '@src/lib/connectors/drivers/excel/importer';
import { importCsvToDatabase } from '@src/lib/data-sources/csv-import';
import { SqliteConnector } from '@src/lib/connectors/drivers/sqlite/connector';
import { getConnectorDefinition } from '@src/lib/connectors/registry';
import { encryptSecretFields } from '@src/lib/connectors/secrets';
import { getConnector } from '@src/lib/connectors/manager';
import { isConnectorTypeAllowed } from '@src/lib/settings/allowed-connectors';
import { logNetworkAudit } from '@src/lib/audit/audit-log';

export async function GET(): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const data = listDataSources({ id: user.id, role: user.role });
        return NextResponse.json({ data });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function POST(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const body: unknown = await req.json();
        const input = createDataSourceSchema.parse(body);

        if (!isConnectorTypeAllowed(input.type)) {
            return apiError(`Connector type "${input.type}" is disabled by administrator policy.`, 403);
        }

        // 1. Finalize file upload from preview wizard
        if (input.previewToken) {
            const tempDir = path.join(DATA_DIR, 'temp-uploads', input.previewToken);
            const metaPath = path.join(tempDir, 'meta.json');

            if (!fs.existsSync(metaPath)) {
                return apiError('Upload preview session has expired or is invalid.', 400);
            }

            const meta = JSON.parse(fs.readFileSync(metaPath, 'utf8')) as {
                type: 'sqlite' | 'excel' | 'csv';
                fileName: string;
                size: number;
                ext: string;
            };

            const id = newId();
            const managedDir = getManagedDirForSource(id);
            const tempFilePath = path.join(tempDir, `upload${meta.ext}`);
            const sourceFilePath = path.join(managedDir, `source${meta.ext}`);
            const dataDbPath = path.join(managedDir, 'data.db');

            // Move source file to permanent storage
            fs.copyFileSync(tempFilePath, sourceFilePath);

            let rowCount = 0;
            let sheetsInfo: unknown[] | undefined;

            if (meta.type === 'excel') {
                const importRes = await importExcelToDatabase(sourceFilePath, dataDbPath, input.options);
                rowCount = importRes.totalRows;
                sheetsInfo = importRes.sheets;
            } else if (meta.type === 'csv') {
                const csvText = fs.readFileSync(sourceFilePath, 'utf8');
                const csvRes = importCsvToDatabase(csvText, id, meta.fileName, dataDbPath);
                rowCount = csvRes.rowCount ?? 0;
            } else if (meta.type === 'sqlite') {
                fs.copyFileSync(sourceFilePath, dataDbPath);
            }

            // Cleanup temp directory
            try {
                fs.rmSync(tempDir, { recursive: true, force: true });
            } catch {
                // ignore
            }

            const finalConfig = {
                managedPath: path.join('files', id, 'data.db'),
                sourcePath: path.join('files', id, `source${meta.ext}`),
                fileName: meta.fileName,
                size: meta.size,
                rowCount,
                sheets: sheetsInfo,
                importedAt: new Date().toISOString(),
            };

            const publicDs = createDataSource(
                {
                    name: input.name,
                    type: meta.type,
                    config: JSON.stringify(finalConfig),
                    status: 'ok',
                },
                user.id
            );

            // Introspect and cache schema
            try {
                const connector = new SqliteConnector(dataDbPath);
                const snapshot = await connector.introspect();
                await connector.close();
                setCachedSchema(id, snapshot);
            } catch {
                // best effort
            }

            return NextResponse.json({ data: publicDs }, { status: 201 });
        }

        // 2. Direct connector creation (Postgres, MySQL, MSSQL, or direct config)
        const def = getConnectorDefinition(input.type);
        let rawConfig = typeof input.config === 'object' && input.config !== null ? { ...input.config } : {};

        if (def) {
            rawConfig = encryptSecretFields(def, rawConfig);
        }

        const publicDs = createDataSource(
            {
                name: input.name,
                type: input.type,
                config: JSON.stringify(rawConfig),
                status: 'unknown',
            },
            user.id
        );

        if (def && (def.category === 'sql' || def.category === 'nosql')) {
            const host = typeof rawConfig.host === 'string' ? rawConfig.host : null;
            logNetworkAudit({
                userId: user.id,
                action: 'create',
                dataSourceId: publicDs.id,
                host,
            });
        }

        // Pre-warm schema cache if connection is valid
        try {
            const connector = await getConnector({ id: publicDs.id, type: input.type, config: JSON.stringify(rawConfig) });
            const snapshot = await connector.introspect();
            setCachedSchema(publicDs.id, snapshot);
        } catch {
            // best effort; schema can be fetched later on demand
        }

        return NextResponse.json({ data: publicDs }, { status: 201 });
    } catch (err) {
        return handleApiError(err);
    }
}

export async function DELETE(req: Request): Promise<NextResponse> {
    try {
        const user = await requireUserApi();
        const body: unknown = await req.json();
        const { ids } = bulkDeleteDataSourcesSchema.parse(body);
        const data = bulkDeleteDataSources(ids, { id: user.id, role: user.role });
        return NextResponse.json({ data });
    } catch (err) {
        return handleApiError(err);
    }
}
