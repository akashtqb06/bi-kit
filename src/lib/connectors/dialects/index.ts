export * from './types';
export * from './sqlite';
export * from './postgres';
export * from './mysql';
export * from './mssql';

import { sqliteDialect } from './sqlite';
import { postgresDialect } from './postgres';
import { mysqlDialect } from './mysql';
import { mssqlDialect } from './mssql';
import type { SqlDialect } from './types';

export function getDialect(nameOrType?: string): SqlDialect {
    switch (nameOrType?.toLowerCase()) {
        case 'postgres':
        case 'postgresql':
        case 'pg':
            return postgresDialect;
        case 'mysql':
        case 'mariadb':
            return mysqlDialect;
        case 'mssql':
        case 'sqlserver':
            return mssqlDialect;
        case 'sqlite':
        case 'csv':
        case 'excel':
        default:
            return sqliteDialect;
    }
}
