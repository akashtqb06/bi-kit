import { SqliteConnector } from '../sqlite/connector';
import type { ConnectorContext } from '../../types';
import type { CsvConfig } from './definition';

export class CsvConnector extends SqliteConnector {
    constructor(config: CsvConfig | string, ctx?: ConnectorContext) {
        if (typeof config === 'string') {
            super(config, ctx);
        } else {
            const rawPath = config.managedPath || config.dbPath || config.path;
            super({ managedPath: rawPath, ...config }, ctx);
        }
    }
}
