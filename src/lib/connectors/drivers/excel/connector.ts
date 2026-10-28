import { SqliteConnector } from '../sqlite/connector';
import type { ConnectorContext } from '../../types';
import type { ExcelConfig } from './definition';

export class ExcelConnector extends SqliteConnector {
    constructor(config: ExcelConfig | string, ctx?: ConnectorContext) {
        if (typeof config === 'string') {
            super(config, ctx);
        } else {
            const rawPath = config.managedPath || config.path;
            super({ managedPath: rawPath, ...config }, ctx);
        }
    }
}
