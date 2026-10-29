import 'server-only';
import * as fs from 'fs';
import * as path from 'path';
import { type DataSource } from '@src/lib/db/schema';
import { DATA_DIR } from '@src/lib/db/paths';
import { ConnectorError, type Connector } from './types';
import { SqliteConnector } from './drivers/sqlite';
import { CsvConnector } from './drivers/csv';
import { getConnectorDefinition } from './registry';
import { decryptSecretFields } from './secrets';

/**
 * Instantiate the correct Connector for a DataSource row.
 * The caller is responsible for calling connector.close() when done.
 */
export function createConnector(source: DataSource): Connector {
    const definition = getConnectorDefinition(source.type);
    if (!definition) {
        throw new ConnectorError(`Unknown data source type: ${String(source.type)}`, 'UNKNOWN_TYPE');
    }

    let configJson: Record<string, unknown> = {};
    if (typeof source.config === 'string') {
        try {
            configJson = JSON.parse(source.config) as Record<string, unknown>;
        } catch {
            throw new ConnectorError('DataSource configuration is not valid JSON.', 'INVALID_CONFIG');
        }
    } else if (source.config && typeof source.config === 'object') {
        configJson = source.config as Record<string, unknown>;
    }

    if (source.type === 'sqlite') {
        const rawPath = (configJson.managedPath || configJson.path) as string | undefined;
        if (rawPath) {
            return new SqliteConnector(resolveSourcePath(rawPath));
        }
    }

    if (source.type === 'csv') {
        const rawPath = (configJson.managedPath || configJson.dbPath || configJson.path) as string | undefined;
        if (rawPath) {
            return new CsvConnector(resolveSourcePath(rawPath));
        }
    }

    const decrypted = decryptSecretFields(definition, configJson);
    const validated = definition.configSchema.parse(decrypted);
    return definition.create(validated, { dataSourceId: source.id });
}

export function resolveSourcePath(filePath: string): string {
    // If path is already inside DATA_DIR
    const candidatePath = path.isAbsolute(filePath)
        ? filePath
        : path.resolve(DATA_DIR, filePath);

    if (!fs.existsSync(candidatePath)) {
        // Try resolving relative to process.cwd() as legacy fallback
        const cwdCandidate = path.resolve(process.cwd(), filePath);
        if (fs.existsSync(cwdCandidate)) {
            return verifyWithinDataDir(cwdCandidate);
        }
        throw new ConnectorError('Data source file was not found.', 'SOURCE_NOT_FOUND');
    }

    return verifyWithinDataDir(candidatePath);
}

function verifyWithinDataDir(filePath: string): string {
    try {
        const allowedDirectory = fs.realpathSync(DATA_DIR);
        const canonicalPath = fs.realpathSync(filePath);

        if (!isWithinDirectory(allowedDirectory, canonicalPath)) {
            throw new Error();
        }
        return canonicalPath;
    } catch {
        throw new ConnectorError('Data source file must exist inside the data directory.', 'INVALID_SOURCE_PATH');
    }
}

function isWithinDirectory(directory: string, candidate: string): boolean {
    const relativePath = path.relative(directory, candidate);
    return (
        relativePath !== '' &&
        relativePath !== '..' &&
        !relativePath.startsWith(`..${path.sep}`) &&
        !path.isAbsolute(relativePath)
    );
}
