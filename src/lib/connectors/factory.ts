import * as fs from 'fs';
import * as path from 'path';
import { parseDataSourceConfig } from '@src/lib/db/json-helpers';
import { type DataSource } from '@src/lib/db/schema';
import { DATA_DIR } from '@src/lib/db/paths';
import { ConnectorError, type Connector } from './types';
import { SqliteConnector } from './sqlite-connector';

/**
 * Instantiate the correct Connector for a DataSource row.
 * The caller is responsible for calling connector.close() when done.
 */
export function createConnector(source: DataSource): Connector {
    const config = parseDataSourceConfig(source.config, source.type);

    if (source.type === 'sqlite' && 'path' in config) {
        return new SqliteConnector(resolveSourcePath(config.path));
    }

    if (source.type === 'csv' && 'dbPath' in config) {
        return new SqliteConnector(resolveSourcePath(config.dbPath));
    }

    throw new ConnectorError(`Unknown data source type: ${String(source.type)}`, 'UNKNOWN_TYPE');
}

function resolveSourcePath(filePath: string): string {
    const resolvedPath = path.resolve(process.cwd(), filePath);
    if (!fs.existsSync(resolvedPath)) {
        throw new ConnectorError('Data source file was not found.', 'SOURCE_NOT_FOUND');
    }

    try {
        const allowedDirectory = fs.realpathSync(DATA_DIR);
        if (!isWithinDirectory(allowedDirectory, resolvedPath)) {
            throw new Error();
        }

        const canonicalPath = fs.realpathSync(resolvedPath);
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
